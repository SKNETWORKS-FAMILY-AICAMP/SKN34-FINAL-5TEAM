"""경쟁률(Cmpet) API 원본 필드 확인용 임시 디버그 스크립트 (v2).
아까는 아직 당첨자 발표 전인 공고로 테스트해서 다 비어있었음 -> 이번엔 공고번호 필터 없이
그냥 아무 실제 데이터나 1건 가져와서 필드 구조부터 확인한다.
실행: cd backend && python -m app.data_pipeline._debug_cmpet
확인 끝나면 지워도 되는 파일입니다.
"""

import json

import httpx

from app.data_pipeline.applyhome_client import _require_api_key

CMPET_BASE_URL = "https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1"

ENDPOINTS = [
    "getAPTLttotPblancCmpet",
    "getUrbtyOfctlLttotPblancCmpet",
    "getRemndrLttotPblancCmpet",
]

api_key = _require_api_key()

with httpx.Client(timeout=10.0) as client:
    for endpoint in ENDPOINTS:
        url = f"{CMPET_BASE_URL}/{endpoint}"
        print("=" * 70)
        print(f"{endpoint} (공고번호 필터 없이 아무 데이터나 1건)")
        resp = client.get(url, params={"serviceKey": api_key, "page": 1, "perPage": 1})
        print(f"  HTTP {resp.status_code}")
        try:
            print(json.dumps(resp.json(), ensure_ascii=False, indent=2)[:2000])
        except Exception:
            print(resp.text[:500])
