from sqlalchemy import JSON, Boolean, Date, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Listing(Base):
    """기획안 5장 '청약 공고' 데이터에 대응.

    한 행 = 공고 x 주택형(평형). 주택형 정보가 없는 공고(LH·SH 공고 목록 등)는 model_no가 비어 있는 1행.
    한 공고 안에 같은 주택형(unit_type)이 여러 번 나올 수 있어서(오피스텔 군 구분 등) 행 구분은 model_no로 한다.
    source로 출처를 구분한다: applyhome(청약홈 API) / lh(LH 공고 API) / sh(SH 홈페이지 게시판).
    """

    __tablename__ = "listings"
    __table_args__ = (
        UniqueConstraint(
            "source", "external_id", "model_no",
            name="uq_listing_source_external_model",
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(20), default="applyhome", index=True)
    external_id: Mapped[str] = mapped_column(String(50), index=True)  # 청약홈 PBLANC_NO / LH PAN_ID / SH 게시글 seq
    model_no: Mapped[str] = mapped_column(String(10), nullable=True)  # 공고 안 주택형 순번 (MODEL_NO)
    unit_type: Mapped[str] = mapped_column(String(30), nullable=True)  # 주택형 (HOUSE_TY / TP)
    house_type: Mapped[str] = mapped_column(String(30), index=True)  # APT / 오피스텔·도시형생활주택 / 무순위·잔여세대 / 공공지원민간임대 / 임의공급 / LH·SH 공고 분류

    complex_name: Mapped[str] = mapped_column(String(255))  # 단지명(공고명)
    region_code: Mapped[str] = mapped_column(String(20), nullable=True, index=True)  # 청약홈 지역코드 (100=서울, 410=경기 …)
    region_name: Mapped[str] = mapped_column(String(30), nullable=True)
    supply_type: Mapped[str] = mapped_column(String(50), nullable=True)  # 공급유형 (APT 민영, 국민임대 …)
    address: Mapped[str] = mapped_column(String(500), nullable=True)  # 공급 위치
    notice_url: Mapped[str] = mapped_column(String(500), nullable=True)  # 공고 원문 URL
    homepage_url: Mapped[str] = mapped_column(String(500), nullable=True)
    developer: Mapped[str] = mapped_column(String(255), nullable=True)  # 사업주체(시행사)
    constructor: Mapped[str] = mapped_column(String(255), nullable=True)  # 시공사
    contact_phone: Mapped[str] = mapped_column(String(30), nullable=True)
    notice_status: Mapped[str] = mapped_column(String(30), nullable=True)  # LH 공고 상태 (공고중/접수마감 등)

    unit_size_sqm: Mapped[float] = mapped_column(Numeric(8, 4), nullable=True)  # 공급면적(㎡)
    exclusive_area_sqm: Mapped[float] = mapped_column(Numeric(8, 4), nullable=True)  # 전용면적(㎡)
    unit_count: Mapped[int] = mapped_column(Integer, default=0)  # 이 주택형 공급 세대수 (일반 + 특별)
    general_supply_count: Mapped[int] = mapped_column(Integer, nullable=True)  # 일반공급 세대수
    special_supply_count: Mapped[int] = mapped_column(Integer, nullable=True)  # 특별공급 세대수
    special_supply_detail: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # {"신혼부부": 3, "생애최초": 1, …}
    total_household_count: Mapped[int] = mapped_column(Integer, nullable=True)  # 공고 전체 공급 세대수
    sale_price: Mapped[int] = mapped_column(Numeric(14, 0), nullable=True)  # 분양가(원)

    recruit_date: Mapped[Date] = mapped_column(Date, nullable=True)  # 모집공고일
    receipt_start: Mapped[Date] = mapped_column(Date, nullable=True)  # 청약 접수 시작일
    receipt_end: Mapped[Date] = mapped_column(Date, nullable=True)  # 청약 접수 종료일
    special_receipt_start: Mapped[Date] = mapped_column(Date, nullable=True)  # 특별공급 접수 시작일
    special_receipt_end: Mapped[Date] = mapped_column(Date, nullable=True)
    announce_date: Mapped[Date] = mapped_column(Date, nullable=True)  # 당첨자 발표일
    contract_start: Mapped[Date] = mapped_column(Date, nullable=True)  # 계약 시작일
    contract_end: Mapped[Date] = mapped_column(Date, nullable=True)
    move_in_date: Mapped[Date] = mapped_column(Date, nullable=True)  # 입주 예정월 (1일로 저장)
    schedule: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # APT 순위·지역별 접수일 {"1순위 해당지역": ["2026-09-28", "2026-09-28"], …}

    is_speculative_area: Mapped[bool] = mapped_column(Boolean, nullable=True)  # 투기과열지구 (APT만 제공)
    is_adjusted_area: Mapped[bool] = mapped_column(Boolean, nullable=True)  # 조정대상지역 (APT만 제공)
    is_price_capped: Mapped[bool] = mapped_column(Boolean, nullable=True)  # 분양가상한제 (APT만 제공)
    is_public_housing_district: Mapped[bool] = mapped_column(Boolean, nullable=True)  # 공공주택지구 (APT만 제공)

    eligibility: Mapped[dict] = mapped_column(JSON, default=dict)  # 자격요건 — API에 없어서 아직 비어 있음
