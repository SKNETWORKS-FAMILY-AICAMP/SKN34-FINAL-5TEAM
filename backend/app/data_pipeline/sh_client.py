"""SH(서울주택도시공사) 공고 게시판. Open API가 없어 공개 목록 HTML을 읽는다."""

from __future__ import annotations

import html as html_lib
import re
import time
from datetime import date

import httpx

SH_ORIGIN = "https://www.i-sh.co.kr"
USER_AGENT = "cheongyak-platform/0.1 (public SH notice list ingest)"

# 문서에 적힌 게시판. 페이지당 10건, page 로 넘김.
SH_BOARDS = (
    {
        "label": "SH분양",
        "path": "/app/lay2/program/S1T294C296/www/brd/m_244/list.do",
        "view_path": "/app/lay2/program/S1T294C296/www/brd/m_244/view.do",
        "multi_itm_seq": "1",
    },
    {
        "label": "SH임대",
        "path": "/app/lay2/program/S1T294C297/www/brd/m_247/list.do",
        "view_path": "/app/lay2/program/S1T294C297/www/brd/m_247/view.do",
        "multi_itm_seq": "2",
    },
)

_DETAIL_RE = re.compile(
    r"getDetailView\('(\d+)'\);return false;\"\s*>\s*([^<]+)</a>",
    re.S,
)
_DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")


def fetch_sh_listings(max_pages: int = 3) -> list[dict]:
    listings: list[dict] = []
    seen: set[str] = set()
    try:
        with httpx.Client(timeout=40.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
            for board in SH_BOARDS:
                for page in range(1, max_pages + 1):
                    print("SH 수집", board["label"], "page", page, flush=True)
                    rows = _fetch_board_page(client, board, page)
                    time.sleep(0.4)
                    if not rows:
                        break
                    for row in rows:
                        if row["external_id"] in seen:
                            continue
                        seen.add(row["external_id"])
                        listings.append(row)
    except httpx.HTTPError as exc:
        print("SH: 목록 호출 실패", exc.__class__.__name__, flush=True)
    print("SH 공고", len(listings), "개", flush=True)
    return listings


def _fetch_board_page(client: httpx.Client, board: dict, page: int) -> list[dict]:
    response = client.get(
        f"{SH_ORIGIN}{board['path']}",
        params={"multi_itm_seq": board["multi_itm_seq"], "page": page},
    )
    if response.status_code >= 400:
        print("SH: HTTP", response.status_code, board["label"], flush=True)
        return []
    return _parse_list_html(response.text, board)


def _parse_list_html(page_html: str, board: dict) -> list[dict]:
    rows: list[dict] = []
    for match in _DETAIL_RE.finditer(page_html):
        seq = match.group(1)
        title = html_lib.unescape(re.sub(r"\s+", " ", match.group(2))).strip()
        if not title:
            continue
        tail = page_html[match.end() : match.end() + 1200]
        posted = None
        date_match = _DATE_RE.search(tail)
        if date_match:
            parts = date_match.group(1).split("-")
            try:
                posted = date(int(parts[0]), int(parts[1]), int(parts[2]))
            except ValueError:
                posted = None
        rows.append(
            {
                "external_id": f"sh-{seq}"[:50],
                "complex_name": title[:255],
                "address": "서울특별시",
                "notice_url": (
                    f"{SH_ORIGIN}{board['view_path']}"
                    f"?seq={seq}&multi_itm_seq={board['multi_itm_seq']}"
                ),
                "region_code": "seoul",
                "supply_type": board["label"],
                "sale_price": None,
                "unit_size_sqm": None,
                "unit_count": 0,
                "announce_date": posted,
            }
        )
    return rows
