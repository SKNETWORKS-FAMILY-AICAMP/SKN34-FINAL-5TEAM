"""요청 번호·접근 로그·예외 처리.

- 모든 응답에 X-Request-ID 헤더를 붙이고, 같은 번호를 로그 줄마다 남긴다.
- 처리되지 않은 오류는 서버 로그에 상세(스택)를 남기고, 사용자에게는 내부 정보 없이 요청 번호만 돌려준다.
- DB에 연결하지 못하면 500이 아니라 503(잠시 후 다시 시도)으로 알린다.
"""

import logging
import re
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError

from app.core.logging_setup import request_id_var

error_log = logging.getLogger("app.error")
access_log = logging.getLogger("app.access")

# 밖에서 들어온 요청 번호는 이 모양일 때만 믿는다 (줄바꿈 등으로 로그를 위조하지 못하게)
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def _new_request_id(request: Request) -> str:
    incoming = request.headers.get("X-Request-ID", "")
    return incoming if _SAFE_REQUEST_ID.match(incoming) else uuid.uuid4().hex[:12]


def install_error_handling(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = _new_request_id(request)
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        try:
            try:
                response = await call_next(request)
            except Exception:  # noqa: BLE001 — 어떤 오류든 내부 정보 없이 500으로 바꿔 돌려준다
                error_log.exception("처리되지 않은 오류 %s %s", request.method, request.url.path)
                response = JSONResponse(
                    status_code=500,
                    content={"detail": "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", "request_id": request_id},
                )
            response.headers["X-Request-ID"] = request_id
            elapsed_ms = (time.perf_counter() - started) * 1000
            # 경로만 남긴다. 쿼리 문자열에는 개인정보가 있을 수 있다
            access_log.log(
                logging.WARNING if response.status_code >= 500 else logging.INFO,
                "%s %s %s %.0fms", request.method, request.url.path, response.status_code, elapsed_ms,
            )
            return response
        finally:
            request_id_var.reset(token)

    @app.exception_handler(OperationalError)
    async def database_unavailable(request: Request, exc: OperationalError):
        # DB가 꺼져 있거나 연결이 끊긴 경우. 접속 정보가 담긴 원문 오류는 사용자에게 보내지 않는다
        error_log.error("DB 연결 오류 %s %s: %s", request.method, request.url.path, exc.__class__.__name__)
        return JSONResponse(
            status_code=503,
            content={"detail": "데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
                     "request_id": request_id_var.get()},
        )
