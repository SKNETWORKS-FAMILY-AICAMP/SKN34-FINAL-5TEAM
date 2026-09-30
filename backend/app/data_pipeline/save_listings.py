"""수집한 데이터를 Postgres에 저장(upsert)한다. API 호출은 *_client.py, DB 저장은 이 파일에서만 한다.

터미널에서 전체 수집:  cd backend && python -m app.data_pipeline.save_listings
  - 청약홈 공고 x 주택형 (전체 기간) → listings (source=applyhome)
  - 청약홈 경쟁률·당첨가점·특별공급 (전체 기간) → historical_results
  - LH 공고 목록 (최근 1년) → listings (source=lh), 공고별 상세·공급정보 원본 → lh_notice_details
  - SH 분양·임대 게시판 전체 글 (첨부파일·본문 포함) → sh_notices
  - 파인 대출 상품 + 금리 옵션 → loan_products, loan_rate_options
수집이 끝나면 가공 레이어(app/db/views.py)의 구체화 뷰를 다시 계산한다.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

import app.models  # noqa: F401 — create_all에 모든 테이블을 포함
from app.data_pipeline.applyhome_client import fetch_all_listings, fetch_notice_index
from app.data_pipeline.competition_client import fetch_historical_results
from app.data_pipeline.finlife_client import fetch_loan_products
from app.data_pipeline.lh_client import fetch_lh_notices, fetch_notice_detail, map_listing_rows
from app.data_pipeline.sh_client import fetch_sh_notices
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.db.views import create_views, refresh_views
from app.models.historical_result import HistoricalResult
from app.models.listing import Listing
from app.models.loan_product import LoanProduct, LoanRateOption
from app.models.notice_sources import LhNoticeDetail, ShNotice

BATCH_SIZE = 1000
LISTING_KEY = ("source", "external_id", "model_no")
RESULT_KEY = ("external_id", "unit_type", "result_type", "category_label")


def init_tables() -> None:
    Base.metadata.create_all(bind=engine)
    create_views(engine)


def upsert(model, rows: list[dict], key: tuple[str, ...], constraint: str) -> int:
    """같은 key가 있으면 갱신, 없으면 추가. 반환값: 저장한 행 수(중복 제거 후)."""
    unique = {tuple(row.get(k) for k in key): row for row in rows}
    if len(unique) < len(rows):
        print(f"  같은 키 중복 {len(rows) - len(unique)}행은 마지막 값으로 합침", flush=True)
    rows = list(unique.values())
    if not rows:
        return 0
    columns = sorted(set().union(*(row.keys() for row in rows)))
    rows = [{c: row.get(c) for c in columns} for row in rows]
    with engine.begin() as conn:
        for start in range(0, len(rows), BATCH_SIZE):
            stmt = insert(model).values(rows[start:start + BATCH_SIZE])
            stmt = stmt.on_conflict_do_update(
                constraint=constraint,
                set_={c: stmt.excluded[c] for c in columns if c not in key},
            )
            conn.execute(stmt)
    return len(rows)


def save_applyhome_listings(from_date: date | None = None) -> dict[str, dict]:
    rows, notice_index = fetch_all_listings(from_date)
    saved = upsert(Listing, rows, LISTING_KEY, "uq_listing_source_external_model")
    print(f"[저장] 청약홈 listings {saved}행", flush=True)
    return notice_index


def save_historical_results(notice_index: dict[str, dict] | None = None) -> None:
    rows = fetch_historical_results(notice_index if notice_index is not None else fetch_notice_index())
    saved = upsert(HistoricalResult, rows, RESULT_KEY, "uq_result_external_unit_type_category")
    print(f"[저장] historical_results {saved}행", flush=True)


def save_lh_listings() -> None:
    notices = fetch_lh_notices()
    if not notices:
        return
    # 1) 상세·공급정보 원본: 아직 성공적으로 받지 못한 공고만 호출
    with SessionLocal() as db:
        done = set(db.scalars(select(LhNoticeDetail.pan_id).where(LhNoticeDetail.error.is_(None))))
    pending = [n for n in notices if str(n.get("PAN_ID")) not in done]
    # LH 서버 응답이 호출당 2초 이상이라 5개씩 동시에 호출하고, 중간에 멈춰도 남도록 100건마다 저장
    saved = failed = 0
    with httpx.Client(timeout=60.0) as client, ThreadPoolExecutor(max_workers=5) as pool:
        for start in range(0, len(pending), 100):
            details = list(pool.map(lambda n: fetch_notice_detail(n, client), pending[start:start + 100]))
            saved += upsert(LhNoticeDetail, details, ("pan_id",), "uq_lh_notice_detail_pan_id")
            failed += sum(1 for d in details if d["error"])
            print(f"  LH 상세·공급정보 {start + len(details)}/{len(pending)}", flush=True)
    print(f"[저장] LH 상세·공급정보 {saved}건 (실패 {failed}건은 다음 수집 때 다시 시도)", flush=True)

    # 2) listings: 공고 x 주택형
    ids = [str(n.get("PAN_ID")) for n in notices]
    with SessionLocal() as db:
        stored = {d.pan_id: d for d in db.scalars(select(LhNoticeDetail).where(LhNoticeDetail.pan_id.in_(ids)))}
    rows = []
    for notice in notices:
        d = stored.get(str(notice.get("PAN_ID")))
        rows.extend(map_listing_rows(notice, d.detail if d else None, d.supply if d else None))
    # 공급정보가 바뀌면 주택형 행 구성도 바뀌므로, 이번에 받은 공고의 LH 행은 지우고 새로 넣는다
    with engine.begin() as conn:
        conn.execute(delete(Listing).where(Listing.source == "lh", Listing.external_id.in_(ids)))
    saved = upsert(Listing, rows, LISTING_KEY, "uq_listing_source_external_model")
    print(f"[저장] LH listings {saved}행 (공고 {len(notices)}건)", flush=True)


def save_sh_notices() -> None:
    with SessionLocal() as db:
        known = set(db.execute(select(ShNotice.board, ShNotice.seq).where(ShNotice.body_text.isnot(None))))
    notices = fetch_sh_notices(known)
    # 상세를 새로 읽은 글과 목록만 갱신할 글을 나눠 저장 (목록만 갱신할 때 본문·첨부를 지우지 않도록)
    with_detail = [n for n in notices if "body_text" in n]
    list_only = [n for n in notices if "body_text" not in n]
    saved = upsert(ShNotice, with_detail, ("board", "seq"), "uq_sh_notice_board_seq")
    saved += upsert(ShNotice, list_only, ("board", "seq"), "uq_sh_notice_board_seq")
    print(f"[저장] SH 게시판 {saved}건 (상세 새로 저장 {len(with_detail)}건)", flush=True)


def save_loan_products() -> None:
    products = {(p["product_type"], p["fin_co_no"], p["fin_prdt_cd"]): p for p in fetch_loan_products()}
    with SessionLocal() as db:
        for (product_type, fin_co_no, fin_prdt_cd), data in products.items():
            options = data.pop("options")
            product = db.scalar(select(LoanProduct).filter_by(
                product_type=product_type, fin_co_no=fin_co_no, fin_prdt_cd=fin_prdt_cd))
            if product is None:
                product = LoanProduct(**data)
                db.add(product)
                db.flush()
            else:
                for field, value in data.items():
                    setattr(product, field, value)
                db.execute(delete(LoanRateOption).where(LoanRateOption.loan_product_id == product.id))
            db.add_all(LoanRateOption(loan_product_id=product.id, **option) for option in options)
        db.commit()
    print(f"[저장] 대출 상품 {len(products)}개", flush=True)


def _run(step, *args):
    """한 출처가 실패해도 나머지 수집은 계속한다."""
    try:
        return step(*args)
    except Exception as exc:  # noqa: BLE001
        print(f"[실패] {step.__name__}: {exc.__class__.__name__} {exc}", flush=True)
        return None


def print_stats() -> None:
    with SessionLocal() as db:
        for source, count in db.execute(select(Listing.source, func.count()).group_by(Listing.source)):
            print(f"  listings[{source}] {count}행", flush=True)
        for result_type, count in db.execute(
            select(HistoricalResult.result_type, func.count()).group_by(HistoricalResult.result_type)
        ):
            print(f"  historical_results[{result_type}] {count}행", flush=True)
        for product_type, count in db.execute(
            select(LoanProduct.product_type, func.count()).group_by(LoanProduct.product_type)
        ):
            print(f"  loan_products[{product_type}] {count}개", flush=True)
        print(f"  sh_notices {db.scalar(select(func.count()).select_from(ShNotice))}건", flush=True)
        print(f"  lh_notice_details {db.scalar(select(func.count()).select_from(LhNoticeDetail))}건", flush=True)


def collect_all() -> None:
    """전체 수집 + 가공 레이어 갱신. 스케줄러가 매일 오전 6시에 실행한다."""
    init_tables()
    notice_index = _run(save_applyhome_listings)
    _run(save_historical_results, notice_index)
    _run(save_lh_listings)
    _run(save_sh_notices)
    _run(save_loan_products)
    _run(refresh_views, engine)
    print_stats()


if __name__ == "__main__":
    collect_all()
