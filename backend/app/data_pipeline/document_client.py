"""공고문 PDF에서 계약금을 읽는다. DB 저장은 save_listings.py에서 한다.

공고문 위치
  - 청약홈: 공고 상세 페이지(listings.notice_url)의 "공고문 보기" 링크 (static.applyhome.co.kr/.../getAtchmnfl.do)
  - LH: 상세정보 API의 첨부파일 목록(lh_notice_details.detail -> dsAhflInfo) 중 공고문 PDF

  - SH: 게시글 첨부파일(sh_notices.attachment_links) 중 공고문 PDF
  공고문과 같이 읽는 첨부: LH "공급가격" PDF(매각 공고의 호별 계약금 표), SH "주택목록(상세)" PDF(호별 임대보증금)

계약금 찾는 규칙 (우선순위 순, 2026-10 LH·청약홈·SH 공고문으로 확인)
  1) 표: 한 줄의 연속한 금액이 "계 = 계약금 + 잔금"이면 계약금. 칸 순서는 "계 계약금 잔금", "계약금 잔금 계",
     "계약금 할부금 잔금 계" 세 가지. 계가 100만보다 작으면 천원 단위 표로 보고 1,000을 곱한다
     (예: 18,551 500 18,051 → 계약금 50만원). 원으로 바꾼 뒤 계 100만원 미만 또는 계약금 10만원 미만이면
     금액 표가 아닌 것(세대수 등)으로 보고 버린다.
  2) 정액: "계약금 1,000만원 정액", "계약금(50만원)", "계약금[주택가격(1천만원)]", 파일명 "(계약금500만원)"
  3) 비율: "계약금(10%)", "계약시(20%)" → 분양가 또는 임대보증금 x 비율
  4) 계약금 규정 없이 보증금만 있는 임대 (fallback_cost): 주택목록·임대조건 표의 임대보증금 최솟값,
     전세임대는 본인부담 임대보증금(정액) 또는 "주택 선택 후 결정", 매입임대는 "배정 시 안내"
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
PRICE_TOLERANCE = 0.1  # 분양 행: 표의 계가 분양가 ±10% 안일 때만 그 표를 계약금 표로 본다
MAX_SALE_RATIO = 0.2  # 분양 계약금은 보통 분양가의 5~20%
MIN_SALE_RATIO = 0.01  # 분양 행의 정액 계약금이 분양가의 1% 미만이면 다른 비용(옵션 등)으로 보고 쓰지 않는다
SKIP_NAMES = ("팸플릿", "팜플렛", "안내문", "목록", "양식", "동의서", "신청서", "카탈로그", "배치도", "평면")

_NUMBER = re.compile(r"^\d{1,3}(,\d{3})+$|^\d+$")
_LABEL = re.compile(r"\d")
_FIXED = re.compile(r"계약금[^\d\n%]{0,12}?(\d[\d,]*)\s*(천만원|백만원|만원|천원)")
_UNITS = {"천만원": 10_000_000, "백만원": 1_000_000, "만원": 10_000, "천원": 1_000}
_OPTION_COST = re.compile(r"발코니|확장|옵션|선택품목")
# 계약금 규정 없이 임대보증금만 있는 표: SH 주택목록 "… 재공급 19,530,000 …", 임대조건 "13형 13.25 1,090,000 …"
_LISTED_DEPOSIT = re.compile(r"(?:신규|재공급)\s+(\d{1,3}(?:,\d{3}){2,})(?!\d)"
                             r"|(?:^|\s)\d+[A-Z]?형\s+\d+\.\d+(?:~\d+\.\d+)?\s+(\d{1,3}(?:,\d{3}){2,})(?!\d)", re.M)
_JEONSE_FIXED = re.compile(r"입주자\s*부담\)?[^\n]*\n[-\s]*임대보증금\s*:\s*(\d[\d,]*)\s*만원")
_JEONSE_RATIO = re.compile(r"임대보증금\s*:\s*[^\n]{0,20}전세보증금의\s*(\d{1,2})\s*%")
NO_AMOUNT_METHODS = ("배정 시 안내", "주택 선택 후 결정")
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


def lh_extra_documents(detail: dict | None) -> list[tuple[str, str]]:
    """공고문과 같이 읽을 LH 첨부 PDF: 매각 공고의 "붙임1 공급대상 및 공급가격" (호별 계약금 표)"""
    return [(f["CMN_AHFL_NM"], f["AHFL_URL"]) for f in (detail or {}).get("dsAhflInfo") or []
            if str(f.get("CMN_AHFL_NM", "")).lower().endswith(".pdf") and "공급가격" in f["CMN_AHFL_NM"]
            and f.get("AHFL_URL")]


def sh_extra_documents(links: list[dict] | None) -> list[tuple[str, str]]:
    """공고문과 같이 읽을 SH 첨부 PDF: "주택목록(상세)" (없으면 "주택목록") — 매입임대의 호별 임대보증금"""
    lists = [f for f in links or [] if str(f.get("name", "")).lower().endswith(".pdf") and "주택목록" in f["name"]]
    detailed = [f for f in lists if "상세" in f["name"]]
    return [(f["name"], f["url"]) for f in (detailed or lists)[:1]]


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


_GLUED_PIECE = re.compile(r"\d{1,3}(?:,\d{3})+|\d+\.\d{2}|\d+")


def _split_glued(token: str) -> list[str]:
    """두 단 편집 PDF에서 붙어 나온 숫자를 나눈다: "28,8661,443" → ["28,866", "1,443"]."""
    if _NUMBER.match(token) or not re.search(r"\d,\d{3}", token):
        return [token]
    pieces = _GLUED_PIECE.findall(token)
    return pieces if len(pieces) > 1 and "".join(pieces) == token else [token]


# 한 줄 안에서 금액 칸의 순서 (index 0이 계약금 위치를 가리킴)
#   계 계약금 잔금 / 계약금 잔금 계 / 계약금 할부금(중도금) 잔금 계
_LAYOUTS = (
    (3, lambda v: (v[1], v[0], v[1] + v[2] - v[0], v[2])),
    (3, lambda v: (v[0], v[2], v[0] + v[1] - v[2], v[1])),
    (4, lambda v: (v[0], v[3], v[0] + v[1] + v[2] - v[3], v[3] - v[0])),
)


def table_entries(text: str) -> list[dict]:
    """계 = 계약금 + 잔금(+ 할부금)이 맞는 연속 숫자를 찾아 주택형 표기와 함께 반환.

    칸 순서는 "계 계약금 잔금", "계약금 잔금 계", "계약금 할부금 잔금 계" 세 가지를 본다.
    """
    entries = []
    for line in text.splitlines():
        tokens = [piece for token in line.split() for piece in _split_glued(token)]
        values = [_number(t) for t in tokens]
        i = 0
        while i < len(tokens):
            for width, pick in _LAYOUTS:
                window = values[i:i + width]
                if len(window) < width or any(v is None for v in window) or not all(window[:-1]):
                    continue
                contract, total, diff, balance = pick(window)
                if abs(diff) > 1 or not total or not 0.01 <= contract / total <= 0.5:
                    continue
                scale = 1000 if total < 1_000_000 else 1
                if total * scale < MIN_TOTAL or contract * scale < MIN_CONTRACT:
                    continue
                # 주택형 표기: 숫자가 섞인 글자(46A, 51일반) 또는 쉼표 없는 작은 숫자(55 = 전용 55㎡)
                label = next((tokens[j] for j in range(i - 1, max(i - 4, -1), -1)
                              if (values[j] is None and _LABEL.search(tokens[j]))
                              or (values[j] is not None and values[j] < 1000 and "," not in tokens[j])), None)
                entries.append({"label": label, "contract": contract * scale,
                                "total": total * scale, "balance": balance * scale})
                i += width - 1
                break
            i += 1
    return entries


def fixed_amount(text: str) -> int | None:
    # "발코니확장비용 계약금(1백만원)", "추가선택품목 계약금"은 주택 계약금이 아니다
    amounts = [int(m.group(1).replace(",", "")) * _UNITS[m.group(2)] for m in _FIXED.finditer(text)
               if not _OPTION_COST.search(text[max(0, m.start() - 15):m.start()])]
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
    """공고문 텍스트 + 그 공고의 listings 행들 → 행마다 계약금 (못 구하면 빼고 반환).

    분양가가 있는 행은 표의 계가 분양가와 ±10% 안인 줄만 쓴다 (중도금·발코니 표 등을 계약금 표로 오인하지 않도록).
    주택형 표기로 연결되지 않으면 계가 분양가에 가장 가까운 줄을 쓴다.
    """
    all_entries = table_entries(text)
    fixed = fixed_amount(text)
    ratio = ratio_percent(text)
    costs = []
    for row in listings:
        base = {"source": row["source"], "external_id": row["external_id"], "model_no": row["model_no"],
                "contract_deposit": None, "contract_ratio": None, "deposit_total": None, "balance": None,
                "method": None, "doc_label": None}
        price = float(row["sale_price"]) if row.get("sale_price") else None
        # 분양가 = 대지비 + 건축비 같은 표를 피하려고 분양 행은 계약금 비율도 20% 이하만
        entries = [e for e in all_entries if price is None or (abs(e["total"] - price) <= price * PRICE_TOLERANCE
                                                                and e["contract"] <= e["total"] * MAX_SALE_RATIO)]
        entry = match_entry(row.get("unit_type"), entries)
        method = "공고문 표"
        if entry is None and entries and price:
            entry, method = min(entries, key=lambda e: abs(e["total"] - price)), "공고문 표(가격 일치)"
        if entry:
            base.update(contract_deposit=entry["contract"], deposit_total=entry["total"], balance=entry["balance"],
                        doc_label=(entry["label"] or "")[:50] or None, method=method,
                        contract_ratio=round(entry["contract"] * 100 / entry["total"], 2))
        elif entries:
            low = min(entries, key=lambda e: e["contract"])
            base.update(contract_deposit=low["contract"], deposit_total=low["total"], balance=low["balance"],
                        doc_label=(low["label"] or "")[:50] or None, method="공고문 표·최솟값")
        elif fixed and (price is None or fixed >= price * MIN_SALE_RATIO):
            base.update(contract_deposit=fixed, method="공고문 정액")
        elif ratio:
            price = row.get("sale_price") or row.get("rent_deposit")
            if price:
                base.update(contract_deposit=round(float(price) * ratio / 100), contract_ratio=ratio, method="공고문 비율")
        if base["method"]:
            costs.append(base)
    return costs


def listed_deposit(text: str) -> int | None:
    """계약금 규정 없이 호별·주택형별 임대보증금만 있는 표의 최솟값 (SH 주택목록, 공공기숙사 임대조건 등)"""
    amounts = [int((a or b).replace(",", "")) for a, b in _LISTED_DEPOSIT.findall(text or "")]
    amounts = [a for a in amounts if MIN_CONTRACT <= a <= 500_000_000]
    return min(amounts) if amounts else None


def fallback_cost(row: dict, text: str) -> dict | None:
    """공고문 표·정액·비율과 주택목록 엑셀로도 못 구한 행. 금액이 공고에 없으면 이유를 method로 남긴다.

    - 전세임대: 입주자가 집을 직접 구하므로 본인부담 임대보증금이 정액("임대보증금 : 100만원")이면 그 금액,
      "전세보증금의 5%"처럼 비율이면 금액 없이 "주택 선택 후 결정" (contract_ratio에 비율)
    - 임대보증금만 있는 표(SH 주택목록 등): 보증금 최솟값을 필요 자금으로
    - 매입임대: 주택을 나중에 배정하는 예비입주자 모집 등 → 금액 없이 "배정 시 안내"
    """
    base = {"source": row["source"], "external_id": row["external_id"], "model_no": row["model_no"],
            "contract_deposit": None, "contract_ratio": None, "deposit_total": None, "balance": None,
            "method": None, "doc_label": None}
    supply = row.get("supply_type") or ""
    if "전세임대" in supply:
        fixed = _JEONSE_FIXED.search(text or "")
        ratio = _JEONSE_RATIO.search(text or "")
        if fixed:
            amount = int(fixed.group(1).replace(",", "")) * 10_000
            return {**base, "contract_deposit": amount, "deposit_total": amount, "contract_ratio": 100,
                    "method": "공고문 본인부담 보증금"}
        return {**base, "contract_ratio": int(ratio.group(1)) if ratio else None, "method": "주택 선택 후 결정"}
    if row.get("sale_price") is None:
        deposit = listed_deposit(text)
        if deposit:
            return {**base, "contract_deposit": deposit, "deposit_total": deposit, "contract_ratio": 100,
                    "method": "공고문 보증금 최솟값"}
    if "매입임대" in supply or "매입임대" in (row.get("complex_name") or ""):
        return {**base, "method": "배정 시 안내"}
    return None
