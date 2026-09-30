"""금감원 금융상품통합비교공시(파인) 대출 상품. FINE_API_KEY가 있을 때만 호출한다.

주택담보대출·전세자금대출·개인신용대출 x 금융권역 5개(은행·여신전문·저축은행·보험·금융투자)를 모든 페이지까지 받는다.
응답은 상품 목록(baseList)과 금리 옵션(optionList)이 금융회사 코드 + 상품 코드로 연결된 구조다.
DB 저장은 save_listings.py에서 한다.
"""

from __future__ import annotations

import httpx

from app.core.config import settings

FINLIFE_BASE_URL = "https://finlife.fss.or.kr/finlifeapi"
PRODUCT_TYPES = {
    "주택담보대출": "mortgageLoanProductsSearch",
    "전세자금대출": "rentHouseLoanProductsSearch",
    "개인신용대출": "creditLoanProductsSearch",
}
FIN_GROUPS = {"020000": "은행", "030200": "여신전문", "030300": "저축은행", "050000": "보험", "060000": "금융투자"}
CREDIT_GRADES = {
    "crdt_grad_1": "900점 초과", "crdt_grad_4": "801~900점", "crdt_grad_5": "701~800점", "crdt_grad_6": "601~700점",
    "crdt_grad_10": "501~600점", "crdt_grad_11": "401~500점", "crdt_grad_12": "301~400점", "crdt_grad_13": "300점 이하",
}


def _to_float(value) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def map_option(option: dict) -> dict:
    grades = {label: _to_float(option.get(key)) for key, label in CREDIT_GRADES.items() if option.get(key) is not None}
    grade_values = [v for v in grades.values() if v is not None]
    if grades:
        rate_min = min(grade_values) if grade_values else None
        rate_max = max(grade_values) if grade_values else None
    else:
        rate_min = _to_float(option.get("lend_rate_min"))
        rate_max = _to_float(option.get("lend_rate_max"))
    return {
        "collateral_type": option.get("mrtg_type_nm"),
        "repay_type": option.get("rpay_type_nm"),
        "rate_type": option.get("lend_rate_type_nm") or option.get("crdt_lend_rate_type_nm"),
        "rate_min": rate_min,
        "rate_max": rate_max,
        "rate_avg": _to_float(option.get("lend_rate_avg") or option.get("crdt_grad_avg")),
        "credit_grade_rates": grades or None,
    }


def map_product(base: dict, product_type: str, fin_group: str, options: list[dict]) -> dict:
    # 신용대출은 기준금리·가산금리 행도 오므로 상품 대표 금리는 "대출금리" 행에서만 뽑는다
    loan_rates = [o for o in options if not o["credit_grade_rates"] or "대출금리" in (o["rate_type"] or "")]
    mins = [o["rate_min"] for o in loan_rates if o["rate_min"] is not None]
    maxs = [o["rate_max"] for o in loan_rates if o["rate_max"] is not None]
    return {
        "name": f"{base.get('kor_co_nm') or ''} {base.get('fin_prdt_nm') or ''}".strip()[:255],
        "category": "bank",
        "source": "finlife",
        "product_type": product_type,
        "fin_group": fin_group,
        "company_name": base.get("kor_co_nm"),
        "fin_co_no": base.get("fin_co_no"),
        "fin_prdt_cd": base.get("fin_prdt_cd"),
        "join_way": (base.get("join_way") or "")[:255] or None,
        "loan_limit_text": base.get("loan_lmt"),
        "extra_cost_text": base.get("loan_inci_expn"),
        "prepayment_fee_text": base.get("erly_rpay_fee"),
        "delay_rate_text": base.get("dly_rate"),
        "disclosure_month": base.get("dcls_month"),
        "interest_rate_min": min(mins) if mins else None,
        "interest_rate_max": max(maxs) if maxs else None,
        "options": options,
    }


def fetch_loan_products() -> list[dict]:
    """전체 대출 상품. 각 상품 dict의 "options"에 금리 옵션 목록이 들어 있다."""
    if not settings.fine_api_key:
        print("[파인] FINE_API_KEY가 비어 있어 건너뜁니다.", flush=True)
        return []
    products: list[dict] = []
    with httpx.Client(timeout=30.0) as client:
        for product_type, endpoint in PRODUCT_TYPES.items():
            for group_code, group_name in FIN_GROUPS.items():
                page, max_page = 1, 1
                while page <= max_page:
                    response = client.get(
                        f"{FINLIFE_BASE_URL}/{endpoint}.json",
                        params={"auth": settings.fine_api_key, "topFinGrpNo": group_code, "pageNo": page},
                    )
                    result = (response.json() if response.status_code == 200 else {}).get("result") or {}
                    if result.get("err_cd") not in (None, "000"):
                        print(f"[파인] {product_type} {group_name} 오류 {result.get('err_cd')} {result.get('err_msg')}", flush=True)
                        break
                    options_by_product: dict[str, list[dict]] = {}
                    for option in result.get("optionList") or []:
                        key = f"{option.get('fin_co_no')}|{option.get('fin_prdt_cd')}"
                        options_by_product.setdefault(key, []).append(map_option(option))
                    for base in result.get("baseList") or []:
                        options = options_by_product.get(f"{base.get('fin_co_no')}|{base.get('fin_prdt_cd')}", [])
                        products.append(map_product(base, product_type, group_name, options))
                    max_page = int(result.get("max_page_no") or 1)
                    page += 1
    print(f"[파인] 대출 상품 {len(products)}개", flush=True)
    return products
