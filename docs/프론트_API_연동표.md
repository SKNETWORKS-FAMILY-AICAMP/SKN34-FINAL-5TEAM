# 프론트 API 연동표

기준: `local/combined` · 백엔드 `http://localhost:8000`

프론트는 분양가에 0.1을 곱하지 않는다. 계약금은 `contract_deposit`을 쓰고, `deposit_is_estimate`가 true이면 "공고 기준 가정치"로 표시한다.

| ID | 메서드 | 경로 | 요청 | 응답에서 쓸 값 |
|---|---|---|---|---|
| REQ-01 | POST | `/users/` | 이메일, 무주택기간, 가용자산, 희망지역 등. `annual_income`(연 소득, 원, 세전)은 선택이고 0 이상만 받는다. `birth_date`(생년월일, 선택)와 `is_married`는 가점에 쓴다: 생년월일을 보내면 만 30세 미만 미혼의 무주택기간은 0점이 된다(안 보내면 적용하지 않는다). 같은 이메일로 다시 보낼 때 빼면 기존 값이 유지된다 | `id` |
| REQ-01 | GET | `/users/{user_id}` | — | 프로필. 없으면 404 |
| REQ-02 | GET | `/listings/?page=1&per_page=20&region_code=&supply_type=` | 쿼리 | `items`, `total`, `page`, `per_page` |
| REQ-02 | GET | `/listings/{listing_id}` | — | 공고 1건 + 아래 가공 필드 |
| REQ-03 | GET | `/recommendations/{user_id}` | — | `items[]`. 없는 사용자면 `items: []` |
| REQ-04 | (추천 항목) | | | `eligible`, `score`, `percentile_band` (상/중/하, 당첨 확률이라고 쓰지 않음) |
| REQ-05 | POST | `/loans/match` | `{ "user_id", "listing_id" }` | 대출 상품 배열, 최대 20. 분양 공고는 주택담보, 임대 공고는 전세자금 상품만. 상품마다 `estimated_limit`(담보 기준 한도, 원) · `limit_basis`(근거) · `income_limit`(소득 기준 한도, 소득 입력 시) · `max_loan`(최종 예상 한도 = 둘 중 작은 값) · `limiting_factor`(한도를 정한 쪽 "담보"/"소득") · `covers_shortfall`(부족 자금을 채우는가)이 붙는다. 소득 기준은 DSR 40%·30년 원리금균등·기존 부채 없음 가정이고 주택담보대출에만 적용한다. 한도를 알 수 없거나 소득 기준을 못 따진 상품은 `covers_shortfall`이 null이고 뒤에 온다. 분양 공고에는 정책대출(`category: "policy"`, id는 음수)이 함께 온다: 소득·주택가격·면적 조건을 만족할 때만 나오고, 한도가 부족 자금보다 작아도 포함된다(`covers_shortfall: false`, 은행 대출과 함께 쓴다). 금리(`interest_rate_min/max`)는 사용자 소득 구간에 맞춘 값이고, `note`에 기준일과 "소득 확인 필요" 같은 안내가 담긴다. **예상 한도는 공시 금액이 아닌 추정값이므로 화면에 "추정"이라고 표시한다** |
| REQ-06 | (공고 필드) | | | `contract_deposit`, `deposit_is_estimate`, `days_until_receipt_start`, `days_until_receipt_end`, `days_until_announce`, `required_documents` |
| REQ-07 | POST | `/chat/` | `{ "question", "listing_id" }` | `answer`, `source`, `intent`, `evidence`, `trace`(거친 그래프 노드 순서). 질문의 주민번호·전화번호·이메일·카드번호는 가려서 처리하고 답변 끝에 안내를 덧붙인다 |
| — | GET | `/health` | — | `{ "status": "ok" }` |

공고 상세의 질문은 반드시 `listing_id`를 넣는다. `intent`가 `api`이면 자격·금액 질문이므로 추천·대출 API를 호출한다.
