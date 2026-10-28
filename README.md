# 청약 전략 플랫폼 (가칭)

> **English:** [see the English version below](#english-version)

청약홈 + 내집다오 기능을 통합해, 사용자의 자산·청약통장·희망지역을 입력받아
당첨 가능성이 높은 청약 공고를 추천하고 대출(정책대출/은행대출)까지 안내하는 서비스.

기획 배경과 데이터/아키텍처 설계는 `docs/청약_전략_플랫폼_기획안.pdf` 참고.

## 이 레포의 범위: 2주차(~10/30) 산출물

산출물 계획표 기준으로 2주차까지 마감인 산출물에 해당하는 코드와 문서만 담았다.

| 단계 | 산출물 (마감) | 이 레포에 있는 것 |
|---|---|---|
| 기획 | 요구사항 정의서 · WBS · 프로젝트 기획서 (10/23) | `docs/` 기획안, 요구사항 정의서, 주제 방향성 문서 |
| 데이터 수집 및 저장 | 수집 데이터 보고서 (10/23), DB/저장소 설계 문서 (~11/06) | 수집 코드 `backend/app/data_pipeline/`, DB 모델 `backend/app/models/`, 마이그레이션 `backend/alembic/`, `docs/ERD.md` |
| 모델링 및 평가 | AI 시스템 아키텍처 (10/30) | `docs/` 아키텍처 문서 |
| 모델 배포 | 화면설계서 · 시스템 구성도 (10/30) | 화면 프로토타입 `frontend/public/prototype/`, Docker 실행 환경 |

다음 주차에 추가하는 것: 추천·대출·진단 등 웹앱 API(3주차~), 데이터 전처리·ML/DL 학습(3~4주차), 벡터DB·RAG(4주차), LLM 에이전트(5주차), 영어 화면 번역.
그래서 지금 화면은 디자인과 흐름을 보여 주는 단계이고, 서버 데이터가 필요한 부분(공고·추천·대출·AI 답변)은 비어 있거나 오류 안내가 나온다. 백엔드는 `/health`와 데이터 수집 스케줄러만 동작한다.

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
공고·상품·AI 답변과 청약진단의 서버 연동은 3주차 이후 웹앱 API와 함께 추가합니다.
커뮤니티만 **시연 전용 가짜 데이터**로 동작하며, 글·댓글·친구·메시지는 별도 브라우저 저장 공간에 보관합니다.
가짜 데이터와 저장 정책, 청약진단 후속 연동 경계는 [커뮤니티 시연 데이터 안내](docs/community-demo.md)를 참고하세요.

### 3. 한 번에 실행 (Docker)
```bash
docker compose up --build
```

---

<a id="english-version"></a>

# Housing Subscription Strategy Platform (working title) — English version

A service that combines the features of Applyhome (청약홈) and the "My Home" portal (내집다오). It takes a user's assets, subscription account and preferred regions, recommends housing-subscription listings with a high chance of winning, and guides them to loans (policy loans and bank loans).

For the background, data and architecture design, see `docs/청약_전략_플랫폼_기획안.pdf` (Korean).

## Scope of this repository: week-2 deliverables (up to 30 Oct)

Following the deliverables plan, this repository contains only the code and documents for deliverables due by week 2.

| Stage | Deliverable (due) | What is here |
|---|---|---|
| Planning | Requirements, WBS, project plan (23 Oct) | Plans, requirements and topic documents in `docs/` |
| Data collection & storage | Collected-data report (23 Oct), DB/storage design (by 6 Nov) | Collection code `backend/app/data_pipeline/`, DB models `backend/app/models/`, migrations `backend/alembic/`, `docs/ERD.md` |
| Modelling & evaluation | AI system architecture (30 Oct) | Architecture documents in `docs/` |
| Deployment | Screen design, system diagram (30 Oct) | Screen prototype `frontend/public/prototype/`, Docker setup |

Added in later weeks: web-app APIs for recommendations, loans and checks (week 3+), pre-processing and ML/DL training (weeks 3–4), vector DB and RAG (week 4), LLM agents (week 5) and English screen translation.
So the screens currently show the design and flow; parts that need server data (listings, recommendations, loans, AI answers) are empty or show an error notice. The backend runs only `/health` and the data-collection scheduler.

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
The server connection for listings, products, AI answers and the eligibility check is added with the web-app APIs from week 3.
Only the community runs on **demo-only fake data**; posts, comments, friends and messages are kept in separate browser storage.
For the fake data, the storage policy and the boundary with the eligibility check, see the [community demo data guide](docs/community-demo.md) (Korean).

### 3. Run everything at once (Docker)
```bash
docker compose up --build
```
