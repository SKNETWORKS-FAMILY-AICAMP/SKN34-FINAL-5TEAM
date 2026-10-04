"""모집공고문에서 계약금 숫자만 읽는다.

10%로 채우지 않는다. 1차 계약금은 총액이 아니므로 저장하지 않는다.
요약 페이지에 파일도 숫자도 없으면 칸을 비워 둔다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.listing import Listing

_PCT = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_MAN_WON = re.compile(r"(\d{1,3}(?:,\d{3})+|\d+)\s*만\s*원")
_WON = re.compile(r"(\d{1,3}(?:,\d{3})+)\s*원")
_HREF = re.compile(r"""href=["']([^"']+)["']""", re.I)
_FILE = re.compile(r"\.pdf(?:$|\?)|fileDown|atchmnfl|atchFile|download", re.I)
_TAG = re.compile(r"<[^>]+>")

BATCH_LIMIT = 20


@dataclass
class DepositFacts:
    rate: float | None = None
    amount_won: int | None = None
    status: str | None = None


def _slice_after_deposit(line: str) -> str:
    idx = line.find("계약금")
    if idx < 0:
        return ""
    first = line.find("1차")
    if first != -1 and first < idx:
        return ""
    tail = line[idx:idx + 48]
    cut = tail.find("1차")
    if cut > 0:
        tail = tail[:cut]
    for stop in ("중도금", "잔금"):
        stop_at = tail.find(stop)
        if stop_at > 0:
            tail = tail[:stop_at]
    return tail


def parse_deposit_text(text: str) -> DepositFacts | None:
    """공고문 글자에서 계약금 총액 숫자만 꺼낸다. 글자가 없으면 None."""
    if not text or not text.strip():
        return None
    lines = [line.strip() for line in re.split(r"[\n\r]+", text) if "계약금" in line]
    if not lines:
        return DepositFacts(status="none")

    rates: list[float] = []
    amounts: list[int] = []
    later = False
    for line in lines:
        piece = _slice_after_deposit(line)
        if not piece:
            continue
        if "추후공지" in piece or "미정" in piece:
            later = True
            continue
        for match in _PCT.finditer(piece):
            rates.append(float(match.group(1)) / 100)
        for match in _MAN_WON.finditer(piece):
            amounts.append(int(match.group(1).replace(",", "")) * 10_000)
        for match in _WON.finditer(piece):
            amounts.append(int(match.group(1).replace(",", "")))

    if len(set(rates)) == 1:
        return DepositFacts(rate=rates[0])
    if len(set(rates)) > 1:
        return DepositFacts(status="none")
    if len(set(amounts)) == 1:
        return DepositFacts(amount_won=amounts[0])
    if later:
        return DepositFacts(status="later")
    return DepositFacts(status="none")


def find_notice_files(html: str, base_url: str) -> list[str]:
    found: list[str] = []
    for match in _HREF.finditer(html or ""):
        href = match.group(1).strip()
        if not href or not _FILE.search(href):
            continue
        url = urljoin(base_url, href)
        if url not in found:
            found.append(url)
    return found


def _html_text(html: str) -> str:
    return _TAG.sub(" ", html or "")


def _pdf_text(content: bytes) -> str:
    from io import BytesIO

    from pypdf import PdfReader

    reader = PdfReader(BytesIO(content))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def read_notice(url: str, client: httpx.Client | None = None) -> DepositFacts | None:
    """주소에서 모집공고 파일을 찾아 계약금 숫자를 읽는다. 파일이 없으면 None."""
    if not url:
        return None
    own_client = client is None
    http = client or httpx.Client(timeout=20.0, follow_redirects=True)
    try:
        if _FILE.search(url):
            response = http.get(url)
            response.raise_for_status()
            text = _pdf_text(response.content) if url.lower().split("?")[0].endswith(".pdf") else response.text
            return parse_deposit_text(text)

        response = http.get(url)
        response.raise_for_status()
        html = response.text
        files = find_notice_files(html, url)
        for file_url in files:
            file_response = http.get(file_url)
            file_response.raise_for_status()
            if file_url.lower().split("?")[0].endswith(".pdf") or file_response.headers.get("content-type", "").startswith("application/pdf"):
                facts = parse_deposit_text(_pdf_text(file_response.content))
            else:
                facts = parse_deposit_text(_html_text(file_response.text))
            if facts is not None and (facts.rate is not None or facts.amount_won is not None or facts.status == "later"):
                return facts
        page_facts = parse_deposit_text(_html_text(html))
        if page_facts is not None and (page_facts.rate is not None or page_facts.amount_won is not None or page_facts.status == "later"):
            return page_facts
        if files and page_facts is not None and page_facts.status == "none":
            return page_facts
        return None
    except Exception:
        return None
    finally:
        if own_client:
            http.close()


def _apply_facts(rows: list[Listing], facts: DepositFacts) -> None:
    for row in rows:
        row.deposit_rate = facts.rate
        row.deposit_amount_won = facts.amount_won
        row.deposit_status = facts.status


def sync_missing_deposits(db: Session | None = None, limit: int = BATCH_LIMIT) -> int:
    """비율과 총액, 상태가 모두 비어 있는 공고만 읽는다."""
    own_session = db is None
    session = db or SessionLocal()
    updated = 0
    try:
        rows = (
            session.query(Listing)
            .filter(
                Listing.deposit_rate.is_(None),
                Listing.deposit_amount_won.is_(None),
                Listing.deposit_status.is_(None),
            )
            .order_by(Listing.id)
            .all()
        )
        seen: set[str] = set()
        targets: list[tuple[str, str]] = []
        for row in rows:
            url = row.pblanc_url or row.notice_url
            if not url or row.external_id in seen:
                continue
            seen.add(row.external_id)
            targets.append((row.external_id, url))
            if len(targets) >= limit:
                break

        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            for external_id, url in targets:
                facts = read_notice(url, client)
                if facts is None:
                    continue
                group = [row for row in rows if row.external_id == external_id]
                _apply_facts(group, facts)
                updated += len(group)
        if updated:
            session.commit()
        return updated
    except Exception:
        session.rollback()
        return updated
    finally:
        if own_session:
            session.close()
