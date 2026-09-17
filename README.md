# 청약 전략 플랫폼 (가칭)

청약홈 + 내집다오 기능을 통합해, 사용자의 자산·청약통장·희망지역을 입력받아
당첨 가능성이 높은 청약 공고를 추천하고 대출(정책대출/은행대출)까지 안내하는 서비스.

기획 배경과 데이터/아키텍처 설계는 `docs/청약_전략_플랫폼_기획안.pdf` 참고.

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

### 3. 한 번에 실행 (Docker)
```bash
docker compose up --build
```

## 지금 여기까지 되어 있는 것 / 아직 안 되어 있는 것

- ✅ FastAPI 기본 골격, 라우터 4개(recommendations/listings/loans/chat) 스텁, 헬스체크
- ✅ SQLAlchemy 모델 4종 (User, Listing, HistoricalResult, LoanProduct) — 기획안 5장 데이터 스키마 반영
- ✅ 매칭 엔진 서비스 파일 3개 (자격필터/확률추정/대출매칭) — 함수 시그니처와 TODO만 있는 상태
- ✅ React + Redux Toolkit 기본 골격, 화면 4개 라우트(입력폼/대시보드/상세/대출시뮬레이션) 자리만 잡음
- ⬜ 청약홈 공공데이터 API 실제 연동 (`app/data_pipeline/applyhome_client.py`에 TODO)
- ⬜ 실제 DB 마이그레이션(Alembic) 설정
- ⬜ 인증/로그인
- ⬜ 스타일링, 실제 화면 디자인

로드맵 1단계(자격 필터링 + 가점 계산기)부터 채워나가면 됩니다.
