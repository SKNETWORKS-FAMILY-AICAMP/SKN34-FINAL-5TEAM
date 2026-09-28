import asyncio
import time
from datetime import date

import httpx

from app.core.config import settings

APPLYHOME_BASE_URL = "https://api.odcloud.kr/api"

# 청약홈 분양정보 종류. 상세 + 주택형 + (있으면) 경쟁률.
HOUSING_KINDS: dict[str, dict[str, str]] = {
    "apt": {
        "label": "APT",
        "detail": "ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail",
        "mdl": "ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancMdl",
        "cmpet": "ApplyhomeInfoCmpetRtSvc/v1/getAPTLttotPblancCmpet",
        "winner": "ApplyhomeInfoPblancWinnerSvc/v1/getAPTLttotPblancWinner",
    },
    "officetel": {
        "label": "오피스텔/도시형/민간임대",
        "detail": "ApplyhomeInfoDetailSvc/v1/getUrbtyOfctlLttotPblancDetail",
        "mdl": "ApplyhomeInfoDetailSvc/v1/getUrbtyOfctlLttotPblancMdl",
        "cmpet": "ApplyhomeInfoCmpetRtSvc/v1/getUrbtyOfctlLttotPblancCmpet",
        "winner": "ApplyhomeInfoPblancWinnerSvc/v1/getUrbtyOfctlLttotPblancWinner",
    },
    "remain": {
        "label": "잔여세대",
        "detail": "ApplyhomeInfoDetailSvc/v1/getRemndrLttotPblancDetail",
        "mdl": "ApplyhomeInfoDetailSvc/v1/getRemndrLttotPblancMdl",
        "cmpet": "ApplyhomeInfoCmpetRtSvc/v1/getRemndrLttotPblancCmpet",
        "winner": "ApplyhomeInfoPblancWinnerSvc/v1/getRemndrLttotPblancWinner",
    },
    "pbl_rent": {
        "label": "공공지원민간임대",
        "detail": "ApplyhomeInfoDetailSvc/v1/getPblPvtRentLttotPblancDetail",
        "mdl": "ApplyhomeInfoDetailSvc/v1/getPblPvtRentLttotPblancMdl",
        "cmpet": "ApplyhomeInfoCmpetRtSvc/v1/getPblPvtRentLttotPblancCmpet",
        "winner": "ApplyhomeInfoPblancWinnerSvc/v1/getPblPvtRentLttotPblancWinner",
    },
    "opt": {
        "label": "임의공급",
        "detail": "ApplyhomeInfoDetailSvc/v1/getOPTLttotPblancDetail",
        "mdl": "ApplyhomeInfoDetailSvc/v1/getOPTLttotPblancMdl",
        "cmpet": "ApplyhomeInfoCmpetRtSvc/v1/getOPTLttotPblancCmpet",
        "winner": "ApplyhomeInfoPblancWinnerSvc/v1/getOPTLttotPblancWinner",
    },
}


def _require_key() -> str:
    if not settings.applyhome_api_key:
        raise RuntimeError("APPLYHOME_API_KEY가 설정되지 않았습니다. .env를 확인하세요.")
    return settings.applyhome_api_key


def _to_date(value: str | None) -> date | None:
    if not value:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if len(digits) < 8:
        return None
    try:
        return date(int(digits[0:4]), int(digits[4:6]), int(digits[6:8]))
    except ValueError:
        return None


def _to_month(value: str | None) -> date | None:
    if not value:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if len(digits) < 6:
        return None
    try:
        return date(int(digits[0:4]), int(digits[4:6]), 1)
    except ValueError:
        return None


def _json_data(response: httpx.Response) -> list[dict]:
    try:
        body = response.json()
    except ValueError:
        return []
    if isinstance(body, dict) and isinstance(body.get("data"), list):
        return body["data"]
    return []


def _odcloud_get(client: httpx.Client, path: str, extra: dict | None = None) -> list[dict]:
    params: dict = {
        "serviceKey": _require_key(),
        "page": 1,
        "perPage": 20,
    }
    if extra:
        params.update(extra)
    try:
        response = client.get(f"{APPLYHOME_BASE_URL}/{path}", params=params)
    except httpx.TimeoutException:
        return []
    if response.status_code >= 400:
        return []
    return _json_data(response)


def _to_listing(row: dict, unit: dict) -> dict:
    return {
        "external_id": f"{row.get('PBLANC_NO')}-{unit.get('MODEL_NO')}",
        "unit_size_sqm": float(unit["SUPLY_AR"]) if unit.get("SUPLY_AR") else None,
        "unit_count": int(unit.get("SUPLY_HSHLDCO") or 0) + int(unit.get("SPSPLY_HSHLDCO") or 0),
        "sale_price": int(unit["LTTOT_TOP_AMOUNT"]) * 10000 if unit.get("LTTOT_TOP_AMOUNT") else None,
        "complex_name": row.get("HOUSE_NM"),
        "address": row.get("HSSPLY_ADRES"),
        "supply_type": row.get("HOUSE_SECD_NM"),
        "receipt_start": _to_date(row.get("GNRL_RNK1_CRSPAREA_RCPTDE")),
        "receipt_end": _to_date(row.get("GNRL_RNK1_CRSPAREA_ENDDE")),
        "move_in_date": _to_month(row.get("MVN_PREARNGE_YM")),
        "notice_url": row.get("PBLANC_URL"),
    }


def fetch_new_listings() -> list[dict]:
    with httpx.Client(timeout=30.0) as client:
        rows = _odcloud_get(
            client,
            HOUSING_KINDS["apt"]["detail"],
            {"page": 1, "perPage": 50},
        )
        listings = []
        for row in rows:
            units = _odcloud_get(
                client,
                HOUSING_KINDS["apt"]["mdl"],
                {"page": 1, "perPage": 100, "cond[PBLANC_NO::EQ]": row.get("PBLANC_NO")},
            )
            for unit in units:
                listings.append(_to_listing(row, unit))
        return listings


def fetch_competition_listings(page: int = 1, per_page: int = 100, kind: str = "apt") -> list[dict]:
    spec = HOUSING_KINDS[kind]
    with httpx.Client(timeout=30.0) as client:
        return _odcloud_get(client, spec["cmpet"], {"page": page, "perPage": per_page})


def fetch_pblanc_nos(limit: int, per_page: int = 100, kind: str = "apt") -> list[str]:
    seen: list[str] = []
    page = 1
    while len(seen) < limit and page <= 20:
        rows = fetch_competition_listings(page=page, per_page=per_page, kind=kind)
        if not rows:
            break
        for row in rows:
            no = row.get("PBLANC_NO")
            if not no or no in seen:
                continue
            seen.append(str(no))
            if len(seen) >= limit:
                break
        if len(rows) < per_page:
            break
        page += 1
    return seen


def fetch_detail_notices(
    kind: str,
    limit: int | None = 3,
    per_page: int = 100,
) -> list[dict]:
    spec = HOUSING_KINDS[kind]
    seen: list[str] = []
    notices: list[dict] = []
    page = 1
    with httpx.Client(timeout=30.0) as client:
        while page <= 500:
            print("저장 중", kind, "page", page, flush=True)
            rows = _odcloud_get(
                client,
                spec["detail"],
                {"page": page, "perPage": per_page},
            )
            time.sleep(0.2)
            if not rows:
                break
            for row in rows:
                no = row.get("PBLANC_NO")
                if not no or str(no) in seen:
                    continue
                seen.append(str(no))
                notices.append(row)
                if limit is not None and len(notices) >= limit:
                    return notices
            if len(rows) < per_page:
                break
            page += 1
    return notices


def fetch_pblanc_nos_from_detail(
    kind: str,
    limit: int | None = 3,
    per_page: int = 100,
) -> list[str]:
    return [str(row["PBLANC_NO"]) for row in fetch_detail_notices(kind, limit=limit, per_page=per_page)]


def fetch_service_pages(
    path: str,
    per_page: int = 100,
    max_pages: int = 500,
    require_pblanc: bool = False,
) -> list[dict]:
    rows: list[dict] = []
    page = 1
    with httpx.Client(timeout=30.0) as client:
        while page <= max_pages:
            print("수집 page", page, path, flush=True)
            chunk = _odcloud_get(client, path, {"page": page, "perPage": per_page})
            time.sleep(0.2)
            if not chunk:
                break
            if require_pblanc and page == 1 and not any(row.get("PBLANC_NO") for row in chunk):
                print("공고번호 없는 응답이라 당첨 전체 수집을 건너뜁니다", path, flush=True)
                return []
            rows.extend(chunk)
            if len(chunk) < per_page:
                break
            page += 1
    return rows


async def _odcloud_aget(client: httpx.AsyncClient, path: str, extra: dict | None = None) -> list[dict]:
    params: dict = {
        "serviceKey": _require_key(),
        "page": 1,
        "perPage": 20,
    }
    if extra:
        params.update(extra)
    try:
        response = await client.get(f"{APPLYHOME_BASE_URL}/{path}", params=params)
    except httpx.TimeoutException:
        return []
    if response.status_code >= 400:
        return []
    return _json_data(response)


async def _fetch_mdl_map(kind: str, pblanc_nos: list[str], concurrency: int = 20) -> dict[str, list[dict]]:
    spec = HOUSING_KINDS[kind]
    semaphore = asyncio.Semaphore(concurrency)
    result: dict[str, list[dict]] = {}
    timeout = httpx.Timeout(3.0, connect=2.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async def one(index: int, pblanc_no: str) -> None:
            async with semaphore:
                if index == 1 or index % 50 == 0:
                    print("주택형 수집", kind, index, "/", len(pblanc_nos), flush=True)
                rows = await _odcloud_aget(
                    client,
                    spec["mdl"],
                    {"page": 1, "perPage": 100, "cond[PBLANC_NO::EQ]": pblanc_no},
                )
                result[pblanc_no] = rows
                await asyncio.sleep(0.05)

        await asyncio.gather(*[one(index, no) for index, no in enumerate(pblanc_nos, start=1)])
    return result


def fetch_mdl_map(kind: str, pblanc_nos: list[str]) -> dict[str, list[dict]]:
    if not pblanc_nos:
        return {}
    return asyncio.run(_fetch_mdl_map(kind, pblanc_nos))


def fetch_competition_by_pblanc(
    pblanc_no: str,
    kind: str = "apt",
    client: httpx.Client | None = None,
) -> list[dict]:
    spec = HOUSING_KINDS[kind]
    params = {"page": 1, "perPage": 100, "cond[PBLANC_NO::EQ]": pblanc_no}
    try:
        if client is not None:
            return _odcloud_get(client, spec["cmpet"], params)
        with httpx.Client(timeout=8.0) as own:
            return _odcloud_get(own, spec["cmpet"], params)
    except (httpx.HTTPError, httpx.TimeoutException):
        return []


def fetch_winners_by_pblanc(
    pblanc_no: str,
    kind: str = "apt",
    client: httpx.Client | None = None,
) -> list[dict]:
    spec = HOUSING_KINDS[kind]
    params = {"page": 1, "perPage": 50, "cond[PBLANC_NO::EQ]": pblanc_no}
    try:
        if client is not None:
            return _odcloud_get(client, spec["winner"], params)
        with httpx.Client(timeout=8.0) as own:
            return _odcloud_get(own, spec["winner"], params)
    except (httpx.HTTPError, httpx.TimeoutException):
        return []


def winner_cutoff(rows: list[dict]) -> int | None:
    for row in rows:
        for key in ("LWET_SCORE", "MIN_SCORE", "AVRG_SCORE", "SCORE", "WIN_SCORE"):
            raw = row.get(key)
            if raw in (None, "", "-"):
                continue
            try:
                return int(float(str(raw).replace(",", "")))
            except ValueError:
                continue
    return None


def bundle_from_notice(
    pblanc_no: str,
    kind: str,
    row: dict,
    units: list[dict],
    competition: list[dict],
    cutoff_score: int | None,
) -> dict:
    spec = HOUSING_KINDS[kind]
    receipt_start = (
        _to_date(row.get("RCEPT_BGNDE"))
        or _to_date(row.get("SUBSCRPT_RCEPT_BGNDE"))
        or _to_date(row.get("GNRL_RNK1_CRSPAREA_RCPTDE"))
        or _to_date(row.get("GNRL_RCEPT_BGNDE"))
    )
    receipt_end = (
        _to_date(row.get("RCEPT_ENDDE"))
        or _to_date(row.get("SUBSCRPT_RCEPT_ENDDE"))
        or _to_date(row.get("GNRL_RNK1_CRSPAREA_ENDDE"))
        or _to_date(row.get("GNRL_RCEPT_ENDDE"))
    )
    notice_year = receipt_start or _to_date(row.get("RCRIT_PBLANC_DE")) or date.today()
    house_type = row.get("HOUSE_SECD_NM") or spec["label"]
    return {
        "kind": kind,
        "pblanc_no": pblanc_no,
        "complex_name": row.get("HOUSE_NM"),
        "address": row.get("HSSPLY_ADRES"),
        "region_code": row.get("SUBSCRPT_AREA_CODE") or "unknown",
        "supply_type": str(house_type)[:50],
        "notice_url": row.get("PBLANC_URL"),
        "receipt_start": receipt_start,
        "receipt_end": receipt_end,
        "announce_date": _to_date(row.get("PRZWNER_PRESNATN_DE")),
        "move_in_date": _to_month(row.get("MVN_PREARNGE_YM")),
        "year": notice_year.year,
        "units": units,
        "competition": competition,
        "cutoff_score": cutoff_score,
    }


def fetch_bundle_by_pblanc(
    pblanc_no: str,
    kind: str = "apt",
    include_rates: bool = False,
    notice_row: dict | None = None,
    skip_units: bool = False,
) -> dict:
    spec = HOUSING_KINDS[kind]
    timeout = httpx.Timeout(4.0, connect=3.0)
    with httpx.Client(timeout=timeout) as client:
        if notice_row is None:
            notice_rows = _odcloud_get(
                client,
                spec["detail"],
                {"page": 1, "perPage": 10, "cond[PBLANC_NO::EQ]": pblanc_no},
            )
            row = notice_rows[0] if notice_rows else {}
        else:
            row = notice_row
        units: list[dict] = []
        if not skip_units:
            units = _odcloud_get(
                client,
                spec["mdl"],
                {"page": 1, "perPage": 100, "cond[PBLANC_NO::EQ]": pblanc_no},
            )
        competition: list[dict] = []
        winners: list[dict] = []
        if include_rates:
            competition = fetch_competition_by_pblanc(pblanc_no, kind=kind, client=client)
            if competition:
                winners = fetch_winners_by_pblanc(pblanc_no, kind=kind, client=client)
    return bundle_from_notice(
        pblanc_no,
        kind,
        row,
        units,
        competition,
        winner_cutoff(winners),
    )
