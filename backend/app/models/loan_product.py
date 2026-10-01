from sqlalchemy import JSON, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LoanProduct(Base):
    """기획안 5장 '대출 상품' 데이터에 대응.

    정책대출(디딤돌·보금자리론·버팀목 등)과 시중 금융회사 상품을 함께 관리한다.
    시중 상품은 금감원 금융상품통합비교공시(파인) API에서 수집 (source="finlife").
    """

    __tablename__ = "loan_products"
    __table_args__ = (
        UniqueConstraint("product_type", "fin_co_no", "fin_prdt_cd", name="uq_loan_product_type_company_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))  # "금융회사 상품명"
    category: Mapped[str] = mapped_column(String(20))  # "policy"(정책) | "bank"(시중 금융회사)
    source: Mapped[str] = mapped_column(String(20), nullable=True)  # finlife
    product_type: Mapped[str] = mapped_column(String(20), nullable=True)  # 주택담보대출 / 전세자금대출 / 개인신용대출
    fin_group: Mapped[str] = mapped_column(String(20), nullable=True)  # 은행 / 저축은행 / 보험 / 여신전문 / 금융투자
    company_name: Mapped[str] = mapped_column(String(100), nullable=True)
    fin_co_no: Mapped[str] = mapped_column(String(20), nullable=True)
    fin_prdt_cd: Mapped[str] = mapped_column(String(50), nullable=True)
    join_way: Mapped[str] = mapped_column(String(255), nullable=True)  # 가입 방법
    loan_limit_text: Mapped[str] = mapped_column(String(1000), nullable=True)  # 대출 한도 (문장형, 예: "LTV 70%")
    extra_cost_text: Mapped[str] = mapped_column(String(1000), nullable=True)  # 대출 부대비용
    prepayment_fee_text: Mapped[str] = mapped_column(String(1000), nullable=True)  # 중도상환 수수료
    delay_rate_text: Mapped[str] = mapped_column(String(1000), nullable=True)  # 연체 이자율
    disclosure_month: Mapped[str] = mapped_column(String(6), nullable=True)  # 공시 제출월 (YYYYMM)
    disclosure_start: Mapped[str] = mapped_column(String(8), nullable=True)  # 공시 시작일 (dcls_strt_day, YYYYMMDD)
    disclosure_end: Mapped[str] = mapped_column(String(8), nullable=True)  # 공시 종료일 (dcls_end_day, 없으면 공시 중)
    submitted_at: Mapped[str] = mapped_column(String(14), nullable=True)  # 금융회사 제출일시 (fin_co_subm_day)
    credit_product_type: Mapped[str] = mapped_column(String(10), nullable=True)  # 신용대출 상품 구분 코드 (crdt_prdt_type)
    credit_product_type_name: Mapped[str] = mapped_column(String(50), nullable=True)  # 일반신용대출 / 마이너스한도대출 등
    cb_name: Mapped[str] = mapped_column(String(50), nullable=True)  # 신용대출 금리 산정에 쓴 신용평가회사
    raw: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # API 상품 행(baseList) 원본 그대로

    eligibility: Mapped[dict] = mapped_column(JSON, default=dict)  # 대상조건(소득/자산/지역)
    limit_amount: Mapped[int] = mapped_column(Numeric(14, 0), nullable=True)  # 한도(원) — 파인은 금액이 아닌 문장으로만 제공
    interest_rate_min: Mapped[float] = mapped_column(Numeric(5, 3), nullable=True)  # 옵션 중 최저금리
    interest_rate_max: Mapped[float] = mapped_column(Numeric(5, 3), nullable=True)  # 옵션 중 최고금리
    required_documents: Mapped[dict] = mapped_column(JSON, default=dict)  # 필요서류


class LoanRateOption(Base):
    """파인 대출 상품의 금리 옵션. 한 행 = 상품 x (담보유형·상환방식·금리유형)."""

    __tablename__ = "loan_rate_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    loan_product_id: Mapped[int] = mapped_column(ForeignKey("loan_products.id", ondelete="CASCADE"), index=True)
    collateral_type: Mapped[str] = mapped_column(String(30), nullable=True)  # 아파트 / 아파트외 (주담대)
    repay_type: Mapped[str] = mapped_column(String(30), nullable=True)  # 분할상환 / 만기일시상환
    rate_type: Mapped[str] = mapped_column(String(30), nullable=True)  # 고정금리 / 변동금리 / (신용대출) 대출금리·기준금리·가산금리
    rate_min: Mapped[float] = mapped_column(Numeric(6, 3), nullable=True)
    rate_max: Mapped[float] = mapped_column(Numeric(6, 3), nullable=True)
    rate_avg: Mapped[float] = mapped_column(Numeric(6, 3), nullable=True)  # 전월 취급 평균금리
    credit_grade_rates: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # 신용대출: 신용점수 구간별 금리
    collateral_code: Mapped[str] = mapped_column(String(10), nullable=True)  # mrtg_type
    repay_code: Mapped[str] = mapped_column(String(10), nullable=True)  # rpay_type
    rate_type_code: Mapped[str] = mapped_column(String(10), nullable=True)  # lend_rate_type / crdt_lend_rate_type
    raw: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # API 금리 옵션 행(optionList) 원본 그대로
