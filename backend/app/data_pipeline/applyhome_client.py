"""청약홈 공공데이터 API 연동 — 청약 공고(listings) 수집.

주택 유형 5개마다 "공고 상세(Detail)"와 "주택형(Mdl)" 엔드포인트가 따로 있다.
두 엔드포인트 모두 조건 없이 1,000행씩 페이지로 받을 수 있어서, 유형마다 전체를 한꺼번에 받아
공고번호(PBLANC_NO)로 합친다 (공고마다 따로 호출하던 N+1 방식보다 호출 수가 수십 배 적다).

유형마다 필드 이름과 형식이 다르다 (2026-09-29 실제 응답으로 확인):
  - 접수일: APT는 RCEPT_*, 나머지는 SUBSCRPT_RCEPT_*, 무순위·임의공급은 GNRL_RCEPT_*도 있음
  - 날짜: 공공지원민간임대·임의공급은 YYYYMMDD, 나머지는 YYYY-MM-DD
  - 주택형·면적: APT·무순위·임의공급은 HOUSE_TY/SUPLY_AR, 오피스텔·민간임대는 TP/EXCLUSE_AR
  - 금액: LTTOT_TOP_AMOUNT 또는 SUPLY_AMOUNT (만원, "36,800"처럼 쉼표 포함 문자열도 있음)
DB 저장은 save_listings.py에서 한다.
"""

import re
from collections import defaultdict
from datetime import date

import httpx

from app.core.config import settings

ODCLOUD_BASE_URL = "https://api.odcloud.kr/api"
DETAIL_SVC = "ApplyhomeInfoDetailSvc/v1"
PAGE_SIZE = 1000

# 주택 유형 → (엔드포인트 이름 중간 부분, 모집공고일 조건의 날짜 형식)
HOUSE_TYPES = {
    "APT": ("APT", "dash"),
    "오피스텔·도시형생활주택": ("UrbtyOfctl", "dash"),
    "무순위·잔여세대": ("Remndr", "dash"),
    "공공지원민간임대": ("PblPvtRent", "plain"),
    "임의공급": ("OPT", "plain"),
}

APT_SPECIAL_FIELDS = {
    "다자녀": "MNYCH_HSHLDCO",
    "신혼부부": "NWWDS_HSHLDCO",
    "생애최초": "LFE_FRST_HSHLDCO",
    "노부모부양": "OLD_PARNTS_SUPORT_HSHLDCO",
    "기관추천": "INSTT_RECOMEND_HSHLDCO",
    "이전기관": "TRANSR_INSTT_ENFSN_HSHLDCO",
    "청년": "YGMN_HSHLDCO",
    "신생아": "NWBB_HSHLDCO",
    "기타": "ETC_HSHLDCO",
}
RENT_SPECIAL_FIELDS = {
    "고령자": "SPSPLY_AGED_HSHLDCO",
    "신혼부부": "SPSPLY_NEW_MRRG_HSHLDCO",
    "청년": "SPSPLY_YGMN_HSHLDCO",
}
APT_SCHEDULE_FIELDS = {
    "1순위 해당지역": "GNRL_RNK1_CRSPAREA",
    "1순위 기타경기": "GNRL_RNK1_ETC_GG",
    "1순위 기타지역": "GNRL_RNK1_ETC_AREA",
    "2순위 해당지역": "GNRL_RNK2_CRSPAREA",
    "2순위 기타경기": "GNRL_RNK2_ETC_GG",
    "2순위 기타지역": "GNRL_RNK2_ETC_AREA",
}


def require_api_key() -> str:
    if not settings.applyhome_api_key:
        raise RuntimeError("APPLYHOME_API_KEY가 설정되지 않았습니다. backend/.env를 확인하세요.")
    return settings.applyhome_api_key


def fetch_all_pages(path: str, cond: dict | None = None, client: httpx.Client | None = None) -> list[dict]:
    """odcloud 엔드포인트의 조건에 맞는 행을 페이지를 넘기며 전부 받는다."""
    own = client is None
    client = client or httpx.Client(timeout=60.0)
    rows: list[dict] = []
    page = 1
    try:
        while True:
            response = client.get(
                f"{ODCLOUD_BASE_URL}/{path}",
                params={"serviceKey": require_api_key(), "page": page, "perPage": PAGE_SIZE, **(cond or {})},
            )
            response.raise_for_status()
            body = response.json()
            data = body.get("data") or []
            rows.extend(data)
            if not data or len(rows) >= (body.get("matchCount") or 0):
                return rows
            page += 1
    finally:
        if own:
            client.close()


def parse_date(value) -> date | None:
    """'2026-10-02', '20261002', '2026.10.02' 모두 처리."""
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) < 8:
        return None
    try:
        return date(int(digits[:4]), int(digits[4:6]), int(digits[6:8]))
    except ValueError:
        return None


def parse_month(value) -> date | None:
    """입주 예정월 'YYYYMM' → 그 달 1일."""
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) < 6:
        return None
    try:
        return date(int(digits[:4]), int(digits[4:6]), 1)
    except ValueError:
        return None


def to_float(value) -> float | None:
    text = str(value if value is not None else "").replace(",", "").strip()
    if text in ("", "-"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def to_int(value) -> int | None:
    number = to_float(value)
    return int(number) if number is not None else None


def parse_exclusive_area(house_ty) -> float | None:
    """주택형 '084.7459A'의 앞 숫자 = 전용면적(㎡)."""
    match = re.match(r"^\s*(\d+\.\d+)", str(house_ty or ""))
    return float(match.group(1)) if match else None


def yn(value) -> bool | None:
    if value in ("Y", "N"):
        return value == "Y"
    return None


def _first(row: dict, *keys):
    for key in keys:
        if row.get(key) not in (None, ""):
            return row[key]
    return None


def map_notice(row: dict, house_type: str) -> dict:
    """공고 상세 1행 → listings의 공고 단위 컬럼."""
    detail_name = _first(row, "HOUSE_DTL_SECD_NM", "HOUSE_DETAIL_SECD_NM")
    supply_type = " ".join(dict.fromkeys(filter(None, [row.get("HOUSE_SECD_NM"), detail_name]))) or None
    schedule = {}
    for label, prefix in APT_SCHEDULE_FIELDS.items():
        start, end = parse_date(row.get(f"{prefix}_RCPTDE")), parse_date(row.get(f"{prefix}_ENDDE"))
        if start:
            schedule[label] = [start.isoformat(), end.isoformat() if end else None]
    return {
        "source": "applyhome",
        "external_id": str(row.get("PBLANC_NO")),
        "house_type": house_type,
        "complex_name": row.get("HOUSE_NM") or "",
        "region_code": row.get("SUBSCRPT_AREA_CODE"),
        "region_name": row.get("SUBSCRPT_AREA_CODE_NM"),
        "supply_type": supply_type[:50] if supply_type else None,
        "rent_type": row.get("RENT_SECD_NM"),
        "rent_type_code": row.get("RENT_SECD"),
        "house_code": row.get("HOUSE_SECD"),
        "house_detail_code": _first(row, "HOUSE_DTL_SECD", "HOUSE_DETAIL_SECD"),
        "search_house_code": row.get("SEARCH_HOUSE_SECD"),
        "zip_code": row.get("HSSPLY_ZIP"),
        "address": row.get("HSSPLY_ADRES"),
        "notice_url": row.get("PBLANC_URL"),
        "homepage_url": row.get("HMPG_ADRES"),
        "developer": row.get("BSNS_MBY_NM"),
        "constructor": row.get("CNSTRCT_ENTRPS_NM"),
        "contact_phone": row.get("MDHS_TELNO"),
        "newspaper": row.get("NSPRC_NM") or None,
        "total_household_count": to_int(row.get("TOT_SUPLY_HSHLDCO")),
        "recruit_date": parse_date(row.get("RCRIT_PBLANC_DE")),
        "receipt_start": parse_date(_first(row, "RCEPT_BGNDE", "SUBSCRPT_RCEPT_BGNDE", "GNRL_RCEPT_BGNDE")),
        "receipt_end": parse_date(_first(row, "RCEPT_ENDDE", "SUBSCRPT_RCEPT_ENDDE", "GNRL_RCEPT_ENDDE")),
        "special_receipt_start": parse_date(row.get("SPSPLY_RCEPT_BGNDE")),
        "special_receipt_end": parse_date(row.get("SPSPLY_RCEPT_ENDDE")),
        "announce_date": parse_date(row.get("PRZWNER_PRESNATN_DE")),
        "contract_start": parse_date(row.get("CNTRCT_CNCLS_BGNDE")),
        "contract_end": parse_date(row.get("CNTRCT_CNCLS_ENDDE")),
        "move_in_date": parse_month(row.get("MVN_PREARNGE_YM")),
        "schedule": schedule or None,
        "is_speculative_area": yn(row.get("SPECLT_RDN_EARTH_AT")),
        "is_adjusted_area": yn(row.get("MDAT_TRGET_AREA_SECD")),
        "is_price_capped": yn(row.get("PARCPRC_ULS_AT")),
        "is_public_housing_district": yn(row.get("PUBLIC_HOUSE_EARTH_AT")),
        "is_redevelopment": yn(row.get("IMPRMN_BSNS_AT")),
        "is_large_housing_site": yn(row.get("LRSCL_BLDLND_AT")),
        "is_public_housing_special_act": yn(row.get("PUBLIC_HOUSE_SPCLW_APPLC_AT")),
        "is_metro_private_public_district": yn(row.get("NPLN_PRVOPR_PUBLIC_HOUSE_AT")),
    }


def map_unit(row: dict, house_type: str) -> dict:
    """주택형 1행 → listings의 주택형 단위 컬럼."""
    unit_type = (_first(row, "HOUSE_TY", "TP") or "").strip() or None
    price = to_float(_first(row, "LTTOT_TOP_AMOUNT", "SUPLY_AMOUNT"))
    deposit = to_float(row.get("SUBSCRPT_REQST_AMOUNT"))
    group = (row.get("GP") or "").strip()
    exclusive = to_float(row.get("EXCLUSE_AR")) or parse_exclusive_area(unit_type)

    if house_type == "공공지원민간임대":
        detail = {name: to_int(row.get(field)) or 0 for name, field in RENT_SPECIAL_FIELDS.items()}
        special = sum(detail.values())
        general = to_int(row.get("GNSPLY_HSHLDCO"))
        total = to_int(row.get("SUPLY_HSHLDCO"))
    else:
        detail = (
            {name: to_int(row.get(field)) or 0 for name, field in APT_SPECIAL_FIELDS.items()}
            if house_type == "APT" else {}
        )
        special = to_int(row.get("SPSPLY_HSHLDCO"))
        general = to_int(row.get("SUPLY_HSHLDCO"))
        total = (general or 0) + (special or 0)
    detail = {name: count for name, count in detail.items() if count}

    return {
        "model_no": row.get("MODEL_NO"),
        "unit_type": unit_type,
        "unit_size_sqm": to_float(row.get("SUPLY_AR")),
        "exclusive_area_sqm": exclusive,
        "contract_area_sqm": to_float(row.get("CNTRCT_AR")),
        "unit_group": group if group not in ("", "-") else None,
        "unit_count": total or 0,
        "general_supply_count": general,
        "special_supply_count": special,
        "special_supply_detail": detail or None,
        "sale_price": int(price * 10000) if price is not None else None,
        "subscription_deposit": int(deposit * 10000) if deposit is not None else None,
    }


# 주택형 정보가 없는 공고도 같은 컬럼을 갖도록 (한 번에 upsert하려면 모든 행의 컬럼이 같아야 함)
EMPTY_UNIT = {key: None for key in map_unit({}, "APT")}


def _date_cond(from_date: date | None, date_format: str) -> dict:
    if from_date is None:
        return {}
    value = from_date.strftime("%Y-%m-%d" if date_format == "dash" else "%Y%m%d")
    return {"cond[RCRIT_PBLANC_DE::GTE]": value}


def fetch_notices(house_type: str, from_date: date | None = None, client: httpx.Client | None = None) -> list[dict]:
    key, date_format = HOUSE_TYPES[house_type]
    return fetch_all_pages(f"{DETAIL_SVC}/get{key}LttotPblancDetail", _date_cond(from_date, date_format), client)


def fetch_notice_index(from_date: date | None = None) -> dict[str, dict]:
    """공고번호 → 공고 상세 원본 (5개 유형). 경쟁률에 지역코드·연도를 붙일 때 쓴다."""
    index: dict[str, dict] = {}
    with httpx.Client(timeout=60.0) as client:
        for house_type in HOUSE_TYPES:
            index.update({str(n.get("PBLANC_NO")): n for n in fetch_notices(house_type, from_date, client)})
    return index


def fetch_listings(house_type: str, from_date: date | None = None) -> tuple[list[dict], list[dict]]:
    """한 주택 유형의 공고 x 주택형 행을 만든다. (listings 행, 공고 상세 원본) 튜플을 반환."""
    key, _ = HOUSE_TYPES[house_type]
    with httpx.Client(timeout=60.0) as client:
        notices = fetch_notices(house_type, from_date, client)
        wanted = {str(n.get("PBLANC_NO")) for n in notices}
        units_by_notice: dict[str, list[dict]] = defaultdict(list)
        for unit in fetch_all_pages(f"{DETAIL_SVC}/get{key}LttotPblancMdl", client=client):
            pblanc_no = str(unit.get("PBLANC_NO"))
            if pblanc_no in wanted:
                units_by_notice[pblanc_no].append(unit)

    rows: list[dict] = []
    for notice in notices:
        base = map_notice(notice, house_type)
        units = units_by_notice.get(base["external_id"])
        # raw: API 응답 원본 그대로 (컬럼으로 옮기지 않은 필드도 모두 남음)
        if not units:
            rows.append({**base, **EMPTY_UNIT, "unit_count": base["total_household_count"] or 0,
                         "raw": {"notice": notice, "unit": None}})
            continue
        rows.extend({**base, **map_unit(unit, house_type), "raw": {"notice": notice, "unit": unit}} for unit in units)
    print(f"[청약홈 {house_type}] 공고 {len(notices)}건 → listings {len(rows)}행", flush=True)
    return rows, notices


def fetch_all_listings(from_date: date | None = None) -> tuple[list[dict], dict[str, dict]]:
    """5개 주택 유형 전부. (listings 행, 공고번호 → 공고 상세 원본) 튜플을 반환."""
    all_rows: list[dict] = []
    notice_index: dict[str, dict] = {}
    for house_type in HOUSE_TYPES:
        rows, notices = fetch_listings(house_type, from_date)
        all_rows.extend(rows)
        notice_index.update({str(n.get("PBLANC_NO")): n for n in notices})
    return all_rows, notice_index
