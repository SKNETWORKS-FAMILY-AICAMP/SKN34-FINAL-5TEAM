from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import chat, commute, listings, loans, recommendations, users
from app.data_pipeline.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="청약 전략 플랫폼 API",
    description="청약홈 + 내집다오 통합 추천 서비스 백엔드",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recommendations.router)
app.include_router(users.router)
app.include_router(listings.router)
app.include_router(loans.router)
app.include_router(chat.router)
app.include_router(commute.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
