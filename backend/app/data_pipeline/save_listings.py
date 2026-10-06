"""수집한 데이터를 Postgres에 저장(upsert)한다. API 호출은 *_client.py, DB 저장은 이 파일에서만 한다.

터미널에서 전체 수집:  cd backend && python -m app.data_pipeline.save_listings
  - 청약홈 공고 x 주택형 (전체 기간) → listings (source=applyhome)
  - 청약홈 경쟁률·당첨가점·특별공급 (전체 기간) → historical_results
  - LH 공고 목록 (API가 주는 전체 기간, 2010년~) → listings (source=lh), 공고별 상세·공급정보 원본 → lh_notice_details
    (전체 기간 첫 수집은 일일 호출 한도 때문에 며칠에 걸쳐 최신 공고부터 채워진다)
  - 청약홈·LH·파인 행에는 API 응답 원본(raw JSON)을 같이 저장한다. 행 필터 없이 응답 그대로
  - SH 분양·임대 게시판 전체 글 (첨부파일·본문 포함) → sh_notices
  - 접수 예정·접수 중인 공고의 공고문 PDF → notice_documents, 주택형별 계약금 → notice_costs
    (LH 매입임대 등 주택별 금액은 첨부 주택목록 엑셀 → lh_rental_houses)
    → 화면용 계약금 칸 listings.deposit_* (팀원 방식: 공고문에 적힌 숫자만, 10%로 채우지 않음)
  - 파인 대출 상품 + 금리 옵션 → loan_products, loan_rate_options
수집이 끝나면 가공 레이어(app/db/views.py)의 구체화 뷰를 다시 계산한다.
"""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import httpx
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert

import app.models  # noqa: F401 — create_all에 모든 테이블을 포함
from app.data_pipeline.applyhome_client import fetch_all_listings, fetch_notice_index
from app.data_pipeline.competition_client import fetch_historical_results
from app.data_pipeline.document_client import (
    NO_AMOUNT_METHODS,
    applyhome_document,
    fallback_cost,
    lh_document,
    lh_extra_documents,
    listing_costs,
    option_costs,
    read_pdf,
    receipt_period,
    sh_document,
    sh_extra_documents,
)
from app.data_pipeline.finlife_client import fetch_loan_products
from app.data_pipeline.house_list_client import house_costs, house_list_files, read_house_list
from app.data_pipeline.lh_client import fetch_lh_notices, fetch_notice_detail, map_listing_rows
from app.data_pipeline.notice_parser import parse_deposit_text
from app.data_pipeline.stats_client import (
    BANKBOOK_ENDPOINTS,
    BANKBOOK_MONTH,
    SUBSCRIPTION_ENDPOINTS,
    SUBSCRIPTION_MONTH,
    NotApproved,
    fetch_pages,
    map_bankbook_row,
    map_subscription_row,
)
from app.data_pipeline.sh_client import fetch_attachment_links, fetch_sh_notices, is_recruitment
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.db.views import create_views, refresh_views
from app.models.applyhome_stat import BankbookStat, SubscriptionStat
from app.models.historical_result import HistoricalResult
from app.models.listing import Listing
from app.models.loan_product import LoanProduct, LoanRateOption
from app.models.notice_sources import CollectRun, LhNoticeDetail, LhRentalHouse, NoticeCost, NoticeDocument, NoticeOptionCost, ShNotice

BATCH_SIZE = 1000
LISTING_KEY = ("source", "external_id", "model_no")
RESULT_KEY = ("external_id", "unit_type", "result_type", "category_label")
VOLATILE = ("RNUM", "ALL_CNT")  # LH 목록 행에서 공고 내용과 무관하게 매번 바뀌는 필드


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
    # 1) 상세·공급정보 원본: 아직 받지 못했거나 실패한 공고 + 목록 행이 바뀐 공고(상태·일정 변경)만 호출
    with SessionLocal() as db:
        stored_notices = dict(db.execute(select(LhNoticeDetail.pan_id, LhNoticeDetail.notice)
                                         .where(LhNoticeDetail.error.is_(None))).all())
    # 목록 행의 RNUM(행 번호)·ALL_CNT(전체 건수)는 날마다 바뀌므로 비교에서 뺀다
    def same(a, b):
        return a is not None and {k: v for k, v in a.items() if k not in VOLATILE} == \
            {k: v for k, v in b.items() if k not in VOLATILE}
    pending = [n for n in notices if not same(stored_notices.get(str(n.get("PAN_ID"))), n)]
    # 최신 공고부터 (전체 기간 첫 수집은 일일 호출 한도 때문에 며칠에 걸쳐 끝나므로 최근 것을 먼저 채운다)
    pending.sort(key=lambda n: str(n.get("PAN_NT_ST_DT") or ""), reverse=True)
    # LH 서버 응답이 호출당 2초 이상이라 5개씩 동시에 호출하고, 중간에 멈춰도 남도록 100건마다 저장
    saved = failed = 0
    with httpx.Client(timeout=60.0) as client, ThreadPoolExecutor(max_workers=5) as pool:
        for start in range(0, len(pending), 100):
            details = list(pool.map(lambda n: fetch_notice_detail(n, client), pending[start:start + 100]))
            ok = [d for d in details if not d["error"]]
            saved += upsert(LhNoticeDetail, ok, ("pan_id",), "uq_lh_notice_detail_pan_id")
            # 실패한 공고는 예전 원본을 덮어쓰지 않고 오류만 남긴다 (처음 받는 공고면 행을 새로 만듦)
            for d in (d for d in details if d["error"]):
                if str(d["pan_id"]) in stored_notices:
                    with engine.begin() as conn:
                        conn.execute(update(LhNoticeDetail).where(LhNoticeDetail.pan_id == d["pan_id"])
                                     .values(error=d["error"]))
                else:
                    upsert(LhNoticeDetail, [d], ("pan_id",), "uq_lh_notice_detail_pan_id")
            failed += len(details) - len(ok)
            print(f"  LH 상세·공급정보 {start + len(details)}/{len(pending)} (실패 {failed})", flush=True)
            if not ok:
                # 100건이 모두 실패 = 일일 호출 한도 초과나 서버 장애. 남은 공고는 다음 수집 때 이어서 받는다
                print(f"[LH] 100건 연속 실패로 중단 — 남은 {len(pending) - start - len(details)}건은 다음 수집 때 이어서", flush=True)
                break
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
    # 단, 넣어 둔 계약금(deposit_*, save_listing_deposits)은 같은 공고·주택형에 그대로 옮긴다
    with SessionLocal() as db:
        kept = {(eid, mno): (rate, amount, status) for eid, mno, rate, amount, status in db.execute(
            select(Listing.external_id, Listing.model_no, Listing.deposit_rate, Listing.deposit_amount_won,
                   Listing.deposit_status).where(Listing.source == "lh", Listing.external_id.in_(ids),
                                                 (Listing.deposit_rate.is_not(None)) | (Listing.deposit_amount_won.is_not(None))
                                                 | (Listing.deposit_status.is_not(None))))}
    for row in rows:
        if (row["external_id"], row.get("model_no")) in kept:
            row["deposit_rate"], row["deposit_amount_won"], row["deposit_status"] = kept[(row["external_id"], row.get("model_no"))]
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


def _document_for(source: str, external_id: str, notice_url: str | None, client: httpx.Client) -> dict:
    row = {"source": source, "external_id": external_id, "file_name": None, "url": None,
           "status": "no_document", "error": None, "page_count": None, "text": None}
    extras = []
    try:
        if source == "lh":
            with SessionLocal() as db:
                detail = db.scalar(select(LhNoticeDetail.detail).where(LhNoticeDetail.pan_id == external_id))
            row["file_name"], row["url"] = lh_document(detail)
            extras = lh_extra_documents(detail)
        elif source == "sh":
            with SessionLocal() as db:
                links = db.scalar(select(ShNotice.attachment_links).where(ShNotice.seq == external_id))
            row["file_name"], row["url"] = sh_document(links)
            extras = sh_extra_documents(links)
        else:
            row["file_name"], row["url"] = applyhome_document(notice_url, client)
        if row["url"]:
            row["text"], row["page_count"] = read_pdf(row["url"], client)
            # 호별 금액이 있는 첨부(공급가격·주택목록)는 공고문 텍스트 뒤에 이어 붙인다
            for name, url in extras:
                if url != row["url"]:
                    extra_text, _ = read_pdf(url, client)
                    row["text"] += f"\n\n[첨부] {name}\n{extra_text}"
            row["status"] = "ok"
    except Exception as exc:  # noqa: BLE001 — 한 공고문 실패가 전체를 멈추지 않게
        row.update(status="error", error=f"{exc.__class__.__name__}: {exc}"[:300])
    return row


def save_notice_costs(reparse_only: bool = False) -> None:
    """접수 예정·접수 중인 공고 중 공고문을 아직 못 읽은 공고만 공고문을 받아 계약금을 추출한다.

    reparse_only=True면 새로 내려받지 않고 저장된 공고문 텍스트로 계약금만 다시 계산한다 (추출 규칙을 고쳤을 때).
    """
    with SessionLocal() as db:
        targets = db.execute(text(
            "SELECT DISTINCT source, external_id, notice_url FROM recommendable_listings"
        )).all()
        done = set(db.execute(select(NoticeDocument.source, NoticeDocument.external_id)
                              .where(NoticeDocument.status != "error")))
    pending = [] if reparse_only else [t for t in targets if (t.source, t.external_id) not in done]
    if pending:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client, ThreadPoolExecutor(max_workers=4) as pool:
            documents = list(pool.map(lambda t: _document_for(t.source, t.external_id, t.notice_url, client), pending))
        upsert(NoticeDocument, documents, ("source", "external_id"), "uq_notice_document_source_external")
        print(f"[공고문] 새로 {len(documents)}건 — " + ", ".join(
            f"{status} {count}" for status, count in Counter(d["status"] for d in documents).items()), flush=True)

    lh_ids = sorted(t.external_id for t in targets if t.source == "lh")
    if not reparse_only:
        save_lh_house_lists(lh_ids)

    notices = {(t.source, t.external_id) for t in targets}
    with SessionLocal() as db:
        # 파일명에도 계약금이 적힌 경우가 있다 (예: "…선착순동호지정공고(계약금500만원,3년무이자할부).pdf")
        texts = {(d.source, d.external_id): f"{d.file_name or ''}\n{d.text or ''}"
                 for d in db.scalars(select(NoticeDocument).where(NoticeDocument.status == "ok"))
                 if (d.source, d.external_id) in notices}
        houses = {}
        for house in db.scalars(select(LhRentalHouse).where(LhRentalHouse.pan_id.in_(lh_ids))):
            houses.setdefault(("lh", house.pan_id), []).append(
                {c: getattr(house, c) for c in ("address", "ho", "house_label", "exclusive_area_sqm", "rent_deposit",
                                                "condition_group", "file_name", "sheet", "seq")})
        costs, options = [], []
        for source, external_id in notices:
            doc_text = texts.get((source, external_id), "")
            units = [dict(u) for u in db.execute(
                select(Listing.source, Listing.external_id, Listing.model_no, Listing.unit_type, Listing.sale_price,
                       Listing.rent_deposit, Listing.address, Listing.complex_name, Listing.exclusive_area_sqm,
                       Listing.supply_type)
                .where(Listing.source == source, Listing.external_id == external_id)).mappings()]
            # 제목에도 계약금이 적힌 경우가 있다 (예: "(계약금 1,000만원)청주지북B1블록 공공분양 …")
            if units and units[0]["complex_name"]:
                doc_text = units[0]["complex_name"] + "\n" + doc_text
            found = listing_costs(doc_text, units)
            # 공고문에서 못 찾은 행은 첨부 주택목록의 임대보증금으로 (매입임대 등)
            covered = {c["model_no"] for c in found}
            found += house_costs([u for u in units if u["model_no"] not in covered], houses.get((source, external_id), []))
            # 그래도 없으면 보증금만 있는 표 / 전세임대 본인부담 / 배정 시 안내
            covered = {c["model_no"] for c in found}
            found += [c for u in units if u["model_no"] not in covered for c in [fallback_cost(u, doc_text)] if c]
            costs.extend(found)
            # 분양 공고는 옵션(발코니 확장·선택품목) 계약금 원문도 따로 저장 (주택 계약금과 합치지 않음)
            if any(u["sale_price"] or "분양" in (u["supply_type"] or "") or "매각" in (u["complex_name"] or "")
                   for u in units):
                options += [{"source": source, "external_id": external_id, "seq": i, **o}
                            for i, o in enumerate(option_costs(texts.get((source, external_id), "")), 1)]
        # 다시 계산한 공고의 이전 결과는 지운다 (규칙이 바뀌어 더 이상 안 잡히는 행이 남지 않도록)
        for source, external_id in notices:
            for model in (NoticeCost, NoticeOptionCost):
                db.execute(delete(model).where(model.source == source, model.external_id == external_id))
        db.commit()
    saved = upsert(NoticeCost, costs, ("source", "external_id", "model_no"), "uq_notice_cost_listing")
    upsert(NoticeOptionCost, options, ("source", "external_id", "seq"), "uq_notice_option_cost")
    print(f"[계약금] 공고문·주택목록 {len(notices)}건에서 주택형 {saved}행 — " + ", ".join(
        f"{method} {count}" for method, count in Counter(c["method"] for c in costs).items()), flush=True)
    print(f"[옵션 계약금] 분양 공고 {len({(o['source'], o['external_id']) for o in options})}건에서 "
          f"{len(options)}줄 (발코니 확장·선택품목 원문)", flush=True)


def save_lh_house_lists(pan_ids: list[str]) -> None:
    """LH 공고 첨부 주택목록 엑셀 → lh_rental_houses. 아직 안 읽은 공고만 (실패한 공고는 다음 수집 때 다시).

    내려받기 상태는 notice_documents에 source='lh_list'로 남긴다 (page_count = 읽은 주택 수).
    """
    with SessionLocal() as db:
        done = set(db.scalars(select(NoticeDocument.external_id).where(
            NoticeDocument.source == "lh_list", NoticeDocument.status != "error")))
        details = dict(db.execute(select(LhNoticeDetail.pan_id, LhNoticeDetail.detail)
                                  .where(LhNoticeDetail.pan_id.in_([p for p in pan_ids if p not in done]))).all())
    if not details:
        return
    documents, houses = [], []
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        for pan_id, detail in details.items():
            files = house_list_files(detail)
            row = {"source": "lh_list", "external_id": pan_id, "file_name": ", ".join(n for n, _ in files)[:300] or None,
                   "url": files[0][1] if files else None, "status": "no_document", "error": None, "page_count": None,
                   "text": None}
            try:
                found = []
                for name, url in files:
                    response = client.get(url)
                    response.raise_for_status()
                    found += [{"pan_id": pan_id, "file_name": name[:300], **h} for h in read_house_list(response.content)]
                if files:
                    row.update(status="ok", page_count=len(found))
                    houses += found
            except Exception as exc:  # noqa: BLE001 — 한 파일 실패가 전체를 멈추지 않게
                row.update(status="error", error=f"{exc.__class__.__name__}: {exc}"[:300])
            documents.append(row)
    read = {h["pan_id"] for h in houses}
    with engine.begin() as conn:
        conn.execute(delete(LhRentalHouse).where(LhRentalHouse.pan_id.in_(read)))
    upsert(LhRentalHouse, houses, ("pan_id", "file_name", "sheet", "seq"), "uq_lh_rental_house")
    upsert(NoticeDocument, documents, ("source", "external_id"), "uq_notice_document_source_external")
    print(f"[주택목록] LH 공고 {len(documents)}건 확인 — 주택목록 있음 {len(read)}건, 주택 {len(houses)}호", flush=True)


# 계약금 칸에 넣는 notice_costs.method — 공고문 표·문장에 이 주택형의 계약금으로 적힌 숫자
DEPOSIT_AMOUNT_METHODS = ("공고문 표", "공고문 표(가격 일치)", "공고문 표(면적 일치)", "공고문 표(주택형 숫자 일치)",
                          "공고문 정액")
DEPOSIT_RATE_METHODS = ("공고문 비율",)  # 비율만 넣는다 (금액은 화면에서 분양가 x 비율, services/listing_view.py)
# 보증금 칸(rent_deposit)에 넣는 method — 이 주택형의 임대보증금이 그대로 적힌 경우 (계약금 칸에는 넣지 않음)
RENT_DEPOSIT_METHODS = ("주택목록 보증금", "공고문 본인부담 보증금")
# …최솟값·면적 추정 연결은 이 주택형의 숫자가 아니라서 어느 칸에도 넣지 않는다


def save_listing_deposits() -> None:
    """계약금 — 팀원 방식(notice_parser.py)의 칸 listings.deposit_rate / deposit_amount_won / deposit_status를 채운다.

    10%로 채우지 않고 공고문에 적힌 숫자만 넣는다. 접수 예정·접수 중 공고는 수집 때마다 다시 계산한다:
      1) 공고문 추출(notice_costs)이 이 주택형의 계약금 숫자를 찾았으면 그 숫자 (금액, 또는 비율)
      2) 공고에 금액이 아직 없다고 적혀 있으면 (배정 시 안내·주택 선택 후 결정) deposit_status="later"
      3) 그 밖에는 받아 둔 공고문 텍스트(notice_documents)에 팀원 규칙(parse_deposit_text)을 그대로 적용
    임대보증금만 있는 행은 계약금 칸을 비워 두고, 그 주택형의 보증금을 rent_deposit(비어 있을 때만)에 넣는다.
    화면·API의 계약금은 이 값을 쓴다 (services/listing_view.py).
    """
    with SessionLocal() as db:
        ids = [row.id for row in db.execute(text("SELECT id FROM recommendable_listings"))]
        rows = db.scalars(select(Listing).where(Listing.id.in_(ids))).all()
        costs = {(c.source, c.external_id, c.model_no): c for c in db.scalars(select(NoticeCost))}
        texts = {(d.source, d.external_id): f"{d.file_name or ''}\n{d.text or ''}"
                 for d in db.scalars(select(NoticeDocument).where(NoticeDocument.status == "ok"))}
        rule = {}  # 팀원 규칙은 공고 1건에 결과 1개
        counts, rents = Counter(), 0
        for row in rows:
            cost = costs.get((row.source, row.external_id, row.model_no))
            method = cost.method if cost else None
            rate = amount = status = None
            if method in DEPOSIT_AMOUNT_METHODS:
                amount, how = int(cost.contract_deposit), "공고문 표·정액"
            elif method in DEPOSIT_RATE_METHODS:
                rate, how = float(cost.contract_ratio) / 100, "공고문 비율"
            elif method in NO_AMOUNT_METHODS:
                status, how = "later", "추후 안내"
            else:
                key = (row.source, row.external_id)
                if key not in rule:
                    rule[key] = parse_deposit_text(texts[key]) if key in texts else None
                facts = rule[key]
                if facts is None:
                    how = "공고문 없음"
                else:
                    rate, amount, status = facts.rate, facts.amount_won, facts.status
                    how = "팀원 규칙(숫자 없음)" if status == "none" else "팀원 규칙"
            row.deposit_rate, row.deposit_amount_won, row.deposit_status = rate, amount, status
            if method in RENT_DEPOSIT_METHODS and row.rent_deposit is None:
                row.rent_deposit = int(cost.contract_deposit)
                rents += 1
            counts[how] += 1
        db.commit()
    print(f"[계약금(공고문 숫자)] 접수 예정·접수 중 {len(rows)}행 — " + ", ".join(
        f"{how} {count}" for how, count in counts.most_common()) + f" / 임대보증금 칸 채움 {rents}행", flush=True)


def save_sh_recruitments(days: int = 90) -> None:
    """최근 SH 모집 공고의 공고문에서 접수기간을 읽어 listings(source=sh)에 넣는다.

    SH 게시판에는 접수일 필드가 없어서, 공고문 PDF(없으면 본문)의 "접수기간 …"을 읽는다.
    접수기간을 찾은 공고만 listings에 들어가고, 접수 예정·접수 중이면 추천 대상이 된다.
    """
    since = date.today() - timedelta(days=days)
    with SessionLocal() as db:
        notices = [n for n in db.scalars(select(ShNotice).where(ShNotice.posted_date >= since)) if is_recruitment(n.title)]
        docs = {d.external_id: (d.status, d.text)
                for d in db.scalars(select(NoticeDocument).where(NoticeDocument.source == "sh"))}
    # 링크가 없는 글(첨부 링크 저장 기능 이전에 받은 글)은 상세 페이지를 다시 읽어 링크를 채운다
    missing = [n for n in notices if n.attachment_links is None and n.attachment_count]
    for n in missing:
        n.attachment_links = fetch_attachment_links(n.url)
    if missing:
        with engine.begin() as conn:
            for n in missing:
                conn.execute(update(ShNotice).where(ShNotice.board == n.board, ShNotice.seq == n.seq)
                             .values(attachment_links=n.attachment_links))
    pending = [n for n in notices if n.seq not in docs or docs[n.seq][0] == "error"]
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        new_docs = [_document_for("sh", n.seq, n.url, client) for n in pending]
    if new_docs:
        upsert(NoticeDocument, new_docs, ("source", "external_id"), "uq_notice_document_source_external")
        docs.update({d["external_id"]: (d["status"], d["text"]) for d in new_docs})

    rows = []
    for n in notices:
        start, end = receipt_period(docs.get(n.seq, (None, None))[1] or "")
        if end is None:
            start, end = receipt_period(n.body_text or "")
        if end is None:
            continue
        rows.append({
            "source": "sh", "external_id": n.seq, "model_no": None, "unit_type": None,
            "house_type": f"SH {n.board}", "complex_name": n.title[:255], "region_code": "100", "region_name": "서울",
            "supply_type": f"SH {n.board}", "notice_url": n.url, "recruit_date": n.posted_date,
            "receipt_start": start, "receipt_end": end, "unit_count": 0,
        })
    saved = upsert(Listing, rows, LISTING_KEY, "uq_listing_source_external_model")
    print(f"[SH 모집] 최근 {days}일 모집 공고 {len(notices)}건 중 접수기간을 찾은 {saved}건을 listings에 저장", flush=True)


def save_applyhome_stats() -> None:
    """청약통장 통계 + 청약 신청·당첨자 통계 (월별) → bankbook_stats, subscription_stats.

    처음에는 전체 기간을 받고, 그 뒤에는 저장된 마지막 달부터 다시 받는다 (마지막 달 수치가 바뀔 수 있어서 그 달도 다시).
    기능 하나는 한 트랜잭션으로 넣어서, 중간에 실패하면 그 기능은 이전 상태 그대로 남는다.
    활용신청이 안 된 서비스(401)는 건너뛴다.
    """
    groups = ((BankbookStat, BANKBOOK_ENDPOINTS, BANKBOOK_MONTH, map_bankbook_row),
              (SubscriptionStat, SUBSCRIPTION_ENDPOINTS, SUBSCRIPTION_MONTH, map_subscription_row))
    with httpx.Client(timeout=120.0) as client:
        for model, endpoints, month_field, mapper in groups:
            for kind, path in endpoints.items():
                with SessionLocal() as db:
                    since = db.scalar(select(func.max(model.year_month)).where(model.kind == kind))
                try:
                    saved = 0
                    with engine.begin() as conn:
                        if since:
                            conn.execute(delete(model).where(model.kind == kind, model.year_month >= since))
                        for page in fetch_pages(path, month_field, since, client):
                            conn.execute(insert(model), [mapper(row, kind) for row in page])
                            saved += len(page)
                    print(f"[통계] {model.__tablename__} {kind}: {since or '전체 기간'}부터 {saved}행", flush=True)
                except NotApproved as exc:
                    print(f"[통계] {exc} 서비스는 활용신청(또는 승인 반영) 전이라 건너뜁니다.", flush=True)
                    break


_failed_steps: list[str] = []  # 이번 collect_all에서 실패한 단계 (collect_runs.failed_steps에 남김)


def _run(step, *args):
    """한 출처가 실패해도 나머지 수집은 계속한다."""
    try:
        return step(*args)
    except Exception as exc:  # noqa: BLE001
        print(f"[실패] {step.__name__}: {exc.__class__.__name__} {exc}", flush=True)
        _failed_steps.append(f"{step.__name__}: {exc.__class__.__name__}"[:200])
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
        for model in (BankbookStat, SubscriptionStat):
            for kind, count in db.execute(select(model.kind, func.count()).group_by(model.kind)):
                print(f"  {model.__tablename__}[{kind}] {count}행", flush=True)
        print(f"  sh_notices {db.scalar(select(func.count()).select_from(ShNotice))}건", flush=True)
        print(f"  lh_notice_details {db.scalar(select(func.count()).select_from(LhNoticeDetail))}건", flush=True)


def collect_all(trigger: str = "수동") -> None:
    """전체 수집 + 가공 레이어 갱신. 스케줄러가 매일 오전 6시에 실행한다 (놓치면 켜진 뒤 보충, scheduler.py).

    실행 기록은 collect_runs에 남긴다. trigger: 정기(오전 6시) / 놓친 수집 보충 / 수동
    """
    init_tables()
    _failed_steps.clear()
    with SessionLocal() as db:
        run = CollectRun(trigger=trigger, status="running")
        db.add(run)
        db.commit()
        run_id = run.id
    try:
        _collect_steps()
    finally:
        with engine.begin() as conn:
            conn.execute(update(CollectRun).where(CollectRun.id == run_id).values(
                status="done", finished_at=func.now(), failed_steps=list(_failed_steps) or None))
    print_stats()


def _collect_steps() -> None:
    notice_index = _run(save_applyhome_listings)
    _run(save_historical_results, notice_index)
    _run(save_lh_listings)
    _run(save_sh_notices)
    _run(save_sh_recruitments)
    _run(save_loan_products)
    _run(save_applyhome_stats)
    _run(refresh_views, engine)
    _run(save_notice_costs)  # 가공 레이어(recommendable_listings)가 갱신된 뒤에 실행
    _run(save_listing_deposits)  # notice_costs를 쓰므로 그 다음


if __name__ == "__main__":
    collect_all()
