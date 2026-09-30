"""SH(서울주택도시공사) 공고 게시판. Open API가 없어 공개 목록 HTML을 읽는다.

게시판에는 청약 공고 외에 입주·등기 안내 같은 공지도 섞여 있고, 금액·면적은 첨부 공고문 안에만 있다.
DB 저장은 save_listings.py에서 한다.
"""

from __future__ import annotations

import html as html_lib
import re
import time

import httpx

from app.data_pipeline.applyhome_client import parse_date

SH_ORIGIN = "https://www.i-sh.co.kr"
USER_AGENT = "cheongyak-platform/0.1 (public SH notice list ingest)"

SH_BOARDS = (
    {
        "label": "분양",
        "path": "/app/lay2/program/S1T294C296/www/brd/m_244/list.do",
        "view_path": "/app/lay2/program/S1T294C296/www/brd/m_244/view.do",
        "multi_itm_seq": "1",
    },
    {
        "label": "임대",
        "path": "/app/lay2/program/S1T294C297/www/brd/m_247/list.do",
        "view_path": "/app/lay2/program/S1T294C297/www/brd/m_247/view.do",
        "multi_itm_seq": "2",
    },
)

_DETAIL_RE = re.compile(r"getDetailView\('(\d+)'\);return false;\"\s*>\s*([^<]+)</a>", re.S)
_DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")


def fetch_sh_listings(max_pages: int = 5) -> list[dict]:
    listings: list[dict] = []
    seen: set[str] = set()
    try:
        with httpx.Client(timeout=40.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
            for board in SH_BOARDS:
                for page in range(1, max_pages + 1):
                    rows = _fetch_board_page(client, board, page)
                    time.sleep(0.4)
                    if not rows:
                        break
                    for row in rows:
                        if row["external_id"] not in seen:
                            seen.add(row["external_id"])
                            listings.append(row)
    except httpx.HTTPError as exc:
        print("[SH] 목록 호출 실패", exc.__class__.__name__, flush=True)
    print(f"[SH] 공고 {len(listings)}건", flush=True)
    return listings


def _fetch_board_page(client: httpx.Client, board: dict, page: int) -> list[dict]:
    response = client.get(
        f"{SH_ORIGIN}{board['path']}",
        params={"multi_itm_seq": board["multi_itm_seq"], "page": page},
    )
    if response.status_code >= 400:
        print("[SH] HTTP", response.status_code, board["label"], flush=True)
        return []
    return _parse_list_html(response.text, board)


def _parse_list_html(page_html: str, board: dict) -> list[dict]:
    rows: list[dict] = []
    for match in _DETAIL_RE.finditer(page_html):
        seq = match.group(1)
        title = html_lib.unescape(re.sub(r"\s+", " ", match.group(2))).strip()
        if not title:
            continue
        date_match = _DATE_RE.search(page_html[match.end(): match.end() + 1200])
        rows.append({
            "source": "sh",
            "external_id": seq,
            "model_no": None,
            "unit_type": None,
            "house_type": f"SH {board['label']}",
            "complex_name": title[:255],
            "region_code": "100",
            "region_name": "서울",
            "supply_type": f"SH {board['label']}",
            "notice_url": f"{SH_ORIGIN}{board['view_path']}?seq={seq}&multi_itm_seq={board['multi_itm_seq']}",
            "recruit_date": parse_date(date_match.group(1)) if date_match else None,
            "unit_count": 0,
        })
    return rows
