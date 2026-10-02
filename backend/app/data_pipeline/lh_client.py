"""LH 분양·임대 공고. 공공데이터포털 일반 키(APPLYHOME_API_KEY)로 호출한다."""

from __future__ import annotations

from datetime import date, timedelta

import httpx

from app.core.config import settings

LH_NOTICE_URL = "https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1"


def fetch_lh_notices(limit: int = 5) -> list[dict]:
    if not settings.applyhome_api_key:
        print("LH: 인증키가 없어 건너뜁니다.")
        return []

    end = date.today()
    start = end - timedelta(days=180)
    params = {
        "serviceKey": settings.applyhome_api_key,
        "page": 1,
        "perPage": limit,
        "PG_SZ": limit,
        "PAGE": 1,
        "PAN_NT_ST_DT": start.strftime("%Y%m%d"),
        "CLSG_DT": end.strftime("%Y%m%d"),
        "numOfRows": limit,
        "pageNo": 1,
        "resultType": "json",
        "type": "json",
    }
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(LH_NOTICE_URL, params=params)
            response.raise_for_status()
            body = response.json()
    except Exception as exc:  # noqa: BLE001 — LH XML/권한 실패를 한 줄로 남긴다
        print(f"LH: 호출 실패({exc.__class__.__name__}). 활용신청이 필요할 수 있습니다.")
        return []

    rows = _extract_rows(body)
    listings = []
    for row in rows[:limit]:
        pan = str(row.get("PAN_ID") or row.get("PANID") or row.get("RCRIT_PBLANC_NO") or "")
        name = row.get("PAN_NM") or row.get("LCT_NM") or row.get("AIS_TP_CD_NM") or "LH공고"
        if not pan:
            pan = str(abs(hash(name)))[:12]
        listings.append(
            {
                "external_id": f"lh-{pan}"[:50],
                "complex_name": str(name)[:255],
                "address": row.get("CNP_CD_NM") or row.get("LCT_EA_NM"),
                "region_code": str(row.get("CNP_CD") or "unknown")[:20],
                "supply_type": "LH",
                "notice_url": row.get("DTL_URL") or row.get("PAN_NT_URL"),
                "sale_price": None,
                "unit_size_sqm": None,
                "unit_count": 0,
            }
        )
    return listings


def _extract_rows(body: object) -> list[dict]:
    if isinstance(body, list):
        return [row for row in body if isinstance(row, dict)]
    if not isinstance(body, dict):
        return []
    if isinstance(body.get("data"), list):
        return [row for row in body["data"] if isinstance(row, dict)]
    response = body.get("response")
    if isinstance(response, dict):
        items = (response.get("body") or {}).get("items")
        if isinstance(items, dict) and isinstance(items.get("item"), list):
            return items["item"]
        if isinstance(items, dict) and isinstance(items.get("item"), dict):
            return [items["item"]]
        if isinstance(items, list):
            return items
    return []
