from sqlalchemy import String, Integer, Numeric, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class HistoricalResult(Base):
    """기획안 5장 '과거 경쟁률·커트라인' 데이터에 대응. 청약홈 경쟁률/가점 API에서 수집.

    한 공고(external_id)의 한 평형(unit_type)이 거주지/순위/공급유형 등 세부 구분에 따라
    여러 행으로 나뉘어 내려온다 (예: APT는 "해당지역 1순위"/"기타지역 2순위" 등).
    그래서 이 테이블은 '공고 x 평형 x 세부구분(category_label)' 조합 하나당 한 행이다.

    ⚠️ 이 테이블은 두 가지 종류의 행을 같이 담는다 (category_label 체계가 서로 달라서 겹치지 않음):
      - 경쟁률 행: competition_rate/apply_count/supply_count 채워짐, 점수 필드는 비어있음
      - 당첨가점 행 (APT만): avg_score/cutoff_score/top_score 채워짐, 경쟁률 필드는 비어있음
    """

    __tablename__ = "historical_results"
    __table_args__ = (
        UniqueConstraint(
            "external_id", "unit_type", "category_label", name="uq_result_external_unit_category"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # 팀 DB(예전 구조)의 칸: save_listings.py가 쓰고 probability_estimator.py가 읽는다.
    # 기존 63,450행의 지역·연도 데이터가 여기 들어 있어서 모델에서도 그대로 연결한다.
    complex_id: Mapped[str] = mapped_column(String(50), nullable=True)  # 공고번호 (예전 이름)
    unit_size_sqm: Mapped[float] = mapped_column(Numeric, nullable=True)  # 공급면적
    region_code: Mapped[str] = mapped_column(String(20), nullable=True)  # 공급지역 코드
    year: Mapped[int] = mapped_column(Integer, nullable=True)  # 모집공고 연도
    house_ty: Mapped[str] = mapped_column(String(30), nullable=True)  # 주택형 (예전 이름)
    reside_secd: Mapped[str] = mapped_column(String(10), nullable=True)  # 거주지역 구분
    subscrpt_rank: Mapped[str] = mapped_column(String(10), nullable=True)  # 청약 순위

    external_id: Mapped[str] = mapped_column(String(50), index=True)  # 청약홈 공고번호(PBLANC_NO)
    unit_type: Mapped[str] = mapped_column(String(30), nullable=True)  # 주택형(평형)
    house_type: Mapped[str] = mapped_column(String(30), index=True)  # listings.house_type과 동일 분류

    category_label: Mapped[str] = mapped_column(String(50), nullable=True)  # 세부 구분 (예: "해당지역 1순위", "일반공급", "해당지역")
    supply_count: Mapped[int] = mapped_column(Integer, nullable=True)  # 그 구분 기준 공급세대수
    apply_count: Mapped[int] = mapped_column(Integer, nullable=True)  # 신청자수(REQ_CNT)

    competition_rate: Mapped[float] = mapped_column(Numeric(8, 2), nullable=True)  # 경쟁률(숫자로 파싱된 경우만)
    is_undersubscribed: Mapped[bool] = mapped_column(Boolean, default=False)  # 미달 여부 ("(△209)" 같은 표기)
    raw_cmpet_rate: Mapped[str] = mapped_column(String(30), nullable=True)  # API 원본 문자열 그대로 (검증/디버깅용)

    avg_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=True)  # 평균 당첨가점 (AVRG_SCORE, APT만)
    cutoff_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=True)  # 최저 당첨가점/커트라인 (LWET_SCORE, APT만)
    top_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=True)  # 최고 당첨가점 (TOP_SCORE, APT만)
