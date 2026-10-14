"""금감원 금융상품통합비교공시(파인)의 정기예금·적금 상품. FINE_API_KEY가 있을 때만 호출한다.

은행(020000)·저축은행(030300)의 예금·적금을 모든 페이지까지 받는다. (카드는 파인에 API가 없어서 받지 않는다)
응답은 상품 목록(baseList)과 금리 옵션(optionList)이 금융회사 코드 + 상품 코드로 연결된 구조다.
"""

from __future__ import annotations

import logging

import httpx
from sqlalchemy import delete, select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.savings import SavingsProduct, SavingsRateOption

logger = logging.getLogger(__name__)

BASE_URL = "https://finlife.fss.or.kr/finlifeapi"
ENDPOINTS = {"예금": "depositProductsSearch", "적금": "savingProductsSearch"}
FIN_GROUPS = {"020000": "은행", "030300": "저축은행"}


def _num(value):
    try:
        return None if value in (None, "") else float(value)
    except (TypeError, ValueError):
        return None


def map_option(option: dict) -> dict:
    return {
        "save_months": int(option["save_trm"]) if str(option.get("save_trm") or "").isdigit() else None,
        "rate_type": option.get("intr_rate_type_nm"),
        "reserve_type": option.get("rsrv_type_nm"),
        "rate": _num(option.get("intr_rate")),
        "rate_best": _num(option.get("intr_rate2")),
    }


def map_product(base: dict, kind: str, fin_group: str, options: list[dict]) -> dict:
    rates = [o["rate"] for o in options if o["rate"] is not None]
    bests = [o["rate_best"] for o in options if o["rate_best"] is not None]
    return {
        "kind": kind,
        "fin_group": fin_group,
        "fin_co_no": base.get("fin_co_no"),
        "fin_prdt_cd": base.get("fin_prdt_cd"),
        "company_name": base.get("kor_co_nm"),
        "name": (base.get("fin_prdt_nm") or "")[:255],
        "join_way": (base.get("join_way") or "")[:255] or None,
        "maturity_interest": base.get("mtrt_int"),
        "special_condition": base.get("spcl_cnd"),
        "join_deny": base.get("join_deny"),
        "join_member": (base.get("join_member") or "")[:255] or None,
        "etc_note": base.get("etc_note"),
        "max_limit": base.get("max_limit"),
        "disclosure_month": base.get("dcls_month"),
        "rate_min": min(rates) if rates else None,
        "rate_max": max(bests or rates) if (bests or rates) else None,
        "options": options,
    }


def fetch_savings_products() -> list[dict]:
    if not settings.fine_api_key:
        logger.warning("[파인] FINE_API_KEY가 비어 있어 예적금 수집을 건너뜁니다.")
        return []
    products: list[dict] = []
    # IPv4로만 연결 (IPv6가 막힌 PC에서 40초씩 기다리는 것을 피한다)
    with httpx.Client(timeout=30.0, transport=httpx.HTTPTransport(local_address="0.0.0.0")) as client:
        for kind, endpoint in ENDPOINTS.items():
            for group_code, group_name in FIN_GROUPS.items():
                page, max_page = 1, 1
                while page <= max_page:
                    response = client.get(f"{BASE_URL}/{endpoint}.json",
                                          params={"auth": settings.fine_api_key, "topFinGrpNo": group_code, "pageNo": page})
                    result = (response.json() if response.status_code == 200 else {}).get("result") or {}
                    if result.get("err_cd") not in (None, "000"):
                        logger.warning(f"[파인] {kind} {group_name} 오류 {result.get('err_cd')} {result.get('err_msg')}")
                        break
                    options_by_product: dict[str, list[dict]] = {}
                    for option in result.get("optionList") or []:
                        key = f"{option.get('fin_co_no')}|{option.get('fin_prdt_cd')}"
                        options_by_product.setdefault(key, []).append(map_option(option))
                    for base in result.get("baseList") or []:
                        options = options_by_product.get(f"{base.get('fin_co_no')}|{base.get('fin_prdt_cd')}", [])
                        products.append(map_product(base, kind, group_name, options))
                    max_page = int(result.get("max_page_no") or 1)
                    page += 1
    logger.info(f"[파인] 예적금 상품 {len(products)}개")
    return products


def save_savings_products() -> None:
    products = {(p["kind"], p["fin_co_no"], p["fin_prdt_cd"]): p for p in fetch_savings_products()}
    if not products:
        return
    with SessionLocal() as db:
        for (kind, fin_co_no, fin_prdt_cd), data in products.items():
            options = data.pop("options")
            product = db.scalar(select(SavingsProduct).filter_by(kind=kind, fin_co_no=fin_co_no, fin_prdt_cd=fin_prdt_cd))
            if product is None:
                product = SavingsProduct(**data)
                db.add(product)
                db.flush()
            else:
                for field, value in data.items():
                    setattr(product, field, value)
                db.execute(delete(SavingsRateOption).where(SavingsRateOption.product_id == product.id))
            db.add_all(SavingsRateOption(product_id=product.id, **option) for option in options)
        db.commit()
    logger.info(f"[저장] 예적금 상품 {len(products)}개")


if __name__ == "__main__":
    from app.core.logging_setup import setup_logging

    setup_logging(settings.log_level)
    save_savings_products()
