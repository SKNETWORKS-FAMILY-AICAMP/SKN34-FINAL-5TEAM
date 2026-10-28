import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, chat, commute, community, diagnoses, listings, loans, public_config, recommendations, savings, translate, users
from app.core.config import settings
from app.core.errors import install_error_handling
from app.core.logging_setup import setup_logging
from app.data_pipeline.scheduler import start_scheduler, stop_scheduler
from app.services import cutoff_model
from app.services.embedder import warm_up
from app.services.vector_store import get_store

setup_logging(settings.log_level)
logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("서버 시작 (환경: %s)", settings.app_env)
    if not cutoff_model.MODEL_PATH.exists():
        # 앱은 정상 동작한다. 기준 커트라인을 모델 대신 예전 3년 평균으로 계산할 뿐이다
        logger.warning("커트라인 모델 파일이 없어 3년 평균 방식을 씁니다. python -m scripts.train_cutoff_model 로 만드세요.")
    if get_store() is not None:
        # 공고문 벡터 DB가 있으면 임베딩 모델을 미리 올린다. 서버 시작을 막지 않도록 백그라운드에서 한다
        threading.Thread(target=warm_up, name="embedder-warm-up", daemon=True).start()
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

app.add_middleware(
    CORSMiddleware,
    # 배포하면 .env의 CORS_ORIGINS에 프론트 주소를 넣는다 (쉼표로 구분)
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(recommendations.router)
app.include_router(users.router)
app.include_router(diagnoses.router)
app.include_router(listings.router)
app.include_router(loans.router)
app.include_router(chat.router)
app.include_router(commute.router)
app.include_router(public_config.router)
app.include_router(community.router)
app.include_router(savings.router)
app.include_router(translate.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
