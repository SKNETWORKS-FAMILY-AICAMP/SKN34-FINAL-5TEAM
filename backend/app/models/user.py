from sqlalchemy import String, Integer, Boolean, Numeric, Date
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserProfile(Base):
    """기획안 5장 '사용자 프로필' 데이터에 대응.

    가점 계산(무주택기간 32점 + 부양가족수 35점 + 통장가입기간 17점)과
    자격 필터링에 필요한 값을 담는다.
    """

    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)

    no_house_period_months: Mapped[int] = mapped_column(Integer, default=0)  # 무주택기간(개월)
    is_householder: Mapped[bool] = mapped_column(Boolean, default=False)  # 세대주 여부
    dependents_count: Mapped[int] = mapped_column(Integer, default=0)  # 부양가족수

    subscription_account_type: Mapped[str] = mapped_column(String(50), nullable=True)  # 통장 종류
    subscription_joined_at: Mapped[Date] = mapped_column(Date, nullable=True)  # 가입일
    subscription_payment_count: Mapped[int] = mapped_column(Integer, default=0)  # 납입회차

    available_assets: Mapped[int] = mapped_column(Numeric(14, 0), default=0)  # 가용자산(원)
    desired_region_code: Mapped[str] = mapped_column(String(20), nullable=True)  # 희망지역 코드

    is_newlywed: Mapped[bool] = mapped_column(Boolean, default=False)  # 신혼특공 해당여부
    is_first_time_buyer: Mapped[bool] = mapped_column(Boolean, default=False)  # 생애최초 해당여부
