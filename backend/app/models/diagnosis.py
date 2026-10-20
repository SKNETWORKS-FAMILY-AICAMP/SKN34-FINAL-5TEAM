from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DiagnosisRecord(Base):
    """청약 진단 기록: 진단을 마칠 때마다 한 행. 날짜별로 다시 보고, 고른 기준만 나란히 비교하는 데 쓴다.

    answers 는 화면 진단 답변 그대로(연령대·혼인·무주택 기간·희망 지역 등),
    score·recommend_count·eligible_count 는 저장 시점에 서버가 계산한 값(나중에 공고가 바뀌어도 그날 값이 남는다).
    """

    __tablename__ = "diagnosis_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[int] = mapped_column(Integer, default=0)  # 청약 가점 (84점 만점)
    recommend_count: Mapped[int] = mapped_column(Integer, default=0)  # 그날 추천 공고 수
    eligible_count: Mapped[int] = mapped_column(Integer, default=0)  # 그중 신청 자격 충족 수
