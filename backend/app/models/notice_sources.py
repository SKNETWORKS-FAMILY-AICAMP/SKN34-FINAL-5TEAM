from sqlalchemy import JSON, Date, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ShNotice(Base):
    """SH(서울주택도시공사) 분양·임대 게시판 글. 공식 API가 없어 홈페이지 목록·상세 페이지에서 수집.

    청약 공고 외에 당첨자 발표·계약 안내·등기 안내 같은 공지도 함께 있다. 평형·금액은 첨부 공고문 안에만 있다.
    """

    __tablename__ = "sh_notices"
    __table_args__ = (UniqueConstraint("board", "seq", name="uq_sh_notice_board_seq"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    board: Mapped[str] = mapped_column(String(10))  # 분양 / 임대
    seq: Mapped[str] = mapped_column(String(20))  # 게시글 고유번호
    number: Mapped[int] = mapped_column(Integer, nullable=True)  # 게시판에 보이는 글 번호
    title: Mapped[str] = mapped_column(String(500))
    department: Mapped[str] = mapped_column(String(100), nullable=True)  # 담당 부서
    posted_date: Mapped[Date] = mapped_column(Date, nullable=True, index=True)  # 등록일
    views: Mapped[int] = mapped_column(Integer, nullable=True)  # 조회수 (수집 시점)
    attachment_count: Mapped[int] = mapped_column(Integer, nullable=True)
    attachments: Mapped[list] = mapped_column(JSON(none_as_null=True), nullable=True)  # 첨부파일 이름 목록
    body_text: Mapped[str] = mapped_column(Text, nullable=True)  # 본문 텍스트 전체
    url: Mapped[str] = mapped_column(String(500))


class LhNoticeDetail(Base):
    """LH 공고별 상세·공급정보 API 응답 원본 (lhLeaseNoticeDtlInfo1, lhLeaseNoticeSplInfo1).

    응답 필드를 실제로 확인하기 전이라 원본 JSON 그대로 보관한다. 공고 목록 행(notice)에는 두 API를 호출할 때
    필요한 코드(SPL_INF_TP_CD, CCR_CNNT_SYS_DS_CD, UPP_AIS_TP_CD, AIS_TP_CD)가 들어 있다.
    """

    __tablename__ = "lh_notice_details"
    __table_args__ = (UniqueConstraint("pan_id", name="uq_lh_notice_detail_pan_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pan_id: Mapped[str] = mapped_column(String(30))  # listings.external_id (source='lh')
    notice: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # 공고 목록 API 원본 행
    detail: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # 상세정보 API 원본 응답
    supply: Mapped[dict] = mapped_column(JSON(none_as_null=True), nullable=True)  # 공급정보 API 원본 응답
    error: Mapped[str] = mapped_column(String(300), nullable=True)  # 호출 실패 사유 (있으면 다음 수집 때 다시 시도)
    fetched_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
