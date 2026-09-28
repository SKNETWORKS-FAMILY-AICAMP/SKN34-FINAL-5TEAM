from sqlalchemy import String, Integer, Date, JSON, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Listing(Base):
    """기획안 5장 '청약 공고' 데이터에 대응. 청약홈 공공데이터 API에서 수집."""

    __tablename__ = "listings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    external_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)  # 청약홈 공고ID

    complex_name: Mapped[str] = mapped_column(String(255))  # 단지명
    address: Mapped[str] = mapped_column(String(255), nullable=True) # 공급위치
    notice_url: Mapped[str] = mapped_column(String(500), nullable=True) # 공고 원문
    region_code: Mapped[str] = mapped_column(String(20), index=True)  # 지역코드
    supply_type: Mapped[str] = mapped_column(String(50))  # 공급유형(일반/특별공급 세부)

    unit_size_sqm: Mapped[float] = mapped_column(Numeric(6, 2), nullable=True)  # 평형(㎡)
    unit_count: Mapped[int] = mapped_column(Integer, default=0)  # 평형별 세대수
    sale_price: Mapped[int] = mapped_column(Numeric(14, 0), nullable=True)  # 분양가(원)

    receipt_start: Mapped[Date] = mapped_column(Date, nullable=True)  # 접수 시작일
    receipt_end: Mapped[Date] = mapped_column(Date, nullable=True)  # 접수 종료일
    announce_date: Mapped[Date] = mapped_column(Date, nullable=True)  # 발표일
    move_in_date: Mapped[Date] = mapped_column(Date, nullable=True)  # 입주예정일

    eligibility: Mapped[dict] = mapped_column(JSON, default=dict)  # 자격요건(무주택기간/거주지역/소득기준 등)
