from sqlalchemy import String, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class HistoricalResult(Base):
    """기획안 5장 '과거 경쟁률·커트라인' 데이터에 대응.

    청약홈에 공개된 과거 당첨자 발표 결과를 누적 저장한다.
    개인별 점수가 아닌 집계 통계라는 점에 유의 (기획안 5장 유의점 참고).
    """

    __tablename__ = "historical_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    complex_id: Mapped[str] = mapped_column(String(50), index=True)  # 단지ID
    unit_size_sqm: Mapped[float] = mapped_column(Numeric(6, 2), nullable=True)  # 평형
    region_code: Mapped[str] = mapped_column(String(20), index=True)  # 지역
    year: Mapped[int] = mapped_column(Integer, index=True)  # 연도

    competition_rate: Mapped[float] = mapped_column(Numeric(8, 2), nullable=True)  # 경쟁률
    cutoff_score: Mapped[int] = mapped_column(Integer, nullable=True)  # 당첨가점 커트라인
