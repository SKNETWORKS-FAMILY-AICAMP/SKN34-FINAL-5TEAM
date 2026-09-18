"""공공지원민간임대 / 임의공급의 Detail 원본 필드 + 평형별(Mdl류) 추정 엔드포인트를 테스트하는
임시 디버그 스크립트. 실행: cd backend && python -m app.data_pipeline._debug_fields
확인 끝나면 지워도 되는 파일입니다.
"""

import json

import httpx

from app.data_pipeline.applyhome_client import APPLYHOME_BASE_URL, HOUSE_TYPE_ENDPOINTS, _require_api_key, fetch_details

api_key = _require_api_key()

# 1) Detail 응답 원본 필드 확인 (1건씩)
sample_pblanc_no = {}
for house_type in ["공공지원민간임대", "임의공급"]:
    endpoint_name, date_format = HOUSE_TYPE_ENDPOINTS[house_type]
    print("=" * 70)
    print(f"[{house_type}] Detail endpoint = {endpoint_name} (date_format={date_format})")
    rows = fetch_details(endpoint_name, from_date="2026-01-01", per_page=1, date_format=date_format)
    if not rows:
        print("  (데이터 없음 - 날짜 범위 안에 해당 유형 공고가 없을 수 있음)")
        continue
    print(json.dumps(rows[0], ensure_ascii=False, indent=2))
    sample_pblanc_no[house_type] = rows[0].get("PBLANC_NO")

# 2) 평형별(Mdl류) 엔드포인트 이름 추정해서 테스트
GUESSED_MDL_ENDPOINTS = {
    "공공지원민간임대": "getPblPvtRentLttotPblancMdl",
    "임의공급": "getOPTLttotPblancMdl",
}

with httpx.Client(timeout=10.0) as client:
    for house_type, endpoint in GUESSED_MDL_ENDPOINTS.items():
        pblanc_no = sample_pblanc_no.get(house_type)
        if not pblanc_no:
            print("=" * 70)
            print(f"[{house_type}] 테스트할 공고번호가 없어서 Mdl 테스트 스킵")
            continue
        url = f"{APPLYHOME_BASE_URL}/{endpoint}"
        print("=" * 70)
        print(f"[{house_type}] 시도: {endpoint}  (PBLANC_NO={pblanc_no})")
        resp = client.get(
            url,
            params={"serviceKey": api_key, "page": 1, "perPage": 20, "cond[PBLANC_NO::EQ]": pblanc_no},
        )
        print(f"  HTTP {resp.status_code}")
        try:
            print(json.dumps(resp.json(), ensure_ascii=False, indent=2)[:2000])
        except Exception:
            print(resp.text[:500])
