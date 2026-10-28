import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import install_error_handling
from app.core.logging_setup import setup_logging
from app.data_pipeline.scheduler import start_scheduler, stop_scheduler

setup_logging(settings.log_level)
logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("서버 시작 (환경: %s)", settings.app_env)
    start_scheduler()
    yield
    stop_scheduler()
    logger.info("서버 종료")


app = FastAPI(
    title="청약 전략 플랫폼 API",
    description="청약홈 + 내집다오 통합 추천 서비스 백엔드",
    version="0.1.0",
    lifespan=lifespan,
)

install_error_handling(app)

# 2주차(10/30) 범위: 데이터 수집·DB 설계·실행 환경과 화면 설계까지.
# 추천·대출·진단 등 웹앱 API(3주차~), ML/DL(4주차), 벡터DB·RAG(4주차), LLM 에이전트(5주차)는 해당 주차에 추가한다.

app.add_middleware(
    CORSMiddleware,
    # 배포하면 .env의 CORS_ORIGINS에 프론트 주소를 넣는다 (쉼표로 구분)
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}
