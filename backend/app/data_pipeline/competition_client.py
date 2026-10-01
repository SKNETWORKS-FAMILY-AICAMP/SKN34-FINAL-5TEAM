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
    "model_no": None, "result_status": None, "detail": None,
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
        "model_no": row.get("MODEL_NO"),
        "exclusive_area_sqm": parse_exclusive_area(unit_type),
        "raw": row,  # API 응답 행 원본 그대로
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
    # 원본 문자열이 없거나 미달("(△209)")이면 신청 ÷ 공급으로 계산 (미달이면 1 미만). 공급이 0이면 계산 불가
    if rate is None and supply and apply_count is not None:
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

    API 응답에 있는 조합은 배정·신청이 0이어도 모두 남긴다 (원본 그대로 — 0건 필터는 가공 레이어에서).
    응답에 신청 건수 필드 자체가 없는 조합(기관추천은 지역별 신청 건수가 없음)만 만들지 않는다.
    배정 세대수는 지역 구분 없이 종류별 합계라서, competition_rate는 "그 지역 신청 / 전체 배정"이고
    미달 여부는 세 지역 신청 합계로 판단한다. 배정 세대수는 listings.special_supply_detail에도 있다.
    """
    out = []
    for category, (cnt_prefix, hshldco_field) in SPSPLY_CATEGORIES.items():
        supply = to_int(row.get(hshldco_field))
        fields = {label: f"{prefix}_{cnt_prefix}_CNT" for prefix, label in SPSPLY_REGIONS.items()}
        applies = {label: to_int(row.get(field)) for label, field in fields.items()}
        total_apply = sum(v for v in applies.values() if v is not None)
        for region_label, apply_count in applies.items():
            if fields[region_label] not in row:
                continue
            item = _base(row, "APT", "특별공급")
            item.update(
                result_status=row.get("SUBSCRPT_RESULT_NM"),
                category_label=f"{category} - {region_label}",
                supply_count=supply,
                apply_count=apply_count,
                competition_rate=round(apply_count / supply, 2) if supply and apply_count is not None else None,
                is_undersubscribed=bool(supply and total_apply < supply),
            )
            out.append(item)

    # 지역 구분이 없는 두 종류: 기관추천(신청 건수 대신 확정·예비 건수), 이전기관 종사자(신청 건수 있음)
    recommend_supply = to_int(row.get("INSTT_RECOMEND_HSHLDCO"))
    decided, reserve = to_int(row.get("INSTT_RECOMEND_DCSN_CNT")), to_int(row.get("INSTT_RECOMEND_PREPAR_CNT"))
    if any(k in row for k in ("INSTT_RECOMEND_HSHLDCO", "INSTT_RECOMEND_DCSN_CNT", "INSTT_RECOMEND_PREPAR_CNT")):
        item = _base(row, "APT", "특별공급")
        item.update(result_status=row.get("SUBSCRPT_RESULT_NM"), category_label="기관추천",
                    supply_count=recommend_supply, detail={"확정": decided, "예비": reserve})
        out.append(item)
    transfer_supply, transfer_apply = to_int(row.get("TRANSR_INSTT_ENFSN_HSHLDCO")), to_int(row.get("TRANSR_INSTT_ENFSN_CNT"))
    if "TRANSR_INSTT_ENFSN_HSHLDCO" in row or "TRANSR_INSTT_ENFSN_CNT" in row:
        item = _base(row, "APT", "특별공급")
        item.update(
            result_status=row.get("SUBSCRPT_RESULT_NM"), category_label="이전기관",
            supply_count=transfer_supply, apply_count=transfer_apply,
            competition_rate=round(transfer_apply / transfer_supply, 2) if transfer_supply and transfer_apply is not None else None,
            is_undersubscribed=bool(transfer_supply and transfer_apply is not None and transfer_apply < transfer_supply),
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

        # 점수가 모두 "-"인 행(발표 전·추첨제)도 원본 그대로 남긴다 — 통계(cutoff_stats)는 점수 있는 행만 쓴다
        raw = fetch_all_pages(f"{CMPET_SVC}/{SCORE_ENDPOINT}", client=client)
        scores = [map_score_row(r) for r in raw]
        rows.extend(scores)
        with_score = sum(1 for s in scores if s["cutoff_score"] is not None)
        print(f"[당첨가점 APT] {len(raw)}행 (점수 있는 행 {with_score})", flush=True)

        raw = fetch_all_pages(f"{CMPET_SVC}/{SPSPLY_ENDPOINT}", client=client)
        before = len(rows)
        for r in raw:
            rows.extend(map_spsply_row(r))
        print(f"[특별공급 APT] {len(raw)}행 → {len(rows) - before}행", flush=True)

    return _attach_notice_info(rows, notice_index)
