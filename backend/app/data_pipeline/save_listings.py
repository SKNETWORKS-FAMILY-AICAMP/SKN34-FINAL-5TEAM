# 받아 온 공고 가격을 Postgres 표에 넣는 파일. API 호출 코드와 저장 코드를 나눠 둔다.
import re
import time
from collections import defaultdict

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.historical_result import HistoricalResult
from app.models.listing import Listing
from app.models.loan_product import LoanProduct
from app.models.user import UserProfile  # noqa: F401 — create_all에 사용자 표를 포함
from app.data_pipeline.applyhome_client import (
    HOUSING_KINDS,
    fetch_bundle_by_pblanc,
    fetch_competition_listings,
    fetch_detail_notices,
    fetch_mdl_map,
    fetch_pblanc_nos_from_detail,
    fetch_service_pages,
    bundle_from_notice,
    winner_cutoff,
)
from app.data_pipeline.finlife_client import fetch_mortgage_products, fetch_rent_house_products
from app.data_pipeline.lh_client import fetch_lh_notices
from app.data_pipeline.sh_client import fetch_sh_listings


def _to_float(value) -> float | None:
    if value is None:
        return None
    found = re.search(r"\d+(?:\.\d+)?", str(value).replace(",", ""))
    return float(found.group()) if found else None


def _to_int(value) -> int | None:
    number = _to_float(value)
    return int(number) if number is not None else None


def _unit_area(unit: dict) -> float | None:
    area = _to_float(unit.get("SUPLY_AR") or unit.get("EXCLUSE_AR"))
    if area is not None:
        return area
    return _to_float(unit.get("HOUSE_TY"))


def _competition_rate(row: dict) -> float | None:
    text = str(row.get("CMPET_RATE") or "").replace(",", "")
    bare = re.sub(r"\([^)]*\)", "", text).strip()
    found = re.search(r"\d+(?:\.\d+)?", bare)
    if found:
        return float(found.group())
    req = _to_float(row.get("REQ_CNT"))
    supply = _to_float(row.get("SUPLY_HSHLDCO"))
    if req is None or not supply:
        return None
    return round(req / supply, 2)


def init_tables() -> None:
    Base.metadata.create_all(bind=engine)


def save_one_bundle(
    pblanc_no: str | None = None,
    kind: str = "apt",
    notice_row: dict | None = None,
    include_rates: bool = True,
    competition_rows: list[dict] | None = None,
    cutoff_score: int | None = None,
    skip_units: bool | None = None,
    units_override: list[dict] | None = None,
) -> None:
    if pblanc_no is None:
        listed = fetch_competition_listings(kind=kind)
        if not listed:
            print(kind, "경쟁률 공고가 없습니다.")
            return
        pblanc_no = str(listed[0]["PBLANC_NO"])
    if notice_row is not None and units_override is not None:
        bundle = bundle_from_notice(
            pblanc_no,
            kind,
            notice_row,
            units_override,
            competition_rows or [],
            cutoff_score,
        )
    else:
        skip_units = True if units_override is not None else (
            skip_units if skip_units is not None else _has_listing(pblanc_no, kind)
        )
        bundle = fetch_bundle_by_pblanc(
            pblanc_no,
            kind=kind,
            include_rates=include_rates,
            notice_row=notice_row,
            skip_units=skip_units,
        )
        if units_override is not None:
            bundle["units"] = units_override
        if competition_rows is not None:
            bundle["competition"] = competition_rows
        if cutoff_score is not None:
            bundle["cutoff_score"] = cutoff_score
    region_code = str(bundle.get("region_code") or "unknown")[:20]
    supply_type = str(bundle.get("supply_type") or kind)[:50]
    units = bundle["units"]
    if not units and not skip_units:
        units = [{"MODEL_NO": "0", "SUPLY_HSHLDCO": (notice_row or {}).get("TOT_SUPLY_HSHLDCO")}]
    area_by_type = {
        unit.get("HOUSE_TY"): _unit_area(unit)
        for unit in units
        if unit.get("HOUSE_TY")
    }

    db = SessionLocal()
    try:
        listing_count = 0
        for unit in units:
            model_no = unit.get("MODEL_NO") or "0"
            if kind == "apt":
                external_id = f"{pblanc_no}-{model_no}"[:50]
            else:
                external_id = f"{kind}-{pblanc_no}-{model_no}"[:50]
            area = _unit_area(unit)
            existing = db.query(Listing).filter_by(external_id=external_id).first()
            if existing:
                if existing.receipt_start is None and bundle.get("receipt_start"):
                    existing.receipt_start = bundle.get("receipt_start")
                    existing.receipt_end = bundle.get("receipt_end")
                if existing.announce_date is None and bundle.get("announce_date"):
                    existing.announce_date = bundle.get("announce_date")
                if existing.move_in_date is None and bundle.get("move_in_date"):
                    existing.move_in_date = bundle.get("move_in_date")
                if existing.unit_size_sqm is None and area is not None:
                    existing.unit_size_sqm = area
                continue
            amount = _to_int(unit.get("LTTOT_TOP_AMOUNT") or unit.get("SUPLY_AMOUNT"))
            db.add(
                Listing(
                    external_id=external_id,
                    complex_name=bundle["complex_name"] or kind,
                    address=bundle.get("address"),
                    notice_url=bundle.get("notice_url"),
                    region_code=region_code,
                    supply_type=supply_type,
                    unit_size_sqm=area,
                    unit_count=(_to_int(unit.get("SUPLY_HSHLDCO")) or 0)
                    + (_to_int(unit.get("SPSPLY_HSHLDCO")) or 0),
                    sale_price=amount * 10000 if amount is not None else None,
                    receipt_start=bundle.get("receipt_start"),
                    receipt_end=bundle.get("receipt_end"),
                    announce_date=bundle.get("announce_date"),
                    move_in_date=bundle.get("move_in_date"),
                )
            )
            listing_count += 1

        result_count = 0
        cutoff = bundle.get("cutoff_score")
        seen_slots: set[tuple[str, str, str]] = set()
        for row in bundle["competition"]:
            house_ty = str(row.get("HOUSE_TY") or "")[:30]
            reside_secd = str(row.get("RESIDE_SECD") or "")[:10]
            subscrpt_rank = str(row.get("SUBSCRPT_RANK_CODE") or row.get("SPSPLY_KND_CODE") or "")[:10]
            slot = (house_ty, reside_secd, subscrpt_rank)
            if slot in seen_slots:
                continue
            existing_hist = db.query(HistoricalResult).filter_by(
                complex_id=pblanc_no,
                house_ty=house_ty,
                reside_secd=reside_secd,
                subscrpt_rank=subscrpt_rank,
            ).first()
            if existing_hist:
                if existing_hist.cutoff_score is None and cutoff is not None:
                    existing_hist.cutoff_score = cutoff
                continue
            seen_slots.add(slot)
            area = area_by_type.get(house_ty)
            if area is None:
                area = _to_float(row.get("SUPLY_AR")) or _to_float(house_ty)
            db.add(
                HistoricalResult(
                    complex_id=pblanc_no,
                    unit_size_sqm=area,
                    region_code=region_code,
                    year=bundle["year"],
                    competition_rate=_competition_rate(row),
                    cutoff_score=cutoff,
                    house_ty=house_ty,
                    reside_secd=reside_secd,
                    subscrpt_rank=subscrpt_rank,
                )
            )
            result_count += 1
        if result_count == 0:
            marker = (
                db.query(HistoricalResult)
                .filter_by(complex_id=pblanc_no, subscrpt_rank="_skip")
                .first()
            )
            if marker is None and db.query(HistoricalResult).filter_by(complex_id=pblanc_no).first() is None:
                db.add(
                    HistoricalResult(
                        complex_id=pblanc_no,
                        unit_size_sqm=None,
                        region_code=region_code,
                        year=bundle["year"],
                        competition_rate=None,
                        cutoff_score=None,
                        house_ty="",
                        reside_secd="",
                        subscrpt_rank="_skip",
                    )
                )
        db.commit()
        print(kind, bundle["complex_name"], "listings", listing_count, "competition", result_count, flush=True)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _listing_prefix(pblanc_no: str, kind: str) -> str:
    return f"{pblanc_no}-" if kind == "apt" else f"{kind}-{pblanc_no}-"


def _has_listing(pblanc_no: str, kind: str) -> bool:
    prefix = _listing_prefix(pblanc_no, kind)
    db = SessionLocal()
    try:
        return (
            db.query(Listing).filter(Listing.external_id.like(f"{prefix}%")).first()
            is not None
        )
    finally:
        db.close()


def _notice_state(pblanc_no: str, kind: str) -> tuple[bool, bool]:
    prefix = _listing_prefix(pblanc_no, kind)
    db = SessionLocal()
    try:
        has_listing = (
            db.query(Listing).filter(Listing.external_id.like(f"{prefix}%")).first()
            is not None
        )
        has_hist = (
            db.query(HistoricalResult).filter_by(complex_id=pblanc_no).first() is not None
        )
        return has_listing, has_hist
    finally:
        db.close()


def _notice_already_saved(pblanc_no: str, kind: str) -> bool:
    has_listing, has_hist = _notice_state(pblanc_no, kind)
    return has_listing and has_hist


def save_kind_all_pages(kind: str) -> None:
    spec = HOUSING_KINDS[kind]
    try:
        notices = fetch_detail_notices(kind, limit=None)
    except Exception as exc:  # noqa: BLE001
        print(kind, "분양정보 전체 목록 실패", exc.__class__.__name__, flush=True)
        return
    print(kind, "전체 공고", len(notices), "개", flush=True)
    cmpet_map: dict[str, list[dict]] = defaultdict(list)
    win_map: dict[str, list[dict]] = defaultdict(list)
    try:
        for row in fetch_service_pages(spec["cmpet"]):
            no = str(row.get("PBLANC_NO") or "")
            if no:
                cmpet_map[no].append(row)
        print(kind, "경쟁률 행", sum(len(v) for v in cmpet_map.values()), "개", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(kind, "경쟁률 전체 목록 실패", exc.__class__.__name__, flush=True)
    try:
        for row in fetch_service_pages(spec["winner"], require_pblanc=True):
            no = str(row.get("PBLANC_NO") or "")
            if no:
                win_map[no].append(row)
        print(kind, "당첨 행", sum(len(v) for v in win_map.values()), "개", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(kind, "당첨 전체 목록 실패", exc.__class__.__name__, flush=True)

    pending: list[tuple[int, dict, bool, str]] = []
    for index, row in enumerate(notices, start=1):
        no = str(row.get("PBLANC_NO") or "")
        has_listing, has_hist = _notice_state(no, kind)
        if has_listing and has_hist:
            continue
        pending.append((index, row, has_listing, no))
    print(kind, "저장할 공고", len(pending), "개", flush=True)
    need_mdl = [no for _, _, has_listing, no in pending if not has_listing]
    mdl_map = fetch_mdl_map(kind, need_mdl)
    for index, row, has_listing, no in pending:
        print("저장 중", kind, index, "/", len(notices), no, flush=True)
        try:
            save_one_bundle(
                no,
                kind=kind,
                notice_row=row,
                include_rates=False,
                competition_rows=cmpet_map.get(no, []),
                cutoff_score=winner_cutoff(win_map.get(no, [])),
                skip_units=has_listing,
                units_override=[] if has_listing else mdl_map.get(no, []),
            )
        except Exception as exc:  # noqa: BLE001
            print(kind, no, "실패", exc.__class__.__name__, flush=True)


def save_cheongyak_all_pages() -> None:
    init_tables()
    print("청약홈 전체 페이지 수집", list(HOUSING_KINDS), flush=True)
    for kind in HOUSING_KINDS:
        save_kind_all_pages(kind)
    print_ingest_stats()


def print_ingest_stats() -> None:
    db = SessionLocal()
    try:
        listings = db.query(Listing).count()
        historical = (
            db.query(HistoricalResult)
            .filter(HistoricalResult.subscrpt_rank != "_skip")
            .count()
        )
        with_cutoff = db.query(HistoricalResult).filter(HistoricalResult.cutoff_score.isnot(None)).count()
        print(
            "확인 listings",
            listings,
            "historical",
            historical,
            "cutoff_있음",
            with_cutoff,
            flush=True,
        )
    finally:
        db.close()


def save_many_bundles(limit: int = 8, kind: str = "apt") -> None:
    seen: list[str] = []
    try:
        seen = fetch_pblanc_nos_from_detail(kind, limit=limit)
    except Exception as exc:  # noqa: BLE001
        print(kind, "분양정보 목록 실패", exc.__class__.__name__, flush=True)
        return
    print(kind, "저장할 공고", len(seen), "개", flush=True)
    for no in seen:
        try:
            save_one_bundle(no, kind=kind)
        except Exception as exc:  # noqa: BLE001
            print(kind, no, "실패", exc.__class__.__name__, flush=True)


def save_lh_notices(limit: int = 5) -> None:
    db = SessionLocal()
    added = 0
    seen_ids: set[str] = set()
    try:
        for row in fetch_lh_notices(limit=limit):
            external_id = row["external_id"]
            if external_id in seen_ids:
                continue
            seen_ids.add(external_id)
            if db.query(Listing).filter_by(external_id=external_id).first():
                continue
            db.add(
                Listing(
                    external_id=external_id,
                    complex_name=row["complex_name"],
                    address=row.get("address"),
                    notice_url=row.get("notice_url"),
                    region_code=row["region_code"],
                    supply_type=row["supply_type"],
                    unit_size_sqm=row.get("unit_size_sqm"),
                    unit_count=row.get("unit_count") or 0,
                    sale_price=row.get("sale_price"),
                )
            )
            added += 1
        db.commit()
        print("LH listings", added, flush=True)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def save_sh_listings(max_pages: int = 3) -> None:
    db = SessionLocal()
    added = 0
    seen_ids: set[str] = set()
    try:
        for row in fetch_sh_listings(max_pages=max_pages):
            external_id = row["external_id"]
            if external_id in seen_ids:
                continue
            seen_ids.add(external_id)
            if db.query(Listing).filter_by(external_id=external_id).first():
                continue
            db.add(
                Listing(
                    external_id=external_id,
                    complex_name=row["complex_name"],
                    address=row.get("address"),
                    notice_url=row.get("notice_url"),
                    region_code=row["region_code"],
                    supply_type=row["supply_type"],
                    unit_size_sqm=row.get("unit_size_sqm"),
                    unit_count=row.get("unit_count") or 0,
                    sale_price=row.get("sale_price"),
                    announce_date=row.get("announce_date"),
                )
            )
            added += 1
        db.commit()
        print("SH listings", added, flush=True)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def save_finlife_loans(limit: int = 10) -> None:
    db = SessionLocal()
    added = 0
    seen_names: set[str] = set()
    try:
        for row in fetch_mortgage_products(limit=limit) + fetch_rent_house_products(limit=limit):
            name = row["name"]
            if name in seen_names:
                continue
            seen_names.add(name)
            exists = db.query(LoanProduct).filter_by(name=name).first()
            if exists:
                continue
            db.add(LoanProduct(**row))
            added += 1
        db.commit()
        print("대출 상품", added, flush=True)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def save_all_sources(per_kind: int = 3, include_other: bool = False) -> None:
    init_tables()
    print("증분 수집 시작", list(HOUSING_KINDS), "per_kind", per_kind, flush=True)
    for kind in HOUSING_KINDS:
        save_many_bundles(limit=per_kind, kind=kind)
    if include_other:
        save_lh_notices(limit=5)
        save_finlife_loans(limit=10)
        save_sh_listings(max_pages=2)


if __name__ == "__main__":
    save_cheongyak_all_pages()
