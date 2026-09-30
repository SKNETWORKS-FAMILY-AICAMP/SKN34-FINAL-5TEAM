"""LH 공고 첨부 "공급대상 주택목록" 엑셀 → 주택별 임대조건. DB 저장은 save_listings.py에서 한다.

매입임대·든든전세 공고는 주택마다 임대보증금이 달라서 공고문 본문에는 "첨부 주택목록 참조"만 있고,
금액은 첨부 엑셀에 있다. 공고문에 계약금 비율도 없어서, 이 주택들은 임대보증금 전액을 필요 자금으로 본다.

엑셀 양식은 지역본부·유형마다 다르다 (2026-10 LH 매입임대 공고 16건 확인).
  - 헤더가 1~2줄이고 윗줄은 병합 셀 (예: "임대조건(원)" 아래 "보증금 | 임대료")
  - 자격별로 보증금·임대료 열이 여러 쌍 (예: "다자녀 수급자" / "다자녀 소득70%이하")
그래서 "순번"이 있는 줄을 헤더 시작으로 보고, 열 이름으로 칸을 찾는다.
"""

from __future__ import annotations

import io
import re

import openpyxl

LIST_NAMES = ("목록", "주택내역")
TYPE_HEADERS = ("주택형", "공급형", "공급형(실사용면적)", "주택군이름", "주택군", "모집단위(주택군)", "모집단위")
GENERIC_GROUPS = ("임대조건", "주택정보", "주택상세", "공급주택")
MAX_BYTES = 20 * 1024 * 1024


def house_list_files(detail: dict | None) -> list[tuple[str, str]]:
    """LH 상세정보 첨부파일 중 주택목록 엑셀(.xlsx) → [(파일명, 링크)]"""
    return [(f["CMN_AHFL_NM"], f.get("AHFL_URL")) for f in (detail or {}).get("dsAhflInfo") or []
            if str(f.get("CMN_AHFL_NM", "")).lower().endswith(".xlsx")
            and any(word in f["CMN_AHFL_NM"] for word in LIST_NAMES) and f.get("AHFL_URL")]


# ---------- 엑셀 읽기 ----------

def _text(value) -> str:
    return re.sub(r"\s+", " ", str(value)).strip() if value is not None else ""


def _key(label: str) -> str:
    return label.replace(" ", "")


def _amount(value) -> int | None:
    if isinstance(value, (int, float)):
        return int(value)
    digits = _text(value).replace(",", "").removesuffix("원")
    return int(digits) if digits.isdigit() else None


def _area(value) -> float | None:
    if isinstance(value, (int, float)):
        return float(value) or None
    match = re.fullmatch(r"\d+(?:\.\d+)?", _text(value))
    return float(match.group()) if match else None


def _column_labels(header_rows: list[list], width: int) -> list[list[str]]:
    """헤더 줄들 → 열마다 [윗줄 이름, 아랫줄 이름]. 병합 셀(빈칸)은 윗줄만 왼쪽 값을 이어 받는다."""
    filled = []
    for depth, row in enumerate(header_rows):
        row = list(row) + [None] * (width - len(row))
        last, out = "", []
        for value in row:
            label = _text(value)
            if label:
                last = label
            out.append(label or (last if depth < len(header_rows) - 1 else ""))
        filled.append(out)
    columns = []
    for c in range(width):
        parts = []
        for row in filled:
            if row[c] and (not parts or parts[-1] != row[c]):
                parts.append(row[c])
        columns.append(parts)
    return columns


def _is_seq(value) -> bool:
    return isinstance(value, (int, float)) or _text(value).isdigit()


def _sheet_houses(rows: list[list]) -> list[dict]:
    head = next((i for i, row in enumerate(rows) if any(_key(_text(v)) == "순번" for v in row)), None)
    if head is None:
        return []
    seq_col = next(c for c, v in enumerate(rows[head]) if _key(_text(v)) == "순번")
    first = next((i for i in range(head + 1, len(rows)) if len(rows[i]) > seq_col and _is_seq(rows[i][seq_col])), None)
    if first is None:
        return []
    width = max(len(r) for r in rows[head:])
    labels = _column_labels(rows[head:first], width)
    last = [_key(p[-1]) if p else "" for p in labels]

    def find(test):
        return next((c for c in range(width) if last[c] and test(last[c])), None)

    address = find(lambda k: "도로명" in k) or find(lambda k: "주소" in k and "지번" not in k)
    type_col = next((c for name in TYPE_HEADERS for c in range(width) if last[c] == name), None)
    deposits = [c for c in range(width) if "보증금" in last[c] and not last[c].startswith("무보증") and "증액" not in last[c]]
    rents = [c for c in range(width) if "임대료" in last[c] and not last[c].startswith("무보증")
             and "하한" not in last[c] and "전환" not in last[c]]
    columns = {
        "dong": find(lambda k: k in ("동", "동번호")), "ho": find(lambda k: k == "호"),
        "exclusive": find(lambda k: k.startswith("전용")), "common": find(lambda k: "공용" in k),
        "kind": find(lambda k: k == "주택유형"), "rooms": find(lambda k: k == "방수"), "floor": find(lambda k: k == "층수"),
    }
    groups = []
    for i, d in enumerate(deposits):
        end = deposits[i + 1] if i + 1 < len(deposits) else width
        rent = next((r for r in rents if d < r < end), None)
        top = labels[d][0] if len(labels[d]) > 1 else ""
        groups.append((d, rent, None if not top or any(g in _key(top) for g in GENERIC_GROUPS) else top))

    houses = []
    for row in rows[first:]:
        row = list(row) + [None] * (width - len(row))
        if not _is_seq(row[seq_col]) or address is None:
            continue

        def cell(name):
            return row[columns[name]] if columns[name] is not None else None

        conditions = [{"group": g, "deposit": _amount(row[d]), "rent": _amount(row[r]) if r is not None else None}
                      for d, r, g in groups]
        priced = [c for c in conditions if c["deposit"] is not None]
        cheapest = min(priced, key=lambda c: c["deposit"]) if priced else {}
        houses.append({
            "seq": int(float(_text(row[seq_col]))),
            "address": _text(row[address])[:300] or None,
            "dong": _text(cell("dong"))[:30] or None,
            "ho": _text(cell("ho")).removesuffix("호")[:30] or None,
            "house_label": _text(row[type_col])[:50] or None if type_col is not None else None,
            "house_kind": _text(cell("kind"))[:50] or None,
            "exclusive_area_sqm": _area(cell("exclusive")),
            "common_area_sqm": _area(cell("common")),
            "rooms": _text(cell("rooms"))[:10] or None,
            "floor": _text(cell("floor"))[:20] or None,
            "rent_deposit": cheapest.get("deposit"),
            "monthly_rent": cheapest.get("rent"),
            "condition_group": (cheapest.get("group") or "")[:100] or None,
            "conditions": conditions or None,
        })
    return houses


def read_house_list(content: bytes) -> list[dict]:
    """주택목록 엑셀 → 주택 1호 = 1행. 시트마다 따로 읽고 sheet에 시트 이름을 남긴다."""
    if len(content) > MAX_BYTES:
        raise ValueError("파일이 너무 큼")
    workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    houses = []
    for sheet in workbook.worksheets:
        for house in _sheet_houses([list(r) for r in sheet.iter_rows(values_only=True)]):
            houses.append({"sheet": sheet.title[:100], **house})
    workbook.close()
    return houses


# ---------- listings 행과 연결 ----------

def _address_key(address: str | None) -> str:
    return re.sub(r"\s+", "", address or "")


def _road_key(address: str | None) -> str | None:
    """도로명 + 건물번호 (예: "강변로336번길 18-5"). API와 엑셀의 동·건물명 표기 차이를 무시하려고 쓴다."""
    match = re.search(r"(\S+(?:로|길))\s*(\d+(?:-\d+)?)", address or "")
    return f"{match.group(1)} {match.group(2)}" if match else None


def _area_key(area) -> float | None:
    return round(float(area), 2) if area else None


def _listing_ho(complex_name: str | None) -> str | None:
    """LH 매입임대 listings.complex_name 끝의 "… 202호" → "202" """
    match = re.search(r"(\S+)호\s*$", complex_name or "")
    return match.group(1) if match else None


def house_costs(listings: list[dict], houses: list[dict]) -> list[dict]:
    """주택목록 → listings 행마다 필요 자금(임대보증금 전액).

    연결 순서: 같은 주택(주소+호 > 도로명·건물번호+호 > 호+전용면적) > 같은 주택형 최솟값 > 공고 최솟값
    """
    priced = [h for h in houses if h.get("rent_deposit")]
    if not priced:
        return []
    keys = (
        lambda address, ho, area: (_address_key(address), ho),
        lambda address, ho, area: (_road_key(address), ho) if _road_key(address) else None,
        lambda address, ho, area: (ho, _area_key(area)) if ho and _area_key(area) else None,
    )
    indexes = [{} for _ in keys]
    for h in priced:
        for key, index in zip(keys, indexes):
            k = key(h["address"], h["ho"], h.get("exclusive_area_sqm"))
            if k is not None:
                index.setdefault(k, []).append(h)
    cheapest = min(priced, key=lambda h: h["rent_deposit"])
    costs = []
    for row in listings:
        ho = _listing_ho(row.get("complex_name"))
        same_house = None
        if ho:
            for key, index in zip(keys, indexes):
                k = key(row.get("address"), ho, row.get("exclusive_area_sqm"))
                if k is not None and index.get(k):
                    same_house = index[k]
                    break
        unit = _key(row.get("unit_type") or "")
        same_type = [h for h in priced if unit and _key(h["house_label"] or "") == unit]
        if same_house:
            house, method = min(same_house, key=lambda h: h["rent_deposit"]), "주택목록 보증금"
        elif same_type:
            house, method = min(same_type, key=lambda h: h["rent_deposit"]), "주택목록 주택형 최솟값"
        else:
            house, method = cheapest, "주택목록 최솟값"
        costs.append({
            "source": row["source"], "external_id": row["external_id"], "model_no": row["model_no"],
            "contract_deposit": house["rent_deposit"], "contract_ratio": 100, "deposit_total": house["rent_deposit"],
            "balance": None, "method": method,
            "doc_label": (house.get("condition_group") or house.get("house_label") or "")[:50] or None,
        })
    return costs
