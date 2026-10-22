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
    nickname: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 화면 로그인용. 이메일 + 닉네임이 맞으면 로그인 (비밀번호 아님)
    oauth_provider: Mapped[str | None] = mapped_column(String(20), nullable=True)  # kakao | naver
    oauth_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    birth_date: Mapped[Date] = mapped_column(Date, nullable=True)  # 생년월일(선택). 만 30세 미만 미혼의 무주택기간 0점 규칙에만 쓴다
    is_married: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # 혼인 여부 (신혼특공 해당 여부 is_newlywed와는 다르다)
    no_house_period_months: Mapped[int] = mapped_column(Integer, default=0)  # 무주택기간(개월)
    is_householder: Mapped[bool] = mapped_column(Boolean, default=False)  # 세대주 여부
    dependents_count: Mapped[int] = mapped_column(Integer, default=0)  # 부양가족수

    subscription_account_type: Mapped[str] = mapped_column(String(50), nullable=True)  # 통장 종류
    subscription_joined_at: Mapped[Date] = mapped_column(Date, nullable=True)  # 가입일
    subscription_payment_count: Mapped[int] = mapped_column(Integer, default=0)  # 납입회차

    available_assets: Mapped[int] = mapped_column(Numeric(14, 0), default=0)  # 가용자산(원)
    annual_income: Mapped[int] = mapped_column(Numeric(14, 0), nullable=True)  # 연 소득(원, 세전). 입력 안 했으면 NULL (0원과 구분)
    desired_region_code: Mapped[str] = mapped_column(String(20), nullable=True)  # 희망지역 코드

    is_newlywed: Mapped[bool] = mapped_column(Boolean, default=False)  # 신혼특공 해당여부
    is_first_time_buyer: Mapped[bool] = mapped_column(Boolean, default=False)  # 생애최초 해당여부

    # 청약 1순위 판정용 (진단 질문). 모르면 NULL → 화면에 '확인 필요'
    residence_region_code: Mapped[str | None] = mapped_column(String(20), nullable=True)  # 현재 거주 시·도 코드 (해당지역·기타지역 판단)
    house_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 세대 주택 수 (0=무주택, 2=2주택 이상)
    deposit_balance: Mapped[int | None] = mapped_column(Numeric(14, 0), nullable=True)  # 청약통장 잔액(원, 민영주택 예치금 기준)
    won_within_5y: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # 최근 5년 안 세대 청약 당첨 이력 (규제지역 1순위 제한)
    minor_children: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 미성년 자녀 수 (2=2명 이상)
    household_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 세대 가구원 수 (임대 소득 기준이 가구원수별)
    # 공공임대 총자산 판정용 (선택): 부동산·자동차·기타 금융자산·부채 (원). 하나라도 입력하면 '상세 입력'으로 본다
    real_estate_value: Mapped[int | None] = mapped_column(Numeric(14, 0), nullable=True)
    car_value: Mapped[int | None] = mapped_column(Numeric(14, 0), nullable=True)
    other_financial_assets: Mapped[int | None] = mapped_column(Numeric(14, 0), nullable=True)
    debt_amount: Mapped[int | None] = mapped_column(Numeric(14, 0), nullable=True)
    welfare_status: Mapped[str | None] = mapped_column(String(20), nullable=True)  # 수급·차상위 여부 (영구·매입임대 대상 판정)
    active_diagnosis_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 지금 '사용 중'으로 고른 진단 기록 id (없으면 가장 최근 기록)
    workplace_address: Mapped[str] = mapped_column(String(255), nullable=True)  # 직장 주소 (출퇴근 경로)
    home_address: Mapped[str] = mapped_column(String(255), nullable=True)  # 현재 집 주소 (출퇴근 비교)
