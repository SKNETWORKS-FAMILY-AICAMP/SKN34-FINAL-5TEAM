# 청약 전략 플랫폼 (가칭)

> **English:** [see the English version below](#english-version)

청약홈 + 내집다오 기능을 통합해, 사용자의 자산·청약통장·희망지역을 입력받아
당첨 가능성이 높은 청약 공고를 추천하고 대출(정책대출/은행대출)까지 안내하는 서비스.

기획 배경과 데이터/아키텍처 설계는 `docs/청약_전략_플랫폼_기획안.pdf` 참고.

## 최종 프로젝트 가이드와 최신 기획 기준

- [최종 프로젝트 가이드 적용 계획](docs/최종프로젝트_가이드_적용계획.md): 내 집 마련·금융정보·학습 기획과 5팀의 대화형 분석·자동 리포팅 주제, 필수 기능, 주차별 산출물, 평가·확인 항목을 연결한 기준 문서입니다.
- [최종 프로젝트 가이드 원문](docs/최종프로젝트_가이드_원문.md): 2026-10-16 사용자가 제공한 가이드 보관본입니다.

기획·기능·일정 변경 시 위 문서를 먼저 확인합니다. 기존 문서의 구현/검증 표시는 새 기획 전체나 현재 실행 환경의 완료를 의미하지 않으며, 강사 확인 전 제안과 실제 구현 상태를 구분합니다.

## 최신화 작업 기준

[프로젝트 작업 지침](AGENTS.md)에 따라 코드 동기화와 함께 DB 마이그레이션, Docker·의존성 반영 필요 여부, 실제 API·로그인 동작까지 확인합니다. DB 변경 전에는 백업하고 기존 데이터를 보존합니다. 모의 API 테스트나 코드 동기화만으로 실제 실행 환경의 최신화 완료를 판단하지 않습니다.

## 프로젝트 구조

```
cheongyak-platform/
├── backend/                 # FastAPI 서버
│   ├── app/
│   │   ├── main.py          # 앱 엔트리포인트
│   │   ├── core/            # 설정
│   │   ├── db/              # DB 세션/베이스
│   │   ├── models/          # SQLAlchemy 모델 (User, Listing, HistoricalResult, LoanProduct)
│   │   ├── schemas/         # Pydantic 스키마 (요청/응답)
│   │   ├── api/routes/      # 엔드포인트 (recommendations, listings, loans, chat)
│   │   ├── services/        # 매칭 엔진 (자격필터 → 확률추정 → 대출매칭)
│   │   └── data_pipeline/   # 청약홈 API 등 외부 데이터 수집
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # React + Redux
│   └── src/
│       ├── pages/            # InputForm, Dashboard, ListingDetail, LoanSimulator
│       ├── store/            # Redux Toolkit slices
│       ├── components/
│       └── api/              # axios 클라이언트
├── docker-compose.yml         # postgres + backend + frontend 한 번에 실행
└── docs/                      # 기획 문서
```

## 시작하기

### 0. 사전 준비
- Python 3.11+, Node.js 18+, Docker (선택)

### 1. 백엔드 실행
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows는 venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```
`http://localhost:8000/docs` 에서 자동 생성된 API 문서를 확인할 수 있습니다.

### 2. 프론트엔드 실행
```bash
cd frontend
npm install
npm start
```
`http://localhost:3000` 에서 확인.

기본 프론트는 공유한 **청약돼?! 전체 데모 UI**입니다. 첫 화면, 진단, 집 찾기,
금융 정보, 지역·연합 커뮤니티와 내 공간을 같은 디자인으로 체험할 수 있습니다.
데모 자산은 `frontend/public/prototype/`에 포함되어 있으며 외부 Sites 배포에 의존하지 않습니다.
공고·상품·AI 답변과 청약진단은 기존 서버 연동을 사용합니다.
커뮤니티만 **시연 전용 가짜 데이터**로 동작하며, 글·댓글·친구·메시지는 별도 브라우저 저장 공간에 보관합니다.
가짜 데이터와 저장 정책, 청약진단 후속 연동 경계는 [커뮤니티 시연 데이터 안내](docs/community-demo.md)를 참고하세요.
기존 백엔드 API 연동 화면은 `http://localhost:3000/legacy/`에서 확인합니다.

### 3. 한 번에 실행 (Docker)
```bash
docker compose up --build
```

## 공고문 질문(RAG) 검색 준비

공고 상세에서 "소득 기준이 뭐야" 같은 질문에 답하려면, 공고문 원문을 벡터 DB에 한 번 색인해야 한다.
색인하지 않아도 앱은 동작하고, 그때는 단지명·분양가·접수일 같은 공고 필드에서만 찾는다.

```bash
cd backend
pip install -r requirements.txt            # chromadb, fastembed 포함
# backend/.env 에 RAG_EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-mpnet-base-v2 를 넣는다
# (비워 두면 벡터 검색이 꺼진다. 처음 쓸 때 모델 약 1GB를 내려받는다)
python -m scripts.build_vector_index       # 공고문 조각 색인. 이미 한 공고는 건너뛴다 (전체는 CPU로 약 1시간)
python -m scripts.eval_rag --fresh         # 검색 정확도 평가 (평가 질문: backend/eval/rag_eval_set.json)
```

벡터 DB는 `backend/data/vectordb/`에 생기고 Git에는 올리지 않는다. 임베딩 모델을 바꾸면 `--force`로 다시 색인한다.
처음 한 번 직접 색인해 두면, 그다음부터는 매일 수집(`save_listings`)이 끝날 때 접수 중·예정 공고 중 새로 들어오거나 정정된 공고문만 자동으로 색인한다.
벡터 DB가 없거나 `RAG_EMBEDDING_MODEL`이 비어 있으면 이 단계는 건너뛰고 수집은 그대로 진행된다.

> **주의: 프로젝트가 구글 드라이브·OneDrive 같은 동기화 폴더 안에 있으면 벡터 DB를 그 안에 두지 않는다.**
> 동기화 폴더에서는 Chroma의 인덱스 파일이 제대로 저장되지 않아, 다시 열 때 `Error loading hnsw index`로 실패한다
> (실제로 겪었다. 이때 앱은 오류 없이 공고 필드 검색으로 대체된다).
> `backend/.env`에 로컬 폴더를 지정한다. 예: `VECTOR_DB_PATH=C:/Users/내계정/AppData/Local/cheongyak/vectordb`

## 커트라인 예측 모델 학습 (ML + 딥러닝)

공고별 예상 커트라인 모델은 후보 4종을 같은 조건(2020~2024 학습 / 2025~ 검증)으로 비교해 MAE가 가장 작은 것을 운영에 쓴다.
후보: Ridge 선형회귀, 랜덤포레스트, 그래디언트 부스팅, **PyTorch MLP(딥러닝, `app/services/cutoff_mlp.py`)**.

```bash
cd backend
pip install -r requirements.txt               # torch(CPU) 포함. Docker는 docker compose up -d --build backend
python -m scripts.tune_cutoff_mlp             # (선택) MLP 설정 비교 → models/cutoff_mlp_tuning.json
python -m scripts.train_cutoff_model          # 4종 비교·저장 → models/cutoff_reg_metrics.json, cutoff_mlp_history.json
```

Docker로 실행 중이면 `docker compose exec backend python -m scripts.train_cutoff_model`로 같은 학습을 돌린다.
torch가 없으면 MLP 후보만 빠지고 나머지 3종은 그대로 비교된다.

## 지금 여기까지 되어 있는 것 / 아직 안 되어 있는 것

진행 상태와 API 표는 `docs/요구사항_정의서.md`, `docs/프론트_API_연동표.md` 를 본다.

- 됨: 수집 코드, 사용자·공고·추천·대출·출퇴근 API, 공고문에 적힌 계약금 숫자 반영, D-day, 준비 서류, 공고 질문(LangGraph 그래프, 질문 분류, 벡터 검색, 로컬 LLM 답변과 근거 번호)
- 안 됨: Docker가 꺼져 있으면 로컬 listings 확인 불가, 클라우드 배포, 공고문 파일 링크가 없는 공고의 계약금, GPU 없이 LLM 답변이 느림(한 답 40~80초)

## 공고 질문 LLM 연결

OpenAI 키가 없어도 로컬 [Ollama](https://ollama.com)로 답한다. `backend/.env`:

```
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=exaone3.5:7.8b
LLM_TIMEOUT_SECONDS=120
```

```bash
ollama pull exaone3.5:7.8b                        # 약 4.8GB, 한국어 답변용
cd backend && python -m scripts.eval_llm_answers --limit 10   # 답변 채점 (결과: backend/eval/llm_answer_result_<모델>.json)
```

OpenAI를 쓰려면 `LLM_BASE_URL=https://api.openai.com/v1`, `LLM_MODEL=gpt-4o-mini`로 바꾸고 `OPENAI_API_KEY`를 넣는다.
LLM을 쓸 수 없으면(Ollama 꺼짐 등) 챗은 공고 문장을 그대로 보여 준다.

## 영어 화면 번역 (선택)

화면 위 초록 띠의 **KO | EN** 스위치로 영어 화면을 볼 수 있다. 화면 문구는 `frontend/public/prototype/i18n-en.js` 사전으로 바꾸고,
공고명·주소·금융상품명처럼 서버에서 오는 데이터는 Google Cloud Translation으로 번역한다 (키가 없으면 한국어 원문 그대로).

`backend/.env`:

- `GOOGLE_TRANSLATE_API_KEY` — [Google Cloud](https://console.cloud.google.com) 프로젝트에서 **Cloud Translation API** 사용 설정 후 만든 API 키 (Cloud Translation API만 허용하도록 제한 권장)

DB 마이그레이션: `alembic upgrade head` (016_translation_cache — 한 번 번역한 문장을 저장해 API를 다시 부르지 않는다).

## 구글·카카오·네이버·PASS 로그인

백엔드 `GET /auth/google/login`, `/auth/kakao/login`, `/auth/naver/login`, `/auth/pass/login`으로 시작하고, 콜백 후 프론트 `/auth/callback`으로 돌아온다.

`backend/.env` 예시:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — [Google Cloud](https://console.cloud.google.com) OAuth 클라이언트
- `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/auth/google/callback`
- `KAKAO_REST_API_KEY` — 카카오 로그인 client_id (REST API 키와 동일)
- `KAKAO_OAUTH_REDIRECT_URI=http://localhost:8000/auth/kakao/callback` — [카카오 개발자](https://developers.kakao.com) 앱에 등록
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` — [네이버 개발자센터](https://developers.naver.com) 로그인 API
- `NAVER_OAUTH_REDIRECT_URI=http://localhost:8000/auth/naver/callback`
- `PASS_CLIENT_ID`, `PASS_CLIENT_SECRET` — 통신3사 PASS 휴대폰번호 로그인 ([developers.passlogin.com](https://developers.passlogin.com) 제휴)
- `PASS_OAUTH_REDIRECT_URI=http://localhost:8000/auth/pass/callback`
- `FRONTEND_URL=http://localhost:3001` — OAuth 완료 후 리다이렉트할 프론트 주소
- `OAUTH_STATE_SECRET` — state 서명용 (운영에서는 긴 랜덤 문자열)

DB 마이그레이션: `alembic upgrade head` (006_user_oauth).

---

<a id="english-version"></a>

# Housing Subscription Strategy Platform (working title) — English version

A service that combines the features of Applyhome (청약홈) and the "My Home" portal (내집다오). It takes a user's assets, subscription account and preferred regions, recommends housing-subscription listings with a high chance of winning, and guides them to loans (policy loans and bank loans).

For the background, data and architecture design, see `docs/청약_전략_플랫폼_기획안.pdf` (Korean).

## Final-project guide and the latest plan

- [How we apply the final-project guide](docs/최종프로젝트_가이드_적용계획.md) (Korean): the reference document that links the home-buying, financial-information and learning plans to Team 5's topic (conversational analysis and automatic reporting), required features, weekly deliverables and evaluation/check items.
- [Original final-project guide](docs/최종프로젝트_가이드_원문.md) (Korean): an archived copy of the guide provided on 2026-10-16.

Check these documents first whenever the plan, features or schedule change. "Implemented/verified" marks in older documents do not mean the whole new plan, or the current runtime environment, is complete. Keep proposals awaiting the instructor's confirmation separate from what is actually implemented.

## Rules for "update to latest" work

Following the [project working guidelines](AGENTS.md) (Korean), an update covers not only syncing code but also checking DB migrations, whether Docker images or dependencies need rebuilding, and real API and login behaviour. Back up the DB before changing it and keep existing data. Passing mock-API tests or syncing code alone does not mean the runtime environment is up to date.

## Project structure

```
cheongyak-platform/
├── backend/                 # FastAPI server
│   ├── app/
│   │   ├── main.py          # app entry point
│   │   ├── core/            # settings
│   │   ├── db/              # DB session / base
│   │   ├── models/          # SQLAlchemy models (User, Listing, HistoricalResult, LoanProduct)
│   │   ├── schemas/         # Pydantic schemas (request/response)
│   │   ├── api/routes/      # endpoints (recommendations, listings, loans, chat)
│   │   ├── services/        # matching engine (eligibility filter → probability estimate → loan matching)
│   │   └── data_pipeline/   # external data collection (Applyhome API, etc.)
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # React + Redux
│   └── src/
│       ├── pages/            # InputForm, Dashboard, ListingDetail, LoanSimulator
│       ├── store/            # Redux Toolkit slices
│       ├── components/
│       └── api/              # axios client
├── docker-compose.yml         # runs postgres + backend + frontend together
└── docs/                      # planning documents
```

## Getting started

### 0. Prerequisites
- Python 3.11+, Node.js 18+, Docker (optional)

### 1. Run the backend
```bash
cd backend
python -m venv venv && source venv/bin/activate   # on Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```
The auto-generated API docs are at `http://localhost:8000/docs`.

### 2. Run the frontend
```bash
cd frontend
npm install
npm start
```
Open `http://localhost:3000`.

The default frontend is the shared **Cheongyakdwae?! (청약돼?!) full demo UI**. You can try the start page, eligibility check, Find Homes,
Finance, the regional/nationwide community and My Space, all in the same design.
The demo assets are included in `frontend/public/prototype/` and do not depend on an external Sites deployment.
Listings, products, AI answers and the eligibility check use the existing server integration.
Only the community runs on **demo-only fake data**; posts, comments, friends and messages are kept in separate browser storage.
For the fake data, the storage policy and the boundary with the eligibility check, see the [community demo data guide](docs/community-demo.md) (Korean).
The older screens connected to the backend API are at `http://localhost:3000/legacy/`.

### 3. Run everything at once (Docker)
```bash
docker compose up --build
```

## Preparing notice Q&A search (RAG)

To answer questions such as "What is the income limit?" on a listing page, the original notice documents must be indexed into the vector DB once.
The app works without indexing; in that case it only searches listing fields such as complex name, sale price and application dates.

```bash
cd backend
pip install -r requirements.txt            # includes chromadb, fastembed
# put RAG_EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-mpnet-base-v2 in backend/.env
# (leave it empty to turn vector search off; the first run downloads a ~1 GB model)
python -m scripts.build_vector_index       # index notice chunks; already-indexed notices are skipped (about 1 hour on CPU for all)
python -m scripts.eval_rag --fresh         # evaluate retrieval accuracy (questions: backend/eval/rag_eval_set.json)
```

The vector DB is created in `backend/data/vectordb/` and is not committed to Git. If you change the embedding model, re-index with `--force`.
After you index once by hand, every daily collection run (`save_listings`) automatically indexes only new or corrected notices among open and upcoming listings.
If there is no vector DB or `RAG_EMBEDDING_MODEL` is empty, this step is skipped and collection continues as usual.

> **Warning: if the project lives in a synced folder such as Google Drive or OneDrive, do not put the vector DB inside it.**
> Chroma's index files are not saved correctly in synced folders, so reopening fails with `Error loading hnsw index`
> (this actually happened to us; the app then silently falls back to listing-field search).
> Point `backend/.env` to a local folder, e.g. `VECTOR_DB_PATH=C:/Users/<your-account>/AppData/Local/cheongyak/vectordb`

## Training the cut-off prediction model (ML + deep learning)

The per-listing expected cut-off model compares four candidates under the same conditions (train 2020–2024 / validate 2025–) and uses the one with the lowest MAE in service.
Candidates: Ridge regression, random forest, gradient boosting and a **PyTorch MLP (deep learning, `app/services/cutoff_mlp.py`)**.

```bash
cd backend
pip install -r requirements.txt               # includes torch (CPU). With Docker: docker compose up -d --build backend
python -m scripts.tune_cutoff_mlp             # (optional) compare MLP settings → models/cutoff_mlp_tuning.json
python -m scripts.train_cutoff_model          # compare and save all 4 → models/cutoff_reg_metrics.json, cutoff_mlp_history.json
```

If you run with Docker, use `docker compose exec backend python -m scripts.train_cutoff_model` for the same training.
Without torch, only the MLP candidate is skipped and the other three are still compared.

## What works now / what does not yet

For progress and API tables, see `docs/요구사항_정의서.md` and `docs/프론트_API_연동표.md` (Korean).

- Works: collection code; user, listing, recommendation, loan and commute APIs; down-payment amounts read from notices; D-day; required documents; listing Q&A (LangGraph graph, question classification, vector search, local LLM answers with source numbers)
- Not yet: local listings cannot be checked while Docker is off; cloud deployment; down payments for listings without a notice file link; slow LLM answers without a GPU (40–80 seconds per answer)

## Connecting the LLM for listing Q&A

Without an OpenAI key, answers come from a local [Ollama](https://ollama.com). In `backend/.env`:

```
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=exaone3.5:7.8b
LLM_TIMEOUT_SECONDS=120
```

```bash
ollama pull exaone3.5:7.8b                        # about 4.8 GB, for Korean answers
cd backend && python -m scripts.eval_llm_answers --limit 10   # score answers (result: backend/eval/llm_answer_result_<model>.json)
```

To use OpenAI, set `LLM_BASE_URL=https://api.openai.com/v1` and `LLM_MODEL=gpt-4o-mini`, and add `OPENAI_API_KEY`.
If no LLM is available (e.g. Ollama is off), the chat shows the matching notice sentences as they are.

## English screen translation (optional)

Use the **KO | EN** switch in the green bar at the top of the screen to view the site in English. Screen text is replaced from the dictionary in `frontend/public/prototype/i18n-en.js`,
and server data such as listing titles, addresses and financial product names is translated with Google Cloud Translation (without a key, the original Korean is shown).

`backend/.env`:

- `GOOGLE_TRANSLATE_API_KEY` — an API key created after enabling the **Cloud Translation API** in a [Google Cloud](https://console.cloud.google.com) project (restricting the key to the Cloud Translation API only is recommended)

DB migration: `alembic upgrade head` (016_translation_cache — stores each translated sentence so the API is not called again).

## Google, Kakao, Naver and PASS login

Login starts at backend `GET /auth/google/login`, `/auth/kakao/login`, `/auth/naver/login` or `/auth/pass/login`, and after the callback returns to the frontend at `/auth/callback`.

Example `backend/.env`:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — [Google Cloud](https://console.cloud.google.com) OAuth client
- `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/auth/google/callback`
- `KAKAO_REST_API_KEY` — Kakao Login client_id (same as the REST API key)
- `KAKAO_OAUTH_REDIRECT_URI=http://localhost:8000/auth/kakao/callback` — register it in your [Kakao Developers](https://developers.kakao.com) app
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` — [Naver Developers](https://developers.naver.com) login API
- `NAVER_OAUTH_REDIRECT_URI=http://localhost:8000/auth/naver/callback`
- `PASS_CLIENT_ID`, `PASS_CLIENT_SECRET` — PASS mobile-number login from the three Korean carriers (partnership via [developers.passlogin.com](https://developers.passlogin.com))
- `PASS_OAUTH_REDIRECT_URI=http://localhost:8000/auth/pass/callback`
- `FRONTEND_URL=http://localhost:3001` — frontend address to redirect to after OAuth
- `OAUTH_STATE_SECRET` — for signing the state (use a long random string in production)

DB migration: `alembic upgrade head` (006_user_oauth).
