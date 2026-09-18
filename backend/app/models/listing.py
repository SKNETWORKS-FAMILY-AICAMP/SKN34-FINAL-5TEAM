from sqlalchemy import String, Integer, Date, JSON, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Listing(Base):
    """기획안 5장 '청약 공고' 데이터에 대응. 청약홈 공공데이터 API에서 수집.

    한 공고(external_id = 청약홈 공고번호)에 평형(unit_type)이 여러 개 있을 수 있어서,
    이 테이블은 '공고 x 평형' 조합 하나당 한 행이다.

    house_type으로 APT / 오피스텔·도시형생활주택 / 무순위·잔여세대 를 구분한다
    (청약홈 API 자체가 주택 유형별로 엔드포인트가 나뉘어 있어서, 어느 엔드포인트에서
    가져온 데이터인지 표시해두는 용도).
    """

    __tablename__ = "listings"
    __table_args__ = (
        UniqueConstraint("external_id", "unit_type", name="uq_listing_external_unit"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    external_id: Mapped[str] = mapped_column(String(50), index=True)  # 청약홈 공고번호(PBLANC_NO)
    unit_type: Mapped[str] = mapped_column(String(30), nullable=True)  # 주택형(평형) 구분값
    house_type: Mapped[str] = mapped_column(String(30), default="APT", index=True)  # APT/오피스텔·도시형생활주택/무순위·잔여세대

    complex_name: Mapped[str] = mapped_column(String(255))  # 단지명
    region_code: Mapped[str] = mapped_column(String(20), index=True)  # 지역코드
    supply_type: Mapped[str] = mapped_column(String(50))  # 공급유형(일반/특별공급 세부)

    unit_size_sqm: Mapped[float] = mapped_column(Numeric(6, 2), nullable=True)  # 공급면적(㎡, SUPLY_AR)
    exclusive_area_sqm: Mapped[float] = mapped_column(Numeric(6, 2), nullable=True)  # 전용면적(㎡, HOUSE_TY에서 추출)
    unit_count: Mapped[int] = mapped_column(Integer, default=0)  # 평형별 공급세대수
    sale_price: Mapped[int] = mapped_column(Numeric(14, 0), nullable=True)  # 분양가(원 단위)

    receipt_start: Mapped[Date] = mapped_column(Date, nullable=True)  # 접수 시작일
    receipt_end: Mapped[Date] = mapped_column(Date, nullable=True)  # 접수 종료일
    announce_date: Mapped[Date] = mapped_column(Date, nullable=True)  # 당첨자발표일
    move_in_date: Mapped[Date] = mapped_column(Date, nullable=True)  # 입주예정월(1일로 저장)

    hssply_adres: Mapped[str] = mapped_column(String(500), nullable=True)  # 공급위치(주소)
    pblanc_url: Mapped[str] = mapped_column(String(500), nullable=True)  # 공고 원문 URL

    eligibility: Mapped[dict] = mapped_column(JSON, default=dict)  # 자격요건(무주택기간/거주지역/소득기준 등)
