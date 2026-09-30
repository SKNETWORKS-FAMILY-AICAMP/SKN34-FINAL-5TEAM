"""LH 분양·임대 공고 목록 (공공데이터포털 lhLeaseNoticeInfo1). 인증키는 APPLYHOME_API_KEY를 같이 쓴다.

응답은 [{"dsSch": [조회조건]}, {"dsList": [공고…]}] 형태의 리스트다.
공고 상세(lhLeaseNoticeDtlInfo1)·공급정보(lhLeaseNoticeSplInfo1) API는 활용 승인이 키에 반영된 뒤 추가한다.
DB 저장은 save_listings.py에서 한다.
"""

from datetime import date, timedelta

import httpx

from app.core.config import settings
from app.data_pipeline.applyhome_client import parse_date

LH_NOTICE_URL = "https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1"
PAGE_SIZE = 100
# 공고 대분류 중 주택 관련만 (01 토지, 22 상가 제외)
HOUSING_CATEGORIES = {"05": "분양주택", "06": "임대주택", "13": "주거복지", "39": "공공분양(신혼희망)"}

# LH 지역명 → 청약홈 지역코드 (listings.region_code를 한 체계로 맞추기 위함)
REGION_CODES = {
    "서울": "100", "강원": "200", "대전": "300", "충청남": "312", "충남": "312", "세종": "338",
    "충청북": "360", "충북": "360", "인천": "400", "경기": "410", "광주": "500", "전라남": "513",
    "전남": "513", "전북": "560", "전라북": "560", "부산": "600", "경상남": "621", "경남": "621",
    "울산": "680", "제주": "690", "대구": "700", "경상북": "712", "경북": "712",
}


def region_code_from_name(name: str | None) -> str | None:
    for key, code in REGION_CODES.items():
        if name and name.startswith(key):
            return code
    return None


def extract_notices(body) -> tuple[list[dict], int]:
    """LH 응답 → (공고 목록, 조건에 맞는 전체 건수)."""
    rows: list[dict] = []
    if isinstance(body, list):
        for part in body:
            if isinstance(part, dict) and isinstance(part.get("dsList"), list):
                rows = part["dsList"]
    total = int(rows[0].get("ALL_CNT") or 0) if rows else 0
    return rows, total


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


def fetch_lh_notices(days: int = 365) -> list[dict]:
    """최근 days일 동안 게시된 주택 관련 LH 공고 전체."""
    if not settings.applyhome_api_key:
        print("[LH] 인증키가 없어 건너뜁니다.", flush=True)
        return []
    end = date.today()
    start = end - timedelta(days=days)
    listings: list[dict] = []
    with httpx.Client(timeout=30.0) as client:
        for code, name in HOUSING_CATEGORIES.items():
            page = 1
            while True:
                response = client.get(LH_NOTICE_URL, params={
                    "serviceKey": settings.applyhome_api_key,
                    "PG_SZ": PAGE_SIZE,
                    "PAGE": page,
                    "UPP_AIS_TP_CD": code,
                    "PAN_ST_DT": start.strftime("%Y%m%d"),
                    "PAN_ED_DT": end.strftime("%Y%m%d"),
                })
                if response.status_code != 200:
                    print(f"[LH] {name} 호출 실패 HTTP {response.status_code}: {response.text[:120]}", flush=True)
                    break
                rows, total = extract_notices(response.json())
                listings.extend(map_notice(r) for r in rows)
                if not rows or page * PAGE_SIZE >= total:
                    break
                page += 1
    print(f"[LH] 공고 {len(listings)}건", flush=True)
    return listings
