from sqlalchemy import JSON, BigInteger, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BankbookStat(Base):
    """청약홈 청약통장 통계 조회 서비스(ApplyhomeBnkbStatSvc) 원본. API 1행 = 1행, 모든 응답 필드를 컬럼으로.

    kind: 전체(getBnkbAcnutAllStat) / 통장별(getBnkbAcnutDpstStat) / 가입기간별(getBnkbAcnutSbscrbStat)
    기능마다 주는 필드가 달라서 해당 없는 컬럼은 NULL이다. 값은 계산·합산 없이 API 그대로.
    """

    __tablename__ = "bankbook_stats"
    __table_args__ = (Index("ix_bankbook_stats_kind_month", "kind", "year_month"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))
    year_month: Mapped[str] = mapped_column(String(6))  # DELNG_OCCRRNC_YM 거래발생년월 (YYYYMM)
    sido_name: Mapped[str] = mapped_column(String(20), nullable=True)  # SIDO_NM (통장별·가입기간별)
    area_code: Mapped[str] = mapped_column(String(10), nullable=True)  # SUBSCRPT_AREA_CODE 청약지역코드
    area_name: Mapped[str] = mapped_column(String(30), nullable=True)  # SUBSCRPT_AREA_CODE_NM
    item_code: Mapped[str] = mapped_column(String(4), nullable=True)  # DPST_ITEM 01 청약예금 02 청약부금 03 청약저축 04 종합저축
    item_name: Mapped[str] = mapped_column(String(20), nullable=True)  # DPST_ITEM_NM
    balance_code: Mapped[str] = mapped_column(String(4), nullable=True)  # BLNC_SECD 01 85㎡ 이하 02 102㎡ 이하 03 135㎡ 이하 04 모든면적
    balance_name: Mapped[str] = mapped_column(String(20), nullable=True)  # BLNC_SECD_NM
    period_code: Mapped[str] = mapped_column(String(4), nullable=True)  # SBSCRB_PD_CODE 가입기간 (01 6개월 미만 … 17 15년 이상)
    period_name: Mapped[str] = mapped_column(String(30), nullable=True)  # SBSCRB_PD_CODE_NM
    rank1_count: Mapped[int] = mapped_column(Integer, nullable=True)  # RNK1_ACNUT_CO 1순위 계좌수 (전체·통장별)
    rank2_count: Mapped[int] = mapped_column(Integer, nullable=True)  # RNK2_ACNUT_CO 2순위 계좌수
    account_count: Mapped[int] = mapped_column(Integer, nullable=True)  # ACNUT_CO 계좌수 (가입기간별)
    extra: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # 위 컬럼에 없는 응답 필드 (API에 새 필드가 생기면 여기에)


class SubscriptionStat(Base):
    """청약홈 청약 신청·당첨자 정보 조회 서비스(ApplyhomeStatSvc) 원본. API 1행 = 1행, 모든 응답 필드를 컬럼으로.

    kind: 지역별 신청자 / 연령별 신청자 / 지역별 당첨자 / 연령별 당첨자 / 지역별 경쟁률
    """

    __tablename__ = "subscription_stats"
    __table_args__ = (Index("ix_subscription_stats_kind_month", "kind", "year_month"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    year_month: Mapped[str] = mapped_column(String(6))  # STAT_DE 제공연월 (YYYYMM)
    area_code: Mapped[str] = mapped_column(String(10), nullable=True)  # SUBSCRPT_AREA_CODE 공급지역코드 (지역별)
    area_name: Mapped[str] = mapped_column(String(30), nullable=True)
    age_30: Mapped[int] = mapped_column(Integer, nullable=True)  # 30대 이하 신청(당첨) 건수
    age_40: Mapped[int] = mapped_column(Integer, nullable=True)
    age_50: Mapped[int] = mapped_column(Integer, nullable=True)
    age_60: Mapped[int] = mapped_column(Integer, nullable=True)  # 60대 이상
    special_supply_count: Mapped[int] = mapped_column(Integer, nullable=True)  # SPSPLY_HSHLDCO 특별공급 공급세대수 (지역별 경쟁률)
    special_apply_count: Mapped[int] = mapped_column(Integer, nullable=True)  # SPSPLY_REQ_CNT
    special_rate: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)  # SPSPLY_CMPET_RATE가 숫자일 때만
    special_rate_text: Mapped[str] = mapped_column(String(20), nullable=True)  # 원문 그대로. "(△178)" = 178세대 미달
    general_rate_text: Mapped[str] = mapped_column(String(20), nullable=True)  # SUPLY_CMPET_RATE 원문 그대로
    general_supply_count: Mapped[int] = mapped_column(Integer, nullable=True)  # SUPLY_HSHLDCO 일반공급 공급세대수
    general_apply_count: Mapped[int] = mapped_column(Integer, nullable=True)  # SUPLY_REQ_CNT
    general_rate: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)  # SUPLY_CMPET_RATE가 숫자일 때만 (미달이면 NULL — 계산은 가공 레이어에서)
    raw: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # API 응답 행 원본 그대로
