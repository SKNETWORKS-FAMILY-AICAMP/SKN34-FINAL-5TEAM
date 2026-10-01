"""LH 분양·임대 공고 (공공데이터포털 B552555). DB 저장은 save_listings.py에서 한다.

- 공고 목록 (lhLeaseNoticeInfo1): 공고명·유형·지역·게시일·마감일·상태
- 공고 상세 (lhLeaseNoticeDtlInfo1): 단지 주소·총세대수, 접수·발표·계약 일정(dsSplScdl), 첨부 공고문(dsAhflInfo)
- 공급정보 (lhLeaseNoticeSplInfo1): 주택형·전용/공급면적·공급 세대수·임대보증금·월임대료·분양가 (dsList01~04)
  공고 유형마다 표(dsList0N)와 필드 이름이 다르다 (2026-09-30, 1,744건 응답으로 확인):
    국민·행복·영구임대 등  HTY_NNA / DDO_AR / SPL_AR / NOW_HSH_CNT / LS_GMY·RFE (대부분 "공고문 참조")
    공공임대·분양주택 등    HTY_NM / RSDN_DDO_AR / SPL_AR / SIL_HSH_CNT / LS_GMY·MM_RFE / SIL_AMT(분양가)
    매입임대 (집 한 채 = 1행) HTY_DS_NM / DDO_AR / ADR / HO_NO / QUP_CNT
세 API 모두 [{"dsSch": …}, {"ds…": […]}, …] 형태의 리스트로 응답한다 (2026-09-30 실제 응답으로 확인).
원본은 lh_notice_details에 보관하고, 공고 x 주택형 단위로 listings(source=lh)에 넣는다.

인증키: backend/.env의 LH_API_KEY. 비어 있으면 APPLYHOME_API_KEY를 쓴다.
LH API 3개는 공공데이터포털에서 따로 활용 신청한 계정의 키로만 호출된다 (다른 키면 403 SERVICE_KEY_IS_NOT_REGISTERED_ERROR).
"""

from datetime import date

import httpx

from app.core.config import settings
from app.data_pipeline.applyhome_client import parse_date, parse_month, to_float, to_int

LH_BASE_URL = "https://apis.data.go.kr/B552555"
NOTICE_PATH = "lhLeaseNoticeInfo1/lhLeaseNoticeInfo1"
DETAIL_PATH = "lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1"
SUPPLY_PATH = "lhLeaseNoticeSplInfo1/getLeaseNoticeSplInfo1"
DETAIL_PARAMS = ("PAN_ID", "CCR_CNNT_SYS_DS_CD", "SPL_INF_TP_CD", "UPP_AIS_TP_CD", "AIS_TP_CD")
PAGE_SIZE = 1000  # 목록 API는 1,000건씩 받아도 1초 정도 (2026-10 확인)
# 목록 API가 주는 가장 오래된 공고: 2010년 (2000~2009년 조회 결과 0건, 2026-10 확인)
LH_START = date(2010, 1, 1)
# 공고 대분류 중 주택 관련만 (01 토지, 22 상가 제외)
HOUSING_CATEGORIES = {"05": "분양주택", "06": "임대주택", "13": "주거복지", "39": "공공분양(신혼희망)"}

# LH 지역명 → 청약홈 지역코드 (listings.region_code를 한 체계로 맞추기 위함)
REGION_CODES = {
    "서울": "100", "강원": "200", "대전": "300", "충청남": "312", "충남": "312", "세종": "338",
    "충청북": "360", "충북": "360", "인천": "400", "경기": "410", "광주": "500", "전라남": "513",
    "전남": "513", "전북": "560", "전라북": "560", "부산": "600", "경상남": "621", "경남": "621",
    "울산": "680", "제주": "690", "대구": "700", "경상북": "712", "경북": "712",
}


def lh_key() -> str:
    return settings.lh_api_key or settings.applyhome_api_key


def region_code_from_name(name: str | None) -> str | None:
    for key, code in REGION_CODES.items():
        if name and name.startswith(key):
            return code
    return None


def extract_notices(body) -> tuple[list[dict], int]:
    """LH 목록 응답 → (공고 목록, 조건에 맞는 전체 건수)."""
    rows: list[dict] = []
    if isinstance(body, list):
        for part in body:
            if isinstance(part, dict) and isinstance(part.get("dsList"), list):
                rows = part["dsList"]
    total = int(rows[0].get("ALL_CNT") or 0) if rows else 0
    return rows, total


def flatten(body) -> dict:
    """[{"dsSch": …}, {"dsList01": …}, …] → {"dsSch": …, "dsList01": …}"""
    if isinstance(body, dict):
        return body
    merged: dict = {}
    for part in body if isinstance(body, list) else []:
        if isinstance(part, dict):
            merged.update(part)
    return merged


def map_notice(row: dict) -> dict:
    category = row.get("UPP_AIS_TP_NM") or ""
    return {
        "source": "lh",
        "external_id": str(row.get("PAN_ID")),
        "model_no": None,
        "unit_type": None,
        "house_type": f"LH {category}".strip()[:30],
        "complex_name": (row.get("PAN_NM") or "")[:255],
        "region_code": region_code_from_name(row.get("CNP_CD_NM")),
        "region_name": row.get("CNP_CD_NM"),
        "supply_type": row.get("AIS_TP_CD_NM"),
        "notice_url": row.get("DTL_URL"),
        "notice_status": row.get("PAN_SS"),
        "recruit_date": parse_date(row.get("PAN_NT_ST_DT") or row.get("PAN_DT")),
        "receipt_end": parse_date(row.get("CLSG_DT")),
        "unit_count": 0,
    }


def fetch_lh_notices(since: date = LH_START) -> list[dict]:
    """since 이후 게시된 주택 관련 LH 공고 목록 원본 (dsList 행). 기본은 API가 주는 전체 기간."""
    if not lh_key():
        print("[LH] 인증키가 없어 건너뜁니다.", flush=True)
        return []
    end = date.today()
    start = since
    rows_all: list[dict] = []
    with httpx.Client(timeout=30.0) as client:
        for code, name in HOUSING_CATEGORIES.items():
            page = 1
            while True:
                response = client.get(f"{LH_BASE_URL}/{NOTICE_PATH}", params={
                    "serviceKey": lh_key(), "PG_SZ": PAGE_SIZE, "PAGE": page, "UPP_AIS_TP_CD": code,
                    "PAN_ST_DT": start.strftime("%Y%m%d"), "PAN_ED_DT": end.strftime("%Y%m%d"),
                })
                if response.status_code != 200:
                    print(f"[LH] {name} 목록 호출 실패 HTTP {response.status_code} "
                          "— LH API를 승인받은 계정의 키를 LH_API_KEY에 넣어 주세요.", flush=True)
                    return rows_all
                rows, total = extract_notices(response.json())
                rows_all.extend(rows)
                if not rows or page * PAGE_SIZE >= total:
                    break
                page += 1
    print(f"[LH] 공고 {len(rows_all)}건", flush=True)
    return rows_all


def fetch_notice_detail(notice: dict, client: httpx.Client) -> dict:
    """공고 하나의 상세·공급정보 API 원본 응답. 실패하면 error에 사유를 담는다."""
    params = {"serviceKey": lh_key(), **{k: notice.get(k) for k in DETAIL_PARAMS}}
    result: dict = {"pan_id": str(notice.get("PAN_ID")), "notice": notice, "detail": None, "supply": None, "error": None}
    errors = []
    for field, path in (("detail", DETAIL_PATH), ("supply", SUPPLY_PATH)):
        try:
            response = client.get(f"{LH_BASE_URL}/{path}", params=params)
            if response.status_code == 200:
                result[field] = flatten(response.json())
            else:
                errors.append(f"{field} HTTP {response.status_code}")
        except (httpx.HTTPError, ValueError) as exc:
            errors.append(f"{field} {exc.__class__.__name__}")
    result["error"] = ", ".join(errors)[:300] or None
    return result


def _won(value) -> int | None:
    """"1,234,000" → 1234000. "공고문 참조"처럼 숫자가 아니면 None."""
    number = to_float(value)
    return int(number) if number is not None else None


def map_listing_rows(notice: dict, detail: dict | None, supply: dict | None) -> list[dict]:
    """공고 목록 행 + 상세·공급정보 원본 → listings 행 (공급정보의 주택형마다 1행, 없으면 공고 1행)."""
    base = map_notice(notice)
    detail = detail or {}
    schedule = (detail.get("dsSplScdl") or [{}])[0]
    complexes = {c.get("LCC_NT_NM"): c for c in detail.get("dsSbd") or []}
    first_complex = next(iter(complexes.values()), {})
    base.update({
        "receipt_start": parse_date(schedule.get("SBSC_ACP_ST_DT")),
        "receipt_end": parse_date(schedule.get("SBSC_ACP_CLSG_DT")) or base["receipt_end"],
        "announce_date": parse_date(schedule.get("PZWR_ANC_DT")),
        "contract_start": parse_date(schedule.get("CTRT_ST_DT")),
        "contract_end": parse_date(schedule.get("CTRT_ED_DT")),
        "address": first_complex.get("LGDN_ADR") or None,
        "total_household_count": to_int(first_complex.get("HSH_CNT")),
        "move_in_date": parse_month(first_complex.get("MVIN_XPC_YM")),
    })
    base["raw"] = {"notice": notice, "unit": None}  # API 응답 원본 (상세·공급 전체 원본은 lh_notice_details)
    rows = []
    for list_name in sorted(k for k in (supply or {}) if k.startswith("dsList") and not k.endswith("Nm")):
        for index, unit in enumerate(supply[list_name] or [], start=1):
            unit_type = _first(unit, "HTY_NNA", "HTY_NM", "HTY_DS_NM")
            exclusive = to_float(_first(unit, "DDO_AR", "RSDN_DDO_AR"))
            if not unit_type and exclusive is None:
                continue  # 지역별 모집 인원 같은 요약 표는 주택형 행이 아니다
            complex_label = _first(unit, "SBD_LGO_NM", "BZDT_NM")
            if unit.get("HO_NO"):
                complex_label = f"{complex_label or ''} {unit['HO_NO']}".strip()
            complex_row = complexes.get(unit.get("SBD_LGO_NM"), first_complex)
            count = to_int(_first(unit, "NOW_HSH_CNT", "SIL_HSH_CNT", "QUP_CNT", "RQS_HSH_CNT"))
            rows.append({
                **base,
                "model_no": f"{list_name[-2:]}-{index:03d}",
                "unit_type": str(unit_type).strip()[:30] if unit_type else None,
                "complex_name": (f"{base['complex_name']} - {complex_label}" if complex_label else base["complex_name"])[:255],
                "address": _first(unit, "ADR", "SBD_LGO_ADR") or complex_row.get("LGDN_ADR") or base["address"],
                "total_household_count": to_int(_first(unit, "HSH_CNT", "TOT_HSH_CNT")) or base["total_household_count"],
                "exclusive_area_sqm": exclusive,
                "unit_size_sqm": to_float(unit.get("SPL_AR")),
                "unit_count": count or 0,
                "general_supply_count": count,
                "sale_price": _won(unit.get("SIL_AMT")),
                "rent_deposit": _won(unit.get("LS_GMY")),
                "monthly_rent": _won(_first(unit, "RFE", "MM_RFE")),
                "raw": {"notice": notice, "unit": unit},
            })
    return rows or [base]


def _first(row: dict, *keys):
    for key in keys:
        if row.get(key) not in (None, ""):
            return row[key]
    return None
