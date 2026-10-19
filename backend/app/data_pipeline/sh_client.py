"""SH(서울주택도시공사) 분양·임대 게시판. Open API가 없어 공개 목록·상세 HTML을 읽는다.

- 목록: 글 번호, 제목, 담당 부서, 등록일, 조회수 (페이지당 10건)
- 상세: 첨부파일 이름, 본문 텍스트
처음 한 번은 전체(약 2,600건)를 받고, 이후에는 새 글이 있는 앞쪽 페이지만 읽어서 새 글의 상세 페이지만 읽는다.
서버에 부담을 주지 않도록 요청 사이에 쉬는 시간을 둔다. DB 저장은 save_listings.py에서 한다.
"""

from __future__ import annotations

import logging
import html as html_lib
import json
import re
import time

import httpx

from app.data_pipeline.applyhome_client import parse_date

logger = logging.getLogger(__name__)

SH_ORIGIN = "https://www.i-sh.co.kr"
USER_AGENT = "cheongyak-platform/0.1 (public SH notice list ingest)"
REQUEST_INTERVAL = 0.4

SH_BOARDS = (
    {"label": "분양", "program": "S1T294C296", "board": "m_244", "multi_itm_seq": "1"},
    {"label": "임대", "program": "S1T294C297", "board": "m_247", "multi_itm_seq": "2"},
)

_ROW_RE = re.compile(
    r"<td>\s*(\d+)\s*</td>.*?getDetailView\('(\d+)'\);return false;\"\s*>\s*(.*?)</a>"
    r".*?<td>\s*(.*?)\s*</td>.*?<td class=\"num\">\s*([\d-]+)\s*</td>\s*<td class=\"num\">\s*(\d+)\s*</td>",
    re.S,
)
_ATTACHMENT_RE = re.compile(r"existFile\('\d+'\); return false;\">\s*(.*?)\s*</a>", re.S)
_DOWNLIST_RE = re.compile(r"initParam\.downList\s*=\s*(\[.*?\]);", re.S)
# 첨부파일 원본 다운로드 주소 (홈페이지 innorix.config.js의 downUrl)
DOWNLOAD_URL = SH_ORIGIN + "/com/file/innoFD.do?brdId={brdId}&seq={seq}&fileTp={fileTp}&fileSeq={fileSeq}"
# 입주자 모집 공고 (당첨자 발표·경쟁률·계약·서류 안내 등은 제외)
RECRUIT_TITLE = re.compile(r"모집")
NOT_RECRUIT_TITLE = re.compile(r"당첨|발표|결과|경쟁률|계약|서류|명단|합격|선정|심사|현황|추첨|동호")


def _clean(text: str) -> str:
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text).replace("\x00", "")  # 일부 본문에 NUL 문자가 있어 Postgres가 거부함
    return re.sub(r"\s+", " ", text).strip()


def _url(board: dict, page: str) -> str:
    return f"{SH_ORIGIN}/app/lay2/program/{board['program']}/www/brd/{board['board']}/{page}.do"


def _list_page(client: httpx.Client, board: dict, page: int) -> list[dict]:
    response = client.get(_url(board, "list"), params={"multi_itm_seq": board["multi_itm_seq"], "page": page})
    if response.status_code >= 400:
        logger.warning(f"[SH] HTTP {response.status_code} {board['label']} {page}")
        return []
    body = response.text[response.text.find("<tbody"):response.text.find("</tbody>")]
    rows = []
    for m in _ROW_RE.finditer(body):
        rows.append({
            "board": board["label"],
            "seq": m.group(2),
            "number": int(m.group(1)),
            "title": _clean(m.group(3))[:500],
            "department": _clean(m.group(4))[:100] or None,
            "posted_date": parse_date(m.group(5)),
            "views": int(m.group(6)),
            "url": f"{_url(board, 'view')}?seq={m.group(2)}&multi_itm_seq={board['multi_itm_seq']}",
        })
    return rows


def attachment_links(page: str) -> list[dict] | None:
    """상세 페이지의 initParam.downList → [{"name": 파일명, "url": 원본 다운로드 주소}]"""
    match = _DOWNLIST_RE.search(page)
    if not match:
        return None
    try:
        files = json.loads(match.group(1))
    except ValueError:
        return None
    return [{"name": f.get("oriFileNm"), "url": DOWNLOAD_URL.format(**f)} for f in files if f.get("fileSeq")] or None


def fetch_attachment_links(url: str) -> list[dict] | None:
    with httpx.Client(timeout=40.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
        return attachment_links(client.get(url).text)


def is_recruitment(title: str) -> bool:
    return bool(RECRUIT_TITLE.search(title or "")) and not NOT_RECRUIT_TITLE.search(title or "")


def _detail(client: httpx.Client, url: str) -> dict:
    page = client.get(url).text
    attachments = [_clean(a) for a in _ATTACHMENT_RE.findall(page)]
    table = page[page.find("<caption>"):]
    table = table[:table.find("</table>")]
    last_attachment = table.rfind("미리보기")
    body = _clean(table[last_attachment:] if last_attachment > 0 else table)
    body = re.sub(r"^미리보기\s*", "", body)
    return {"attachments": attachments or None, "attachment_count": len(attachments), "body_text": body or None,
            "attachment_links": attachment_links(page)}


def fetch_sh_notices(known_seqs: set[tuple[str, str]], max_pages: int | None = None) -> list[dict]:
    """게시판 전체(또는 max_pages까지) 목록을 읽고, known_seqs에 없는 글만 상세 페이지까지 읽는다.

    known_seqs: DB에 이미 본문까지 저장된 (board, seq). 이미 있는 글은 목록 값(제목·조회수)만 갱신한다.
    """
    notices: list[dict] = []
    try:
        with httpx.Client(timeout=40.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
            for board in SH_BOARDS:
                page = 1
                while max_pages is None or page <= max_pages:
                    rows = _list_page(client, board, page)
                    time.sleep(REQUEST_INTERVAL)
                    if not rows:
                        break
                    new_rows = [r for r in rows if (r["board"], r["seq"]) not in known_seqs]
                    for row in new_rows:
                        row.update(_detail(client, row["url"]))
                        time.sleep(REQUEST_INTERVAL)
                    notices.extend(rows)
                    page += 1
                    # 최신 글이 앞에 오므로, 한 페이지가 모두 이미 저장된 글이면 그 뒤도 이미 있다
                    if not new_rows and known_seqs:
                        break
                logger.info(f"[SH] {board['label']} 게시판 {page - 1}페이지")
    except httpx.HTTPError as exc:
        logger.warning(f"[SH] 호출 실패 {exc.__class__.__name__}")
    logger.info(f"[SH] 글 {len(notices)}건 (상세 새로 읽음 {sum('body_text' in n for n in notices)}건)")
    return notices
