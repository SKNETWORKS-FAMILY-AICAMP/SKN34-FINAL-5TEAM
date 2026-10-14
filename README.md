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

기본 프론트는 공유한 **청약돼?! 전체 데모 UI**입니다. 첫 화면, 진단, 집 찾기,
금융 정보, 지역·연합 커뮤니티와 내 공간을 같은 디자인으로 체험할 수 있습니다.
데모 자산은 `frontend/public/prototype/`에 포함되어 있으며 외부 Sites 배포에 의존하지 않습니다.
공고·상품·AI 답변은 예시 데이터이고 입력·저장은 현재 브라우저 안에서만 동작합니다.
기존 백엔드 API 연동 화면은 `http://localhost:3000/legacy/`에서 확인합니다.

### 3. 한 번에 실행 (Docker)
```bash
docker compose up --build
```

## 지금 여기까지 되어 있는 것 / 아직 안 되어 있는 것

진행 상태와 API 표는 `docs/요구사항_정의서.md`, `docs/프론트_API_연동표.md` 를 본다.

- 됨: 수집 코드, 사용자·공고·추천·대출 API, 계약금 10% 가정치, D-day, 준비 서류, 공고 질문 분류·검색
- 안 됨: Docker가 꺼져 있으면 로컬 listings 확인 불가, 클라우드 배포, 단지별 실제 계약금 PDF, LangGraph
