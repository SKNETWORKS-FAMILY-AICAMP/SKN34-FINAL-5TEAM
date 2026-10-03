"""청약홈 경쟁률(Cmpet) + 당첨가점(Score) API 연동 (기획안 5장 '과거 경쟁률·커트라인' 데이터 소스).

지금까지 쓰던 "분양정보 조회 서비스"(ApplyhomeInfoDetailSvc)와는 별도 API 상품
(data.go.kr 15098905, ApplyhomeInfoCmpetRtSvc)이다. 인증키는 같은 APPLYHOME_API_KEY를 쓴다.

경쟁률/가점은 당첨자 발표가 난 공고에만 존재한다. 그래서 이미 확보한 공고 단위 정보(Detail 응답의
PRZWNER_PRESNATN_DE = 당첨자발표일)를 보고, 발표일이 지난 공고만 골라 공고당 1번씩 호출한다
(평형별 Mdl 데이터 가져올 때와 같은 N+1 패턴).

5개 주택 유형 경쟁률 전부 + APT 당첨가점, 전부 실제 호출로 필드 확인 완료.
"""

from datetime import date

import httpx

from app.data_pipeline.applyhome_client import (
    HOUSE_TYPE_ENDPOINTS,
    _parse_date,
    _require_api_key,
    _to_float,
    fetch_details,
)
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.historical_result import HistoricalResult

CMPET_BASE_URL = "https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1"

# 주택 유형 → 경쟁률 엔드포인트. 5개 전부 실제 호출로 존재/필드 확인 완료.
CMPET_ENDPOINTS = {
    "APT": "getAPTLttotPblancCmpet",
    "오피스텔·도시형생활주택": "getUrbtyOfctlLttotPblancCmpet",
    "무순위·잔여세대": "getRemndrLttotPblancCmpet",
    "공공지원민간임대": "getPblPvtRentLttotPblancCmpet",
    "임의공급": "getOPTLttotPblancCmpet",
}

# APT 전용, 당첨가점(평균/최저=커트라인/최고) 조회
SCORE_ENDPOINT = "getAptLttotPblancScore"


def _parse_competition_rate(raw) -> tuple[float | None, bool]:
    """CMPET_RATE 원본 문자열을 (숫자 경쟁률, 미달 여부)로 변환.

    보통 "4.40" 같은 숫자 문자열이지만, 데이터 없음은 "-", 미달인 경우 "(△209)"처럼
    미달 세대수를 괄호+△로 표기해서 내려온다. "-"는 그냥 값 없음(None, 미달 아님),
    "(△209)"는 미달(None, True)로 구분한다.
    """
    if raw in (None, "", "-"):
        return None, False
    raw = str(raw).strip()
    if "△" in raw or raw.startswith("("):
        return None, True
    try:
        return float(raw), False
    except ValueError:
        return None, False


def _parse_int(value) -> int | None:
    if value in (None, "", "-"):
        return None
    try:
        return int(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _fetch_from_cmpet_api(endpoint_name: str, pblanc_no: str, per_page: int = 100) -> list[dict]:
    """ApplyhomeInfoCmpetRtSvc 계열 엔드포인트에서 공고 하나(pblanc_no)의 데이터를 전부 가져온다."""
    api_key = _require_api_key()
    url = f"{CMPET_BASE_URL}/{endpoint_name}"
    with httpx.Client(timeout=10.0) as client:
        response = client.get(
            url,
            params={
                "serviceKey": api_key,
                "page": 1,
                "perPage": per_page,
                "cond[PBLANC_NO::EQ]": pblanc_no,
            },
        )
        response.raise_for_status()
        return response.json().get("data", [])


def fetch_cmpet_for_listing(house_type: str, pblanc_no: str, per_page: int = 100) -> list[dict]:
    """공고 하나(pblanc_no)의 경쟁률 정보를 전부 가져온다 (평형 x 세부구분 여러 행으로 옴)."""
    return _fetch_from_cmpet_api(CMPET_ENDPOINTS[house_type], pblanc_no, per_page)


def fetch_score_for_listing(pblanc_no: str, per_page: int = 100) -> list[dict]:
    """APT 공고 하나(pblanc_no)의 당첨가점 정보를 전부 가져온다."""
    return _fetch_from_cmpet_api(SCORE_ENDPOINT, pblanc_no, per_page)


def map_apt_cmpet_row(row: dict, house_type: str) -> dict:
    """실제 응답 검증 완료: CMPET_RATE/RESIDE_SENM/SUBSCRPT_RANK_CODE/REQ_CNT/SUPLY_HSHLDCO/HOUSE_TY."""
    rate, undersub = _parse_competition_rate(row.get("CMPET_RATE"))
    rank = row.get("SUBSCRPT_RANK_CODE")
    reside = (row.get("RESIDE_SENM") or "").strip()
    category = f"{reside} {rank}순위".strip() if rank else (reside or None)
    return {
        "external_id": row.get("PBLANC_NO"),
        "unit_type": row.get("HOUSE_TY"),
        "house_type": house_type,
        "category_label": category,
        "supply_count": _parse_int(row.get("SUPLY_HSHLDCO")),
        "apply_count": _parse_int(row.get("REQ_CNT")),
        "competition_rate": rate,
        "is_undersubscribed": undersub,
        "raw_cmpet_rate": row.get("CMPET_RATE"),
    }


def map_ofctl_cmpet_row(row: dict, house_type: str) -> dict:
    """실제 응답 검증 완료: CMPET_RATE/RESIDNT_PRIOR_SENM/REQ_CNT/SUPLY_HSHLDCO/HOUSE_TY."""
    rate, undersub = _parse_competition_rate(row.get("CMPET_RATE"))
    return {
        "external_id": row.get("PBLANC_NO"),
        "unit_type": row.get("HOUSE_TY"),
        "house_type": house_type,
        "category_label": (row.get("RESIDNT_PRIOR_SENM") or "").strip() or None,
        "supply_count": _parse_int(row.get("SUPLY_HSHLDCO")),
        "apply_count": _parse_int(row.get("REQ_CNT")),
        "competition_rate": rate,
        "is_undersubscribed": undersub,
        "raw_cmpet_rate": row.get("CMPET_RATE"),
    }


def map_remndr_cmpet_row(row: dict, house_type: str) -> dict:
    """실제 응답 검증 완료: CMPET_RATE/REMNDR_HSHLD_PBLANC_TYCD(01=사후,02=사전)/REQ_CNT/SUPLY_HSHLDCO/HOUSE_TY."""
    rate, undersub = _parse_competition_rate(row.get("CMPET_RATE"))
    tycd = row.get("REMNDR_HSHLD_PBLANC_TYCD")
    category = {"01": "사후", "02": "사전"}.get(tycd)
    return {
        "external_id": row.get("PBLANC_NO"),
        "unit_type": row.get("HOUSE_TY"),
        "house_type": house_type,
        "category_label": category,
        "supply_count": _parse_int(row.get("SUPLY_HSHLDCO")),
        "apply_count": _parse_int(row.get("REQ_CNT")),
        "competition_rate": rate,
        "is_undersubscribed": undersub,
        "raw_cmpet_rate": row.get("CMPET_RATE"),
    }


def map_pblpvt_cmpet_row(row: dict, house_type: str) -> dict:
    """실제 응답 검증 완료: CMPET_RATE/SPSPLY_KND_NM(일반공급/청년/신혼부부/고령자)/REQ_CNT/SUPLY_HSHLDCO/HOUSE_TY."""
    rate, undersub = _parse_competition_rate(row.get("CMPET_RATE"))
    return {
        "external_id": row.get("PBLANC_NO"),
        "unit_type": row.get("HOUSE_TY"),
        "house_type": house_type,
        "category_label": (row.get("SPSPLY_KND_NM") or "").strip() or None,
        "supply_count": _parse_int(row.get("SUPLY_HSHLDCO")),
        "apply_count": _parse_int(row.get("REQ_CNT")),
        "competition_rate": rate,
        "is_undersubscribed": undersub,
        "raw_cmpet_rate": row.get("CMPET_RATE"),
    }


def map_opt_cmpet_row(row: dict, house_type: str) -> dict:
    """실제 응답 검증 완료: CMPET_RATE/REQ_CNT/SUPLY_HSHLDCO/HOUSE_TY. 세부 구분 필드가 따로 없음
    (평형당 한 줄)."""
    rate, undersub = _parse_competition_rate(row.get("CMPET_RATE"))
    return {
        "external_id": row.get("PBLANC_NO"),
        "unit_type": row.get("HOUSE_TY"),
        "house_type": house_type,
        "category_label": None,
        "supply_count": _parse_int(row.get("SUPLY_HSHLDCO")),
        "apply_count": _parse_int(row.get("REQ_CNT")),
        "competition_rate": rate,
        "is_undersubscribed": undersub,
        "raw_cmpet_rate": row.get("CMPET_RATE"),
    }


def map_score_row(row: dict) -> dict:
    """실제 응답 검증 완료: AVRG_SCORE/LWET_SCORE(최저=커트라인)/TOP_SCORE/RESIDE_SENM/HOUSE_TY. APT 전용.

    경쟁률 행과 category_label 체계가 달라서(순위 구분 없이 "해당지역"/"기타지역"만) 별도 행으로 저장된다.
    """
    return {
        "external_id": row.get("PBLANC_NO"),
        "unit_type": row.get("HOUSE_TY"),
        "house_type": "APT",
        "category_label": (row.get("RESIDE_SENM") or "").strip() or None,
        "avg_score": _to_float(row.get("AVRG_SCORE")),
        "cutoff_score": _to_float(row.get("LWET_SCORE")),
        "top_score": _to_float(row.get("TOP_SCORE")),
    }


CMPET_MAPPERS = {
    "APT": map_apt_cmpet_row,
    "오피스텔·도시형생활주택": map_ofctl_cmpet_row,
    "무순위·잔여세대": map_remndr_cmpet_row,
    "공공지원민간임대": map_pblpvt_cmpet_row,
    "임의공급": map_opt_cmpet_row,
}


def _concluded_details(house_type: str, from_date: str) -> list[dict]:
    """지정 유형의 Detail 목록 중 당첨자 발표가 끝난 것만 골라 반환."""
    detail_endpoint, date_format = HOUSE_TYPE_ENDPOINTS[house_type]
    details = fetch_details(detail_endpoint, from_date, date_format=date_format)
    today = date.today()
    return [d for d in details if (a := _parse_date(d.get("PRZWNER_PRESNATN_DE"))) and a <= today]


def fetch_competition_results(from_date: str = "2026-01-01", limit_listings: int | None = None) -> list[dict]:
    """당첨자 발표가 끝난 공고만 골라 5개 유형 전부 경쟁률을 가져온다."""
    all_rows: list[dict] = []

    for house_type in CMPET_ENDPOINTS:
        concluded = _concluded_details(house_type, from_date)
        if limit_listings is not None:
            concluded = concluded[:limit_listings]

        total = len(concluded)
        print(f"[{house_type}] 발표 완료된 공고 {total}건 경쟁률 조회 시작...")
        mapper = CMPET_MAPPERS[house_type]

        for i, detail in enumerate(concluded, start=1):
            pblanc_no = detail.get("PBLANC_NO")
            if not pblanc_no:
                continue
            for row in fetch_cmpet_for_listing(house_type, pblanc_no):
                all_rows.append(mapper(row, house_type))
            if i % 10 == 0 or i == total:
                print(f"  진행: {i}/{total}")

    return all_rows


def fetch_winning_scores(from_date: str = "2026-01-01", limit_listings: int | None = None) -> list[dict]:
    """당첨자 발표가 끝난 APT 공고만 골라 당첨가점(평균/최저/최고)을 가져온다."""
    concluded = _concluded_details("APT", from_date)
    if limit_listings is not None:
        concluded = concluded[:limit_listings]

    total = len(concluded)
    print(f"[당첨가점] 발표 완료된 APT 공고 {total}건 조회 시작...")

    rows: list[dict] = []
    for i, detail in enumerate(concluded, start=1):
        pblanc_no = detail.get("PBLANC_NO")
        if not pblanc_no:
            continue
        for row in fetch_score_for_listing(pblanc_no):
            rows.append(map_score_row(row))
        if i % 10 == 0 or i == total:
            print(f"  진행: {i}/{total}")

    return rows


def save_historical_rows(rows: list[dict]) -> int:
    """경쟁률 행 + 당첨가점 행을 함께 DB에 upsert (category_label 체계가 달라서 안 겹침)."""
    if not rows:
        return 0

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        for row in rows:
            existing = (
                db.query(HistoricalResult)
                .filter(
                    HistoricalResult.external_id == row["external_id"],
                    HistoricalResult.unit_type == row.get("unit_type"),
                    HistoricalResult.category_label == row.get("category_label"),
                )
                .first()
            )
            if existing:
                for key, value in row.items():
                    setattr(existing, key, value)
            else:
                db.add(HistoricalResult(**row))
        db.commit()
        return len(rows)
    finally:
        db.close()



# ── APT 특별공급 신청현황 (getAPTSpsplyReqstStus) ──────────────────────────────
# 공공데이터포털 Swagger Model 탭에서 실제 필드 설명 확인 완료 (2026-09-18):
#   *_HSHLDCO(공고x평형당 1개, 지역 구분 없음) = 그 특공유형의 배정세대수
#   <지역접두어>_<유형코드>_CNT = 그 지역x유형의 접수건수
#   지역접두어 3종: CRSPAREA=해당지역, CTPRVN=기타경기(수도권 기준), ETC_AREA=기타지역
# 유형코드가 HSHLDCO 필드와 CNT 필드에서 다른 경우(노부모부양)가 있어 따로 매핑.
SPSPLY_ENDPOINT = "getAPTSpsplyReqstStus"

SPSPLY_CATEGORIES = {
    "기관추천": {"cnt_prefix": "INSTT_RECOMEND", "hshldco_field": "INSTT_RECOMEND_HSHLDCO"},
    "다자녀": {"cnt_prefix": "MNYCH", "hshldco_field": "MNYCH_HSHLDCO"},
    "노부모부양": {"cnt_prefix": "OPS", "hshldco_field": "OLD_PARNTS_SUPORT_HSHLDCO"},
    "신혼부부": {"cnt_prefix": "NWWDS_NMTW", "hshldco_field": "NWWDS_NMTW_HSHLDCO"},
    "생애최초": {"cnt_prefix": "LFE_FRST", "hshldco_field": "LFE_FRST_HSHLDCO"},
    "신생아": {"cnt_prefix": "NWBB_NWBBSHR", "hshldco_field": "NWBB_NWBBSHR_HSHLDCO"},
    "청년": {"cnt_prefix": "YGMN", "hshldco_field": "YGMN_HSHLDCO"},
}

SPSPLY_REGIONS = {
    "CRSPAREA": "해당지역",
    "CTPRVN": "기타경기",
    "ETC_AREA": "기타지역",
}


def fetch_spsply_for_listing(pblanc_no: str, per_page: int = 100) -> list[dict]:
    """공고 하나(pblanc_no)의 APT 특별공급 신청현황을 가져온다 (평형당 1행, 유형/지역은 컬럼으로 펼쳐져 옴)."""
    return _fetch_from_cmpet_api(SPSPLY_ENDPOINT, pblanc_no, per_page)


def map_spsply_row(row: dict) -> list[dict]:
    """와이드 포맷(평형당 1행, 유형x지역이 컬럼) → 롱 포맷(유형x지역 조합당 1행)으로 변환.

    한 원본 행(공고+평형)당 최대 7유형 x 3지역 = 21행이 나온다.
    supply_count(배정세대수)는 지역 구분이 없어서 같은 유형의 3개 지역 행에 동일하게 반복 저장한다.
    competition_rate/is_undersubscribed는 API가 직접 안 주는 값이라 접수건수/배정세대수로 자체 계산한다.
    """
    external_id = row.get("PBLANC_NO")
    unit_type = row.get("HOUSE_TY")
    out = []

    for category_name, fields in SPSPLY_CATEGORIES.items():
        supply_count = _parse_int(row.get(fields["hshldco_field"]))
        for region_prefix, region_label in SPSPLY_REGIONS.items():
            apply_count = _parse_int(row.get(f"{region_prefix}_{fields['cnt_prefix']}_CNT"))

            rate = None
            undersub = False
            if supply_count and apply_count is not None:
                rate = round(apply_count / supply_count, 2) if supply_count > 0 else None
                undersub = apply_count < supply_count

            out.append({
                "external_id": external_id,
                "unit_type": unit_type,
                "house_type": "APT",
                "category_label": f"{category_name} - {region_label}",
                "supply_count": supply_count,
                "apply_count": apply_count,
                "competition_rate": rate,
                "is_undersubscribed": undersub,
                "raw_cmpet_rate": None,  # API가 별도 경쟁률 텍스트를 주지 않음 (자체 계산값이 competition_rate)
            })

    return out


def fetch_special_supply_status(from_date: str = "2026-01-01", limit_listings: int | None = None) -> list[dict]:
    """당첨자 발표가 끝난 APT 공고만 골라 특별공급 신청현황(유형x지역별 접수건수/배정세대수)을 가져온다."""
    concluded = _concluded_details("APT", from_date)
    if limit_listings is not None:
        concluded = concluded[:limit_listings]

    total = len(concluded)
    print(f"[특별공급 신청현황] 발표 완료된 APT 공고 {total}건 조회 시작...")

    rows: list[dict] = []
    for i, detail in enumerate(concluded, start=1):
        pblanc_no = detail.get("PBLANC_NO")
        if not pblanc_no:
            continue
        for raw_row in fetch_spsply_for_listing(pblanc_no):
            rows.extend(map_spsply_row(raw_row))
        if i % 10 == 0 or i == total:
            print(f"  진행: {i}/{total}")

    return rows


if __name__ == "__main__":
    # 터미널에서 바로 실행: cd backend && python -m app.data_pipeline.competition_client
    cmpet_rows = fetch_competition_results()
    print(f"가져온 경쟁률 행 수: {len(cmpet_rows)}")

    score_rows = fetch_winning_scores()
    print(f"가져온 당첨가점 행 수: {len(score_rows)}")

    spsply_rows = fetch_special_supply_status()
    print(f"가져온 특별공급 신청현황 행 수: {len(spsply_rows)}")

    all_rows = cmpet_rows + score_rows + spsply_rows
    saved = save_historical_rows(all_rows)
    print("-" * 60)
    print(f"DB에 저장된 행 수(합계): {saved}")
