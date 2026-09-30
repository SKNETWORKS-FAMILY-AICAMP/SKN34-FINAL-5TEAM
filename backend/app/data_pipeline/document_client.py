"""공고문 PDF에서 계약금을 읽는다. DB 저장은 save_listings.py에서 한다.

공고문 위치
  - 청약홈: 공고 상세 페이지(listings.notice_url)의 "공고문 보기" 링크 (static.applyhome.co.kr/.../getAtchmnfl.do)
  - LH: 상세정보 API의 첨부파일 목록(lh_notice_details.detail -> dsAhflInfo) 중 공고문 PDF

계약금 찾는 규칙 (우선순위 순, 2026-10 LH·청약홈 공고문으로 확인)
  1) 표: 한 줄에 연속한 숫자 a, b, c가 "b + c = a" (계 = 계약금 + 잔금)이면 b가 계약금. 주로 임대 공고.
     a가 100만보다 작으면 천원 단위 표로 보고 1,000을 곱한다 (예: 18,551 500 18,051 → 계약금 50만원).
     원으로 바꾼 뒤 계 100만원 미만 또는 계약금 10만원 미만이면 금액 표가 아닌 것(세대수 등)으로 보고 버린다.
  2) 정액: "계약금 1,000만원 정액", "계약금(50만원)"
  3) 비율: "계약금(10%)", "계약시(20%)" → 분양가 또는 임대보증금 x 비율
"""

from __future__ import annotations

import io
import re
from collections import Counter
from datetime import date

import httpx
import pdfplumber

MAX_PAGES = 30
MAX_BYTES = 40 * 1024 * 1024
# 표 규칙 하한: 세대수 표(예: "3 1 2")가 천원 단위 금액으로 잘못 읽히는 것을 막는다
MIN_TOTAL = 1_000_000
MIN_CONTRACT = 100_000
SKIP_NAMES = ("팸플릿", "팜플렛", "안내문", "목록", "양식", "동의서", "신청서", "카탈로그", "배치도", "평면")

_NUMBER = re.compile(r"^\d{1,3}(,\d{3})+$|^\d+$")
_LABEL = re.compile(r"\d")
_FIXED = re.compile(r"계약금\s*[\(（\[]?\s*([\d,]+)\s*(만원|천원)")
_RATIO = re.compile(r"(?:계약금|계약시)\s*[\(（\[]?\s*(\d{1,2}(?:\.\d+)?)\s*%")
_APPLYHOME_DOC = re.compile(r"https://static\.applyhome\.co\.kr/ai/aia/getAtchmnfl\.do\?[^\"'\s<>]+")


# ---------- 공고문 찾기·읽기 ----------

def lh_document(detail: dict | None) -> tuple[str | None, str | None]:
    files = [f for f in (detail or {}).get("dsAhflInfo") or [] if str(f.get("CMN_AHFL_NM", "")).lower().endswith(".pdf")]
    usable = [f for f in files if not any(word in f["CMN_AHFL_NM"] for word in SKIP_NAMES)]
    ranked = sorted(usable or files, key=lambda f: "공고" not in f["CMN_AHFL_NM"])
    return (ranked[0]["CMN_AHFL_NM"], ranked[0].get("AHFL_URL")) if ranked else (None, None)


def sh_document(links: list[dict] | None) -> tuple[str | None, str | None]:
    files = [f for f in links or [] if str(f.get("name", "")).lower().endswith(".pdf")]
    usable = [f for f in files if not any(word in f["name"] for word in SKIP_NAMES)]
    ranked = sorted(usable or files, key=lambda f: "공고" not in f["name"])
    return (ranked[0]["name"], ranked[0]["url"]) if ranked else (None, None)


_DATE = r"(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})"
_DATE_NO_YEAR = r"(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})"
_PERIOD = re.compile(
    r"(?:(?:접수|신청)\s*(?:기간|일시|일정|기한)|청약\s*접수|신청\s*접수|방문\s*접수|인터넷\s*접수)"
    r"[^0-9~]{0,40}" + _DATE + r"(?:(?:[^~∼0-9]|\d{1,2}:\d{2}){0,20}[~∼]\s*" + _DATE_NO_YEAR + r")?"
)
MAX_RECEIPT_DAYS = 60


def receipt_period(text: str) -> tuple[date | None, date | None]:
    """"접수기간: 2026. 10. 2.(목) 10:00 ~ 10. 8.(수)" 같은 문장에서 접수 기간.

    "시작 ~ 끝"이 있는 문장을 먼저 쓰고, 없으면 날짜 하나만 있는 첫 문장(하루 접수)을 쓴다.
    """
    single = None
    for m in _PERIOD.finditer(text or ""):
        try:
            start = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            end = date(int(m.group(4) or m.group(1)), int(m.group(5)), int(m.group(6))) if m.group(5) else None
        except ValueError:
            continue
        if end and 0 <= (end - start).days <= MAX_RECEIPT_DAYS:
            return start, end
        if end is None and single is None:
            single = (start, start)
    return single or (None, None)


def applyhome_document(notice_url: str | None, client: httpx.Client) -> tuple[str | None, str | None]:
    if not notice_url:
        return None, None
    match = _APPLYHOME_DOC.search(client.get(notice_url).text)
    return ("공고문", match.group(0).replace("&amp;", "&")) if match else (None, None)


def read_pdf(url: str, client: httpx.Client) -> tuple[str, int]:
    response = client.get(url)
    response.raise_for_status()
    if not response.content.startswith(b"%PDF"):
        raise ValueError("PDF가 아님")
    if len(response.content) > MAX_BYTES:
        raise ValueError("파일이 너무 큼")
    with pdfplumber.open(io.BytesIO(response.content)) as pdf:
        pages = pdf.pages[:MAX_PAGES]
        text = "\n".join(page.extract_text() or "" for page in pages)
        return text.replace("\x00", ""), len(pdf.pages)


# ---------- 계약금 추출 ----------

def _number(token: str) -> int | None:
    return int(token.replace(",", "")) if _NUMBER.match(token) else None


def table_entries(text: str) -> list[dict]:
    """"계약금 + 잔금 = 계"가 맞는 연속 숫자 3개를 찾아 주택형 표기와 함께 반환."""
    entries = []
    for line in text.splitlines():
        tokens = line.split()
        values = [_number(t) for t in tokens]
        for i in range(len(tokens) - 2):
            total, contract, balance = values[i], values[i + 1], values[i + 2]
            if not (total and contract and balance is not None):
                continue
            if abs(contract + balance - total) > 1 or not 0.01 <= contract / total <= 0.5:
                continue
            # 주택형 표기: 숫자가 섞인 글자(46A, 51일반) 또는 쉼표 없는 작은 숫자(55 = 전용 55㎡)
            label = next((tokens[j] for j in range(i - 1, max(i - 4, -1), -1)
                          if (values[j] is None and _LABEL.search(tokens[j]))
                          or (values[j] is not None and values[j] < 1000 and "," not in tokens[j])), None)
            scale = 1000 if total < 1_000_000 else 1
            if total * scale < MIN_TOTAL or contract * scale < MIN_CONTRACT:
                continue
            entries.append({"label": label, "contract": contract * scale,
                            "total": total * scale, "balance": balance * scale})
    return entries


def fixed_amount(text: str) -> int | None:
    amounts = [int(n.replace(",", "")) * (10000 if unit == "만원" else 1000) for n, unit in _FIXED.findall(text)]
    amounts = [a for a in amounts if 100_000 <= a <= 500_000_000]
    return Counter(amounts).most_common(1)[0][0] if amounts else None


def ratio_percent(text: str) -> float | None:
    ratios = [float(r) for r in _RATIO.findall(text) if 1 <= float(r) <= 50]
    return Counter(ratios).most_common(1)[0][0] if ratios else None


def _first_number(label: str | None) -> float | None:
    match = re.search(r"\d+(?:\.\d+)?", label or "")
    return float(match.group()) if match else None


def match_entry(unit_type: str | None, entries: list[dict]) -> dict | None:
    """listings.unit_type(예: 46, 084.9972A)과 공고문 표기(예: 46A, 84A)를 연결한다."""
    if not unit_type or not entries:
        return None
    key = unit_type.replace(" ", "")
    exact = [e for e in entries if e["label"] and e["label"].replace(" ", "") == key]
    if exact:
        return min(exact, key=lambda e: e["contract"])
    number = _first_number(unit_type)
    same = [e for e in entries if number is not None and _first_number(e["label"]) is not None
            and int(_first_number(e["label"])) == int(number)]
    return min(same, key=lambda e: e["contract"]) if same else None


def listing_costs(text: str, listings: list[dict]) -> list[dict]:
    """공고문 텍스트 + 그 공고의 listings 행들 → 행마다 계약금 (못 구하면 빼고 반환)."""
    entries = table_entries(text)
    fixed = fixed_amount(text)
    ratio = ratio_percent(text)
    costs = []
    for row in listings:
        base = {"source": row["source"], "external_id": row["external_id"], "model_no": row["model_no"],
                "contract_deposit": None, "contract_ratio": None, "deposit_total": None, "balance": None,
                "method": None, "doc_label": None}
        entry = match_entry(row.get("unit_type"), entries)
        if entry:
            base.update(contract_deposit=entry["contract"], deposit_total=entry["total"], balance=entry["balance"],
                        doc_label=(entry["label"] or "")[:50] or None, method="공고문 표",
                        contract_ratio=round(entry["contract"] * 100 / entry["total"], 2))
        elif entries:
            low = min(entries, key=lambda e: e["contract"])
            base.update(contract_deposit=low["contract"], deposit_total=low["total"], balance=low["balance"],
                        doc_label=(low["label"] or "")[:50] or None, method="공고문 표·최솟값")
        elif fixed:
            base.update(contract_deposit=fixed, method="공고문 정액")
        elif ratio:
            price = row.get("sale_price") or row.get("rent_deposit")
            if price:
                base.update(contract_deposit=round(float(price) * ratio / 100), contract_ratio=ratio, method="공고문 비율")
        if base["method"]:
            costs.append(base)
    return costs
