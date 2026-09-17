from sqlalchemy import String, Numeric, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LoanProduct(Base):
    """기획안 5장 '대출 상품' 데이터에 대응.

    정책대출(디딤돌·보금자리론·버팀목 등)과 시중은행 상품을 함께 관리한다.
    """

    __tablename__ = "loan_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))  # 상품명
    category: Mapped[str] = mapped_column(String(20))  # "policy"(정책) | "bank"(시중은행)

    eligibility: Mapped[dict] = mapped_column(JSON, default=dict)  # 대상조건(소득/자산/지역)
    limit_amount: Mapped[int] = mapped_column(Numeric(14, 0), nullable=True)  # 한도(원)
    interest_rate_min: Mapped[float] = mapped_column(Numeric(5, 3), nullable=True)  # 최저금리
    interest_rate_max: Mapped[float] = mapped_column(Numeric(5, 3), nullable=True)  # 최고금리
    required_documents: Mapped[dict] = mapped_column(JSON, default=dict)  # 필요서류
