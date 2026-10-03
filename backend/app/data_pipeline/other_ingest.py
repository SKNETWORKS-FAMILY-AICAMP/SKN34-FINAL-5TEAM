"""LH·SH·파인 적재. 청약홈 전체 수집 모듈과 분리해 import가 깨지지 않게 한다."""

from app.db.session import SessionLocal
from app.models.listing import Listing
from app.models.loan_product import LoanProduct
from app.data_pipeline.finlife_client import fetch_mortgage_products, fetch_rent_house_products
from app.data_pipeline.lh_client import fetch_lh_notices
from app.data_pipeline.sh_client import fetch_sh_listings


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


def sync_other_sources() -> None:
    save_lh_notices(limit=5)
    save_finlife_loans(limit=10)
    save_sh_listings(max_pages=2)
