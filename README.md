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

## 지금 여기까지 되어 있는 것 / 아직 안 되어 있는 것

진행 상태와 API 표는 `docs/요구사항_정의서.md`, `docs/프론트_API_연동표.md` 를 본다.

- 됨: 수집 코드, 사용자·공고·추천·대출 API, 계약금 10% 가정치, D-day, 준비 서류, 공고 질문 분류·검색
- 안 됨: Docker가 꺼져 있으면 로컬 listings 확인 불가, 클라우드 배포, 단지별 실제 계약금 PDF, LangGraph
