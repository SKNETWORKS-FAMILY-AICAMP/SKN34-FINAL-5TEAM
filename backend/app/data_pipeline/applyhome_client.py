"""청약홈 공공데이터포털 API 연동 (기획안 5장 '청약 공고' 데이터 소스).

data.go.kr에서 '한국부동산원_청약홈 청약 신청·당첨자 정보 조회 서비스' API 키를
발급받아 .env의 APPLYHOME_API_KEY에 넣고 사용한다.
"""

import httpx

from app.core.config import settings

APPLYHOME_BASE_URL = "https://api.odcloud.kr/api"  # TODO: 실제 엔드포인트로 교체


def fetch_new_listings() -> list[dict]:
    """신규 청약 공고 목록을 가져온다.

    TODO:
      1. 공공데이터포털에서 발급받은 실제 엔드포인트/파라미터로 교체
      2. 응답 필드를 app.models.listing.Listing 스키마에 맞게 매핑
      3. data_pipeline/scheduler.py에서 주기적으로 호출해 DB에 upsert
    """
    if not settings.applyhome_api_key:
        raise RuntimeError("APPLYHOME_API_KEY가 설정되지 않았습니다. .env를 확인하세요.")

    # 자리표시자 요청 예시 (실제 파라미터는 API 문서 확인 후 수정)
    with httpx.Client(timeout=10.0) as client:
        response = client.get(
            f"{APPLYHOME_BASE_URL}/PUBSVC",
            params={"serviceKey": settings.applyhome_api_key, "page": 1, "perPage": 50},
        )
        response.raise_for_status()
        return response.json().get("data", [])
