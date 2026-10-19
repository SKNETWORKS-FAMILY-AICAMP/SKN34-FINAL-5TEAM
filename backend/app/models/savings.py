from sqlalchemy import ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SavingsProduct(Base):
    """예금·적금 상품. 금감원 금융상품통합비교공시(파인)의 정기예금·적금 API에서 수집한다 (카드는 파인에 API가 없다)."""

    __tablename__ = "savings_products"
    __table_args__ = (UniqueConstraint("kind", "fin_co_no", "fin_prdt_cd", name="uq_savings_kind_company_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(10), index=True)  # 예금 | 적금
    fin_group: Mapped[str] = mapped_column(String(20), nullable=True)  # 은행 / 저축은행
    fin_co_no: Mapped[str] = mapped_column(String(20))
    fin_prdt_cd: Mapped[str] = mapped_column(String(50))
    company_name: Mapped[str] = mapped_column(String(100), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    join_way: Mapped[str] = mapped_column(String(255), nullable=True)
    maturity_interest: Mapped[str] = mapped_column(Text, nullable=True)  # 만기 후 이자율
    special_condition: Mapped[str] = mapped_column(Text, nullable=True)  # 우대조건
    join_deny: Mapped[str] = mapped_column(String(5), nullable=True)  # 1 제한없음 · 2 서민전용 · 3 일부제한
    join_member: Mapped[str] = mapped_column(String(255), nullable=True)  # 가입 대상
    etc_note: Mapped[str] = mapped_column(Text, nullable=True)
    max_limit: Mapped[int] = mapped_column(Numeric(14, 0), nullable=True)  # 최고 한도(원)
    disclosure_month: Mapped[str] = mapped_column(String(6), nullable=True)
    rate_min: Mapped[float] = mapped_column(Numeric(5, 2), nullable=True)  # 옵션 중 최저 기본금리(%)
    rate_max: Mapped[float] = mapped_column(Numeric(5, 2), nullable=True)  # 옵션 중 최고 우대금리(%)


class SavingsRateOption(Base):
    """한 행 = 상품 x 저축기간(개월) x 금리유형(단리/복리) (적금은 정액/자유 적립 포함)."""

    __tablename__ = "savings_rate_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("savings_products.id", ondelete="CASCADE"), index=True)
    save_months: Mapped[int] = mapped_column(Integer, nullable=True)
    rate_type: Mapped[str] = mapped_column(String(20), nullable=True)  # 단리 / 복리
    reserve_type: Mapped[str] = mapped_column(String(20), nullable=True)  # 정액적립식 / 자유적립식 (적금만)
    rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=True)  # 기본금리 %
    rate_best: Mapped[float] = mapped_column(Numeric(5, 2), nullable=True)  # 최고 우대금리 %
