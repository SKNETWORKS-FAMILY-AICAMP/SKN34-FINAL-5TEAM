"""청약홈 통계 API 2종 (한국부동산원, odcloud). DB 저장은 save_listings.py에서 한다.

- 청약통장 통계 조회 서비스 (ApplyhomeBnkbStatSvc): 전체 / 통장별 / 가입기간별 가입현황 — 월별
- 청약 신청·당첨자 정보 조회 서비스 (ApplyhomeStatSvc): 지역별·연령별 신청자, 지역별·연령별 당첨자, 지역별 경쟁률 — 월별
두 서비스 모두 공공데이터포털에서 따로 활용신청해야 하고, 신청 전에는 401 "유효하지 않은 인증키"가 온다.
월 조건(cond[…::GTE])으로 그 달 이후만 받을 수 있고, 한 번에 10,000행까지 받는다 (2026-10 확인).
"""

from collections.abc import Iterator

import httpx

from app.data_pipeline.applyhome_client import ODCLOUD_BASE_URL, require_api_key, to_float, to_int

PAGE_SIZE = 10000

# 기능 → (서비스 경로, 월 필드, kind)
BANKBOOK_ENDPOINTS = {
    "전체": "ApplyhomeBnkbStatSvc/v1/getBnkbAcnutAllStat",
    "통장별": "ApplyhomeBnkbStatSvc/v1/getBnkbAcnutDpstStat",
    "가입기간별": "ApplyhomeBnkbStatSvc/v1/getBnkbAcnutSbscrbStat",
}
SUBSCRIPTION_ENDPOINTS = {
    "지역별 신청자": "ApplyhomeStatSvc/v1/getAPTReqstAreaStat",
    "연령별 신청자": "ApplyhomeStatSvc/v1/getAPTReqstAgeStat",
    "지역별 당첨자": "ApplyhomeStatSvc/v1/getAPTPrzwnerAreaStat",
    "연령별 당첨자": "ApplyhomeStatSvc/v1/getAPTPrzwnerAgeStat",
    "지역별 경쟁률": "ApplyhomeStatSvc/v1/getAPTCmpetrtAreaStat",
}
BANKBOOK_MONTH, SUBSCRIPTION_MONTH = "DELNG_OCCRRNC_YM", "STAT_DE"

BANKBOOK_FIELDS = {
    "DELNG_OCCRRNC_YM": "year_month", "SIDO_NM": "sido_name", "SUBSCRPT_AREA_CODE": "area_code",
    "SUBSCRPT_AREA_CODE_NM": "area_name", "DPST_ITEM": "item_code", "DPST_ITEM_NM": "item_name",
    "BLNC_SECD": "balance_code", "BLNC_SECD_NM": "balance_name", "SBSCRB_PD_CODE": "period_code",
    "SBSCRB_PD_CODE_NM": "period_name",
}
BANKBOOK_COUNTS = {"RNK1_ACNUT_CO": "rank1_count", "RNK2_ACNUT_CO": "rank2_count", "ACNUT_CO": "account_count"}
BANKBOOK_COLUMNS = (*BANKBOOK_FIELDS.values(), *BANKBOOK_COUNTS.values())


class NotApproved(Exception):
    """활용신청이 안 됐거나 아직 반영되지 않은 서비스 (401)."""


def fetch_pages(path: str, month_field: str, since: str | None, client: httpx.Client) -> Iterator[list[dict]]:
    """since(YYYYMM) 이후 달의 행을 10,000행씩 페이지 단위로 넘긴다. since가 없으면 전체 기간."""
    cond = {f"cond[{month_field}::GTE]": since} if since else {}
    page, seen = 1, 0
    while True:
        response = client.get(f"{ODCLOUD_BASE_URL}/{path}",
                              params={"serviceKey": require_api_key(), "page": page, "perPage": PAGE_SIZE, **cond})
        if response.status_code == 401:
            raise NotApproved(path.split("/")[0])
        response.raise_for_status()
        body = response.json()
        data = body.get("data") or []
        if data:
            yield data
        seen += len(data)
        if not data or seen >= (body.get("matchCount") or 0):
            return
        page += 1


def map_bankbook_row(row: dict, kind: str) -> dict:
    out = {"kind": kind, **{column: None for column in BANKBOOK_COLUMNS}}
    for field, column in BANKBOOK_FIELDS.items():
        if row.get(field) is not None:
            out[column] = str(row[field]).strip()
    for field, column in BANKBOOK_COUNTS.items():
        out[column] = to_int(row.get(field))
    known = {*BANKBOOK_FIELDS, *BANKBOOK_COUNTS}
    out["extra"] = {k: v for k, v in row.items() if k not in known} or None
    return out


def map_subscription_row(row: dict, kind: str) -> dict:
    return {
        "kind": kind,
        "year_month": str(row.get("STAT_DE") or "").strip(),
        "area_code": row.get("SUBSCRPT_AREA_CODE"),
        "area_name": row.get("SUBSCRPT_AREA_CODE_NM"),
        "age_30": to_int(row.get("AGE_30")), "age_40": to_int(row.get("AGE_40")),
        "age_50": to_int(row.get("AGE_50")), "age_60": to_int(row.get("AGE_60")),
        "special_supply_count": to_int(row.get("SPSPLY_HSHLDCO")),
        "special_apply_count": to_int(row.get("SPSPLY_REQ_CNT")),
        "special_rate": to_float(row.get("SPSPLY_CMPET_RATE")),
        "general_supply_count": to_int(row.get("SUPLY_HSHLDCO")),
        "general_apply_count": to_int(row.get("SUPLY_REQ_CNT")),
        "general_rate": to_float(row.get("SUPLY_CMPET_RATE")),
        # 미달이면 경쟁률 자리에 "(△178)"(178세대 미달)이 온다 → 숫자 컬럼은 비우고 원문을 남긴다
        "special_rate_text": row.get("SPSPLY_CMPET_RATE"),
        "general_rate_text": row.get("SUPLY_CMPET_RATE"),
        "raw": row,
    }
