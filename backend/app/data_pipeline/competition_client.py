"""청약홈 경쟁률 API(ApplyhomeInfoCmpetRtSvc) 연동 — 과거 경쟁률·당첨가점·특별공급 신청현황(historical_results) 수집.

경쟁률(5개 유형), 당첨가점(APT), 특별공급 신청현황(APT) 모두 조건 없이 1,000행씩 페이지로 받을 수 있어서
전체 기간을 한꺼번에 받는다. 지역코드·연도는 API에 없어서 공고 상세(applyhome_client)와 공고번호로 연결해 채운다.
참고: 팀원 코드가 쓰던 당첨자 API(ApplyhomeInfoPblancWinnerSvc)는 "등록되지 않은 서비스"(404)라서 쓰지 않는다.
DB 저장은 save_listings.py에서 한다.
"""

import httpx

from app.data_pipeline.applyhome_client import fetch_all_pages, parse_date, parse_exclusive_area, to_float, to_int

CMPET_SVC = "ApplyhomeInfoCmpetRtSvc/v1"
CMPET_ENDPOINTS = {
    "APT": "getAPTLttotPblancCmpet",
    "오피스텔·도시형생활주택": "getUrbtyOfctlLttotPblancCmpet",
    "무순위·잔여세대": "getRemndrLttotPblancCmpet",
    "공공지원민간임대": "getPblPvtRentLttotPblancCmpet",
    "임의공급": "getOPTLttotPblancCmpet",
}
SCORE_ENDPOINT = "getAptLttotPblancScore"
SPSPLY_ENDPOINT = "getAPTSpsplyReqstStus"

# 특별공급 신청현황: *_HSHLDCO = 종류별 배정 세대수, <지역>_<종류>_CNT = 지역 x 종류별 신청 건수
SPSPLY_CATEGORIES = {
    "기관추천": ("INSTT_RECOMEND", "INSTT_RECOMEND_HSHLDCO"),
    "다자녀": ("MNYCH", "MNYCH_HSHLDCO"),
    "노부모부양": ("OPS", "OLD_PARNTS_SUPORT_HSHLDCO"),
    "신혼부부": ("NWWDS_NMTW", "NWWDS_NMTW_HSHLDCO"),
    "생애최초": ("LFE_FRST", "LFE_FRST_HSHLDCO"),
    "신생아": ("NWBB_NWBBSHR", "NWBB_NWBBSHR_HSHLDCO"),
    "청년": ("YGMN", "YGMN_HSHLDCO"),
}
SPSPLY_REGIONS = {"CRSPAREA": "해당지역", "CTPRVN": "기타경기", "ETC_AREA": "기타지역"}

EMPTY_ROW = {
    "category_label": None, "reside_secd": None, "subscrpt_rank": None,
    "supply_count": None, "apply_count": None, "competition_rate": None,
    "is_undersubscribed": False, "raw_cmpet_rate": None,
    "avg_score": None, "cutoff_score": None, "top_score": None,
}


def parse_competition_rate(raw) -> tuple[float | None, bool]:
    """CMPET_RATE 문자열 → (경쟁률, 미달 여부). "(△209)"는 209세대 미달, "-"는 값 없음."""
    text = str(raw if raw is not None else "").replace(",", "").strip()
    if text in ("", "-"):
        return None, False
    if "△" in text or text.startswith("("):
        return None, True
    try:
        return float(text), False
    except ValueError:
        return None, False


def _base(row: dict, house_type: str, result_type: str) -> dict:
    unit_type = (row.get("HOUSE_TY") or "").strip() or None
    return {
        **EMPTY_ROW,
        "external_id": str(row.get("PBLANC_NO")),
        "unit_type": unit_type,
        "house_type": house_type,
        "result_type": result_type,
        "exclusive_area_sqm": parse_exclusive_area(unit_type),
    }


def map_cmpet_row(row: dict, house_type: str) -> dict:
    rate, undersub = parse_competition_rate(row.get("CMPET_RATE"))
    out = _base(row, house_type, "경쟁률")
    supply = to_int(row.get("SUPLY_HSHLDCO"))

    if house_type == "APT":
        rank = row.get("SUBSCRPT_RANK_CODE")
        reside = (row.get("RESIDE_SENM") or "").strip()
        out.update(category_label=(f"{reside} {rank}순위".strip() if rank else reside) or None,
                   reside_secd=row.get("RESIDE_SECD"), subscrpt_rank=rank)
    elif house_type == "오피스텔·도시형생활주택":
        out.update(category_label=(row.get("RESIDNT_PRIOR_SENM") or "").strip() or None,
                   reside_secd=row.get("RESIDNT_PRIOR_AT"))
    elif house_type == "무순위·잔여세대":
        code = row.get("REMNDR_HSHLD_PBLANC_TYCD")
        out.update(category_label={"01": "사후", "02": "사전"}.get(code), subscrpt_rank=code)
    elif house_type == "공공지원민간임대":
        out.update(category_label=(row.get("SPSPLY_KND_NM") or "").strip() or None,
                   subscrpt_rank=row.get("SPSPLY_KND_CODE"))
        supply = to_int(row.get("SPSPLY_KND_HSHLDCO")) or supply

    apply_count = to_int(row.get("REQ_CNT"))
    if rate is None and not undersub and supply and apply_count is not None:
        rate = round(apply_count / supply, 2)
    out.update(supply_count=supply, apply_count=apply_count, competition_rate=rate,
               is_undersubscribed=undersub, raw_cmpet_rate=row.get("CMPET_RATE"))
    return out


def map_score_row(row: dict) -> dict:
    out = _base(row, "APT", "당첨가점")
    out.update(category_label=(row.get("RESIDE_SENM") or "").strip() or None,
               reside_secd=row.get("RESIDE_SECD"),
               avg_score=to_float(row.get("AVRG_SCORE")),
               cutoff_score=to_float(row.get("LWET_SCORE")),
               top_score=to_float(row.get("TOP_SCORE")))
    return out


def map_spsply_row(row: dict) -> list[dict]:
    """평형당 1행(종류 x 지역이 컬럼) → 종류 x 지역 조합당 1행.

    신청 건수 필드가 없는 조합(기관추천은 지역별 신청 건수가 없음)과 배정·신청이 모두 0인 조합은 뺀다.
    배정 세대수는 listings.special_supply_detail에도 있다.
    """
    out = []
    for category, (cnt_prefix, hshldco_field) in SPSPLY_CATEGORIES.items():
        supply = to_int(row.get(hshldco_field))
        for region_prefix, region_label in SPSPLY_REGIONS.items():
            apply_count = to_int(row.get(f"{region_prefix}_{cnt_prefix}_CNT"))
            if apply_count is None or (not supply and not apply_count):
                continue
            item = _base(row, "APT", "특별공급")
            item.update(
                category_label=f"{category} - {region_label}",
                supply_count=supply,
                apply_count=apply_count,
                competition_rate=round(apply_count / supply, 2) if supply and apply_count is not None else None,
                is_undersubscribed=bool(supply and apply_count is not None and apply_count < supply),
            )
            out.append(item)
    return out


def _attach_notice_info(rows: list[dict], notice_index: dict[str, dict]) -> list[dict]:
    for row in rows:
        notice = notice_index.get(row["external_id"]) or {}
        when = parse_date(notice.get("PRZWNER_PRESNATN_DE")) or parse_date(notice.get("RCRIT_PBLANC_DE"))
        row["region_code"] = notice.get("SUBSCRPT_AREA_CODE")
        row["year"] = when.year if when else None
    return rows


def fetch_historical_results(notice_index: dict[str, dict]) -> list[dict]:
    """경쟁률 + 당첨가점 + 특별공급 신청현황 전체. notice_index = 공고번호 → 공고 상세 원본."""
    rows: list[dict] = []
    with httpx.Client(timeout=60.0) as client:
        for house_type, endpoint in CMPET_ENDPOINTS.items():
            raw = fetch_all_pages(f"{CMPET_SVC}/{endpoint}", client=client)
            rows.extend(map_cmpet_row(r, house_type) for r in raw)
            print(f"[경쟁률 {house_type}] {len(raw)}행", flush=True)

        raw = fetch_all_pages(f"{CMPET_SVC}/{SCORE_ENDPOINT}", client=client)
        scores = [map_score_row(r) for r in raw]
        scores = [s for s in scores if any(s[k] is not None for k in ("avg_score", "cutoff_score", "top_score"))]
        rows.extend(scores)
        print(f"[당첨가점 APT] {len(raw)}행 중 점수 있는 {len(scores)}행", flush=True)

        raw = fetch_all_pages(f"{CMPET_SVC}/{SPSPLY_ENDPOINT}", client=client)
        before = len(rows)
        for r in raw:
            rows.extend(map_spsply_row(r))
        print(f"[특별공급 APT] {len(raw)}행 → {len(rows) - before}행", flush=True)

    return _attach_notice_info(rows, notice_index)
