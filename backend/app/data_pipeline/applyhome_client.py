"""청약홈 공공데이터포털 API 연동 (기획안 5장 '청약 공고' 데이터 소스).

STEP 2에서 발급받은 인증키를 backend/.env 의 APPLYHOME_API_KEY 에 넣고 사용한다.

청약홈 API는 주택 유형별로 "공고 단위(Detail)" + "평형별(Mdl)" 엔드포인트가 각각 따로 있다.
전부 실제 응답으로 검증 완료:
  - APT              : getAPTLttotPblancDetail      + getAPTLttotPblancMdl
  - 오피스텔·도시형생활주택 : getUrbtyOfctlLttotPblancDetail + getUrbtyOfctlLttotPblancMdl
  - 무순위·잔여세대       : getRemndrLttotPblancDetail    + getRemndrLttotPblancMdl

이 파일이 하는 일:
  1. fetch_details() → 주택 유형별 Detail 엔드포인트에서 공고 단위 정보를 날짜 범위로 전부 조회(페이지네이션)
  2. fetch_models_for_listing() → 공고 하나(PBLANC_NO)당 평형별 정보(분양가/면적) 조회
  3. 공고 목록을 돌면서 평형 정보를 붙여서 merge (주택 유형별로 필드명이 달라서 mapper 함수도 따로 둠)
  4. save_listings() 로 DB에 upsert(있으면 갱신, 없으면 새로 추가)
"""

import re
from datetime import date, datetime

import httpx

from app.core.config import settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.listing import Listing

APPLYHOME_BASE_URL = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1"

# 주택 유형 → (공고 단위 Detail 엔드포인트, 날짜 파라미터 포맷)
# 포맷: "dash"=YYYY-MM-DD, "plain"=YYYYMMDD (공공지원민간임대/임의공급은 plain, 나머지는 dash)
HOUSE_TYPE_ENDPOINTS = {
    "APT": ("getAPTLttotPblancDetail", "dash"),
    "오피스텔·도시형생활주택": ("getUrbtyOfctlLttotPblancDetail", "dash"),
    "무순위·잔여세대": ("getRemndrLttotPblancDetail", "dash"),
    "공공지원민간임대": ("getPblPvtRentLttotPblancDetail", "plain"),
    "임의공급": ("getOPTLttotPblancDetail", "plain"),
}

# 주택 유형 → 평형별(Mdl) 엔드포인트. 5개 전부 실제 호출로 존재/필드 확인 완료.
MDL_ENDPOINTS = {
    "APT": "getAPTLttotPblancMdl",
    "오피스텔·도시형생활주택": "getUrbtyOfctlLttotPblancMdl",
    "무순위·잔여세대": "getRemndrLttotPblancMdl",
    "공공지원민간임대": "getPblPvtRentLttotPblancMdl",
    "임의공급": "getOPTLttotPblancMdl",
}


def _require_api_key() -> str:
    if not settings.applyhome_api_key:
        raise RuntimeError("APPLYHOME_API_KEY가 설정되지 않았습니다. backend/.env를 확인하세요.")
    return settings.applyhome_api_key


def _parse_date(value: str | None) -> date | None:
    """'2026-09-11' 형식 문자열을 date로 변환. 값이 없으면 None."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def _parse_yyyymm(value: str | None) -> date | None:
    """'202910' 형식(입주예정월)을 그 달 1일 date로 변환."""
    if not value or len(value) != 6:
        return None
    try:
        return datetime.strptime(value + "01", "%Y%m%d").date()
    except ValueError:
        return None


def _parse_exclusive_area(house_ty: str | None) -> float | None:
    """HOUSE_TY(주택형, 예: '084.7459A')의 앞부분 숫자 = 전용면적(㎡). (APT/무순위 공통 형식)

    공급면적(SUPLY_AR)과 달리 전용면적은 별도 필드로 안 내려오고,
    주택형 코드 자체가 전용면적을 나타내는 관례를 이용해 추출한다.
    """
    if not house_ty:
        return None
    match = re.match(r"^(\d+\.\d+)", house_ty.strip())
    if not match:
        return None
    return float(match.group(1))


def _to_float(value) -> float | None:
    if value in (None, "", "-"):
        return None
    try:
        if isinstance(value, str):
            value = value.replace(",", "").strip()
            if value in ("", "-"):
                return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_won(manwon_value) -> int | None:
    """'만원' 단위 문자열/숫자를 '원' 단위 정수로 변환."""
    value = _to_float(manwon_value)
    return int(value * 10000) if value is not None else None


def fetch_details(
    endpoint_name: str,
    from_date: str = "2026-01-01",
    per_page: int = 100,
    date_format: str = "dash",
) -> list[dict]:
    """Detail류 엔드포인트에서 공고 단위 정보를 날짜 범위로 "전부" 가져온다 (페이지네이션 포함).

    date_format="plain"이면 from_date('YYYY-MM-DD')를 'YYYYMMDD'로 바꿔서 보낸다
    (공공지원민간임대/임의공급 엔드포인트가 이 형식을 요구함).
    """
    api_key = _require_api_key()
    url = f"{APPLYHOME_BASE_URL}/{endpoint_name}"
    from_date_param = from_date.replace("-", "") if date_format == "plain" else from_date
    all_data: list[dict] = []
    page = 1
    with httpx.Client(timeout=10.0) as client:
        while True:
            response = client.get(
                url,
                params={
                    "serviceKey": api_key,
                    "page": page,
                    "perPage": per_page,
                    "cond[RCRIT_PBLANC_DE::GTE]": from_date_param,
                },
            )
            response.raise_for_status()
            body = response.json()
            data = body.get("data", [])
            all_data.extend(data)

            total_count = body.get("totalCount", len(all_data))
            if not data or len(all_data) >= total_count:
                break
            page += 1
    return all_data


def fetch_models_for_listing(endpoint_name: str, pblanc_no: str, per_page: int = 20) -> list[dict]:
    """Mdl류 엔드포인트에서 공고 하나(pblanc_no)의 평형별 정보를 가져온다.

    이 API들은 날짜 조회가 안 되고 공고번호(cond[PBLANC_NO::EQ]) 단위 조회만 지원한다.
    """
    api_key = _require_api_key()
    url = f"{APPLYHOME_BASE_URL}/{endpoint_name}"
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


def map_detail_row(detail: dict) -> dict:
    """공고 단위 응답 1건 → Listing 공통 필드로 변환. 주택 유형과 무관하게 공통 필드명 사용."""
    supply_type = " ".join(
        filter(None, [detail.get("HOUSE_SECD_NM"), detail.get("HOUSE_DTL_SECD_NM")])
    ) or None

    return {
        "external_id": detail.get("PBLANC_NO"),
        "complex_name": detail.get("HOUSE_NM"),
        "region_code": detail.get("SUBSCRPT_AREA_CODE"),
        "supply_type": supply_type,
        "receipt_start": _parse_date(detail.get("RCEPT_BGNDE")),
        "receipt_end": _parse_date(detail.get("RCEPT_ENDDE")),
        "announce_date": _parse_date(detail.get("PRZWNER_PRESNATN_DE")),
        "move_in_date": _parse_yyyymm(detail.get("MVN_PREARNGE_YM")),
        "hssply_adres": detail.get("HSSPLY_ADRES"),
        "pblanc_url": detail.get("PBLANC_URL"),
    }


def map_model_row(model: dict) -> dict:
    """평형(Mdl) 응답 1건 → Listing 필드로 변환. APT / 무순위·잔여세대 공통 (필드 구조 동일,
    실제 응답으로 검증 완료: HOUSE_TY/SUPLY_AR/SUPLY_HSHLDCO/LTTOT_TOP_AMOUNT).
    """
    house_ty = (model.get("HOUSE_TY") or model.get("MODEL_NO") or "").strip() or None
    return {
        "unit_type": house_ty,
        "unit_size_sqm": _to_float(model.get("SUPLY_AR")),  # 공급면적(㎡)
        "exclusive_area_sqm": _parse_exclusive_area(house_ty),  # 전용면적(㎡, HOUSE_TY에서 추출)
        "unit_count": model.get("SUPLY_HSHLDCO"),
        "sale_price": _to_won(model.get("LTTOT_TOP_AMOUNT")),  # 분양가, 원본 단위: 만원. 쉼표 포함 문자열도 있음("125,000")
    }


def map_tp_model_row(model: dict) -> dict:
    """TP(주택형)/EXCLUSE_AR(전용면적) 구조를 쓰는 평형(Mdl) 응답 → Listing 필드로 변환.
    오피스텔·도시형생활주택 / 공공지원민간임대 공통 (실제 응답으로 검증 완료:
    TP/EXCLUSE_AR/SUPLY_HSHLDCO/SUPLY_AMOUNT, SUPLY_AR은 있는 유형도 없는 유형도 있음).
    """
    unit_type = (model.get("TP") or model.get("MODEL_NO") or "").strip() or None
    return {
        "unit_type": unit_type,
        "unit_size_sqm": _to_float(model.get("SUPLY_AR")),  # 공급면적(㎡). 없는 유형이면 None
        "exclusive_area_sqm": _to_float(model.get("EXCLUSE_AR")),
        "unit_count": model.get("SUPLY_HSHLDCO"),
        "sale_price": _to_won(model.get("SUPLY_AMOUNT")),  # 분양가, 원본 단위: 만원
    }


# 주택 유형별로 평형(Mdl) 응답을 Listing 필드로 바꿔주는 함수.
# HOUSE_TY 구조(APT/무순위·잔여세대/임의공급) vs TP+EXCLUSE_AR 구조(오피스텔·도시형생활주택/공공지원민간임대), 두 그룹으로 나뉜다.
MODEL_MAPPERS = {
    "APT": map_model_row,
    "무순위·잔여세대": map_model_row,
    "임의공급": map_model_row,
    "오피스텔·도시형생활주택": map_tp_model_row,
    "공공지원민간임대": map_tp_model_row,
}


def fetch_new_listings(
    from_date: str = "2026-01-01",
    limit_listings: int | None = None,
    house_type: str = "APT",
) -> list[dict]:
    """공고 정보 + 평형별 정보를 합쳐서 반환.

    house_type: HOUSE_TYPE_ENDPOINTS 의 키 중 하나.
    limit_listings: None이면(기본값) 날짜 범위 안의 공고를 전부 처리한다.
    """
    if house_type not in HOUSE_TYPE_ENDPOINTS:
        raise ValueError(f"알 수 없는 house_type: {house_type} (가능한 값: {list(HOUSE_TYPE_ENDPOINTS)})")

    endpoint_name, date_format = HOUSE_TYPE_ENDPOINTS[house_type]
    details = fetch_details(endpoint_name, from_date, date_format=date_format)
    if limit_listings is not None:
        details = details[:limit_listings]

    total = len(details)
    print(f"[{house_type}] 총 {total}개 공고 처리 시작 (공고당 API 1회씩 추가 호출)...")

    mdl_endpoint = MDL_ENDPOINTS.get(house_type)
    mapper = MODEL_MAPPERS.get(house_type)

    merged: list[dict] = []
    for i, detail in enumerate(details, start=1):
        pblanc_no = detail.get("PBLANC_NO")
        if not pblanc_no:
            continue
        base = map_detail_row(detail)
        base["house_type"] = house_type

        models = fetch_models_for_listing(mdl_endpoint, pblanc_no) if mdl_endpoint else []
        if not models:
            merged.append({**base, "external_id": pblanc_no, "unit_type": None})
        else:
            for model in models:
                row = {**base, "external_id": pblanc_no, **mapper(model)}
                merged.append(row)

        if i % 10 == 0 or i == total:
            print(f"  진행: {i}/{total}")

    return merged


def fetch_all_house_types(from_date: str = "2026-01-01", limit_listings: int | None = None) -> list[dict]:
    """HOUSE_TYPE_ENDPOINTS에 정의된 모든 주택 유형을 순서대로 가져와서 합친다."""
    all_rows: list[dict] = []
    for house_type in HOUSE_TYPE_ENDPOINTS:
        try:
            rows = fetch_new_listings(from_date=from_date, limit_listings=limit_listings, house_type=house_type)
            all_rows.extend(rows)
        except httpx.HTTPStatusError as exc:
            print(f"[{house_type}] API 호출 실패: {exc}")
    return all_rows


def save_listings(listings: list[dict]) -> int:
    """merged listing dict 목록을 DB에 upsert. 반환값: 저장(추가+갱신)된 행 수.

    ⚠️ 아직 Alembic 마이그레이션이 없어서, 여기서 테이블이 없으면 바로 만들어준다(create_all).
    나중에 Alembic 세팅하면 이 줄은 지우고 마이그레이션으로 대체하면 됨.
    """
    if not listings:
        return 0

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        for row in listings:
            existing = (
                db.query(Listing)
                .filter(
                    Listing.external_id == row["external_id"],
                    Listing.unit_type == row.get("unit_type"),
                )
                .first()
            )
            if existing:
                for key, value in row.items():
                    setattr(existing, key, value)
            else:
                db.add(Listing(**row))
        db.commit()
        return len(listings)
    finally:
        db.close()


if __name__ == "__main__":
    # 터미널에서 바로 실행: cd backend && python -m app.data_pipeline.applyhome_client
    # APT + 오피스텔·도시형생활주택 + 무순위·잔여세대 를 평형별 분양가/면적까지 전부 가져온다.
    data = fetch_all_house_types()
    print(f"가져온 행 수: {len(data)}")
    print("-" * 60)
    for row in data[:10]:
        print(
            f"[{row.get('house_type')}] "
            f"{row.get('complex_name'):<20} "
            f"{str(row.get('unit_type')):<10} "
            f"전용:{row.get('exclusive_area_sqm')} "
            f"공급:{row.get('unit_size_sqm')} "
            f"분양가:{row.get('sale_price')}"
        )

    saved = save_listings(data)
    print("-" * 60)
    print(f"DB에 저장된 행 수: {saved}")
