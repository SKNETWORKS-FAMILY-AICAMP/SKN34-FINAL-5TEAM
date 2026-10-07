"""로그 설정. 모든 로그 줄에 요청 번호를 붙여서, 사용자가 본 오류를 서버 로그에서 바로 찾게 한다.

요청 본문·쿼리 문자열·질문 내용은 로그에 남기지 않는다 (이메일·소득·주소 같은 개인정보가 들어 있을 수 있다).
"""

import contextvars
import logging
import sys

# 지금 처리 중인 요청의 번호. 요청 밖(서버 시작, 스케줄러)에서는 "-"
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

_FORMAT = "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s"
_HANDLER_MARK = "_cheongyak_handler"


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def setup_logging(level: str = "INFO") -> None:
    """루트 로거에 한 번만 핸들러를 붙인다 (여러 번 불러도 중복 출력되지 않는다)."""
    root = logging.getLogger()
    root.setLevel(level.upper() if level.upper() in logging._nameToLevel else "INFO")
    # httpx는 INFO에서 요청 주소를 쿼리 문자열까지 그대로 찍는다. 공공데이터포털·카카오 호출은 인증키가
    # 주소에 들어가므로, 키가 로그에 남지 않도록 경고 이상만 보이게 한다
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if any(getattr(h, _HANDLER_MARK, False) for h in root.handlers):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT))
    handler.addFilter(RequestIdFilter())
    setattr(handler, _HANDLER_MARK, True)
    root.addHandler(handler)
