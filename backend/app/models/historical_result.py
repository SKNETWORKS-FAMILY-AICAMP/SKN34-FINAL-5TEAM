from sqlalchemy import JSON, Boolean, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class HistoricalResult(Base):
    """기획안 5장 '과거 경쟁률·커트라인' 데이터에 대응. 청약홈 경쟁률 API(ApplyhomeInfoCmpetRtSvc)에서 수집.

    한 행 = 공고 x 주택형 x result_type x 세부구분(category_label).
      - result_type "경쟁률": 5개 주택 유형 경쟁률. supply/apply_count, competition_rate 채워짐
      - result_type "당첨가점": APT만. avg/cutoff/top_score 채워짐
      - result_type "특별공급": APT 특별공급 종류 x 지역별 신청 건수. competition_rate는 신청/배정으로 계산한 값
    """

    __tablename__ = "historical_results"
    __table_args__ = (
        UniqueConstraint(
            "external_id", "unit_type", "result_type", "category_label",
            name="uq_result_external_unit_type_category",
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    external_id: Mapped[str] = mapped_column(String(50), index=True)  # 청약홈 공고번호 (listings.external_id와 같음)
    unit_type: Mapped[str] = mapped_column(String(30), nullable=True)  # 주택형 (listings.unit_type과 같음)
    model_no: Mapped[str] = mapped_column(String(10), nullable=True)  # 모델번호 (listings.model_no와 연결)
    house_type: Mapped[str] = mapped_column(String(30), index=True)
    result_type: Mapped[str] = mapped_column(String(10), index=True)  # 경쟁률 / 당첨가점 / 특별공급
    category_label: Mapped[str] = mapped_column(String(50), nullable=True)  # "해당지역 1순위", "신혼부부 - 기타경기" …
    reside_secd: Mapped[str] = mapped_column(String(10), nullable=True)  # 거주 구분 코드 원본 (01 해당지역 …)
    subscrpt_rank: Mapped[str] = mapped_column(String(10), nullable=True)  # 순위 / 공급종류 코드 원본

    region_code: Mapped[str] = mapped_column(String(20), nullable=True, index=True)  # 공고의 청약홈 지역코드
    year: Mapped[int] = mapped_column(Integer, nullable=True, index=True)  # 당첨자 발표 연도
    exclusive_area_sqm: Mapped[float] = mapped_column(Numeric(8, 4), nullable=True)  # 주택형에서 추출한 전용면적

    supply_count: Mapped[int] = mapped_column(Integer, nullable=True)  # 공급(배정) 세대수
    apply_count: Mapped[int] = mapped_column(Integer, nullable=True)  # 신청 건수
    competition_rate: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)
    is_undersubscribed: Mapped[bool] = mapped_column(Boolean, default=False)  # 미달 여부
    raw_cmpet_rate: Mapped[str] = mapped_column(String(30), nullable=True)  # API 원본 경쟁률 문자열 ("(△209)" 등)

    avg_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=True)  # 평균 당첨가점
    cutoff_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=True)  # 최저 당첨가점(커트라인)
    top_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=True)  # 최고 당첨가점

    result_status: Mapped[str] = mapped_column(String(30), nullable=True)  # 청약 결과 상태 (특별공급, 예: 청약접수 종료)
    detail: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # 기관추천 확정·예비 건수 등 추가 값
    raw: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # API 응답 행 원본 그대로 (특별공급은 평형 1행이 종류 x 지역 여러 행으로 나뉘므로 같은 원본이 반복됨)
