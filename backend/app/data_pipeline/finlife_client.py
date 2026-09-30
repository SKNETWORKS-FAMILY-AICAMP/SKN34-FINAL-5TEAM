"""금감원 금융상품 통합비교공시(파인). FINE_API_KEY가 있을 때만 호출한다."""

from __future__ import annotations

import httpx

from app.core.config import settings

FINLIFE_MORTGAGE_URL = "https://finlife.fss.or.kr/finlifeapi/mortgageLoanProductsSearch.json"
FINLIFE_RENT_URL = "https://finlife.fss.or.kr/finlifeapi/rentHouseLoanProductsSearch.json"


def fetch_mortgage_products(limit: int = 10) -> list[dict]:
    return _fetch_finlife(FINLIFE_MORTGAGE_URL, limit=limit, category="bank")


def fetch_rent_house_products(limit: int = 10) -> list[dict]:
    """전세자금대출. 주택담보와 같은 인증키를 쓴다."""
    return _fetch_finlife(FINLIFE_RENT_URL, limit=limit, category="bank")


def _fetch_finlife(url: str, limit: int, category: str) -> list[dict]:
    if not settings.fine_api_key:
        print("파인(대출): FINE_API_KEY가 비어 있어 건너뜁니다.")
        return []

    params = {
        "auth": settings.fine_api_key,
        "topFinGrpNo": "020000",
        "pageNo": 1,
    }
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            body = response.json()
    except Exception as exc:  # noqa: BLE001
        print(f"파인(대출): 호출 실패({exc.__class__.__name__}).")
        return []

    result = body.get("result") if isinstance(body, dict) else None
    bases = (result or {}).get("baseList") or []
    options = (result or {}).get("optionList") or []
    option_by_id: dict[str, dict] = {}
    for option in options:
        key = str(option.get("fin_prdt_cd") or "")
        if key and key not in option_by_id:
            option_by_id[key] = option

    kind = "rent" if "rentHouse" in url else "mortgage"
    products = []
    for row in bases[:limit]:
        code = str(row.get("fin_prdt_cd") or "")
        option = option_by_id.get(code, {})
        name = f"{row.get('kor_co_nm') or ''} {row.get('fin_prdt_nm') or ''}".strip()
        if not name:
            continue
        products.append(
            {
                "name": name[:255],
                "category": category,
                "limit_amount": None,
                "interest_rate_min": _to_float(option.get("lend_rate_min") or option.get("crdt_grad_avg")),
                "interest_rate_max": _to_float(option.get("lend_rate_max")),
                "eligibility": {
                    "fin_prdt_cd": code,
                    "join_way": row.get("join_way"),
                    "loan_kind": kind,
                },
            }
        )
    return products


def _to_float(value) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
