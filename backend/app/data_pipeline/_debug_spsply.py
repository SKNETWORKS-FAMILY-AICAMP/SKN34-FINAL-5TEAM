"""getAPTSpsplyReqstStus (APT 특별공급 신청현황) 엔드포인트 실제 존재 여부 + 필드 구조 확인용 디버그 스크립트.
아직 공식 문서로 검증 안 된 엔드포인트 이름이라, 먼저 호출해보고 필드를 확인한다."""

import json
import httpx
from app.data_pipeline.applyhome_client import _require_api_key

CMPET_BASE_URL = "https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1"


def try_endpoint(name: str, pblanc_no: str | None = None):
    api_key = _require_api_key()
    url = f"{CMPET_BASE_URL}/{name}"
    params = {"serviceKey": api_key, "page": 1, "perPage": 1}
    if pblanc_no:
        params["cond[PBLANC_NO::EQ]"] = pblanc_no
    print("=" * 70)
    print(f"{name} (필터: {pblanc_no or '없음'})")
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, params=params)
            print(f"  HTTP {resp.status_code}")
            print(json.dumps(resp.json(), ensure_ascii=False, indent=2)[:1500])
    except Exception as exc:
        print(f"  에러: {exc}")


if __name__ == "__main__":
    # 필터 없이 아무 데이터나 1건 요청 - 존재 여부 + 필드 구조 확인
    try_endpoint("getAPTSpsplyReqstStus")
    # 혹시 이 이름이 틀렸을 때를 대비한 다른 후보들도 같이 테스트
    try_endpoint("getAPTLttotPblancSpsplyReqstStus")
    try_endpoint("getAPTSpsplyRcritCmpet")
