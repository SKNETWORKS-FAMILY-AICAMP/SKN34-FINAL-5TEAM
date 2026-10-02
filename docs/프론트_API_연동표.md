# 프론트 API 연동표

기준: `local/combined` · 백엔드 `http://localhost:8000`

프론트는 분양가에 0.1을 곱하지 않는다. 계약금은 `contract_deposit`을 쓰고, `deposit_is_estimate`가 true이면 "공고 기준 가정치"로 표시한다.

| ID | 메서드 | 경로 | 요청 | 응답에서 쓸 값 |
|---|---|---|---|---|
| REQ-01 | POST | `/users/` | 이메일, 무주택기간, 가용자산, 희망지역 등 | `id` |
| REQ-01 | GET | `/users/{user_id}` | — | 프로필. 없으면 404 |
| REQ-02 | GET | `/listings/?page=1&per_page=20&region_code=&supply_type=` | 쿼리 | `items`, `total`, `page`, `per_page` |
| REQ-02 | GET | `/listings/{listing_id}` | — | 공고 1건 + 아래 가공 필드 |
| REQ-03 | GET | `/recommendations/{user_id}` | — | `items[]`. 없는 사용자면 `items: []` |
| REQ-04 | (추천 항목) | | | `eligible`, `score`, `percentile_band` (상/중/하, 당첨 확률이라고 쓰지 않음) |
| REQ-05 | POST | `/loans/match` | `{ "user_id", "listing_id" }` | 대출 상품 배열, 최대 20 |
| REQ-06 | (공고 필드) | | | `contract_deposit`, `deposit_is_estimate`, `days_until_receipt_start`, `days_until_receipt_end`, `days_until_announce`, `required_documents` |
| REQ-07 | POST | `/chat/` | `{ "question", "listing_id" }` | `answer`, `source`, `intent`, `evidence` |
| — | GET | `/health` | — | `{ "status": "ok" }` |

공고 상세의 질문은 반드시 `listing_id`를 넣는다. `intent`가 `api`이면 자격·금액 질문이므로 추천·대출 API를 호출한다.
