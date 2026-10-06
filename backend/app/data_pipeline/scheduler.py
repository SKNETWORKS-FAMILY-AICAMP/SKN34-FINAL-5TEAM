"""데이터 수집 스케줄러 (기획안 6장 ① 데이터 수집 계층).

FastAPI 서버가 켜져 있는 동안 매일 오전 6시(한국 시간)에 전체 수집을 한 번 실행한다
(main.py의 lifespan에서 시작·종료). 오전 6시에 PC가 꺼져 있었다면 켜진 뒤 한 번 보충한다.

  - 절전에서 깨어난 경우: 서버가 멈춰 있다가 그대로 이어지므로, 놓친 6시 작업을 바로 실행한다
    (misfire_grace_time=None — 아무리 늦어도 실행, coalesce=True — 며칠 놓쳤어도 한 번만).
  - PC를 껐다 켠 경우: 서버가 새로 시작해 놓친 작업을 모르므로, 시작할 때 collect_runs를 보고
    "가장 최근 오전 6시 이후 수집 기록이 없으면" 1분 뒤에 보충 수집을 한다.
같은 시각에 두 번 돌지 않도록, 이미 수집 중이면(이 서버든 다른 터미널이든) 건너뛴다.
"""

import threading
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

from app.data_pipeline.save_listings import collect_all, init_tables
from app.db.session import SessionLocal
from app.models.notice_sources import CollectRun

KST = ZoneInfo("Asia/Seoul")
DAILY_HOUR = 6
CATCH_UP_DELAY = timedelta(minutes=1)  # 서버가 다 뜬 뒤에 시작
RUNNING_TIMEOUT = timedelta(hours=3)  # 이보다 오래된 running 기록은 중간에 꺼진 것으로 본다

scheduler = BackgroundScheduler(timezone=KST)
_lock = threading.Lock()


def last_scheduled_time(now: datetime) -> datetime:
    """now 기준 가장 최근의 오전 6시 (지금이 6시 전이면 어제 6시)."""
    today = now.replace(hour=DAILY_HOUR, minute=0, second=0, microsecond=0)
    return today if now >= today else today - timedelta(days=1)


def catch_up_needed(now: datetime, runs: list[tuple[datetime, str]]) -> bool:
    """runs = [(시작 시각, status)]. 가장 최근 6시 이후 끝난 수집도, 지금 진행 중인 수집도 없으면 True."""
    since = last_scheduled_time(now)
    for started_at, status in runs:
        if status == "done" and started_at >= since:
            return False
        if status == "running" and now - started_at < RUNNING_TIMEOUT:
            return False
    return True


def _recent_runs(now: datetime) -> list[tuple[datetime, str]]:
    with SessionLocal() as db:
        rows = db.execute(select(CollectRun.started_at, CollectRun.status)
                          .where(CollectRun.started_at >= now - timedelta(days=2))).all()
    return [(started_at.astimezone(KST), status) for started_at, status in rows]


def _collect(trigger: str) -> None:
    """수집 1회. 이 서버에서 이미 도는 중이거나 다른 곳(터미널 수동 실행 등)에서 도는 중이면 건너뛴다."""
    if not _lock.acquire(blocking=False):
        print(f"[스케줄러] {trigger}: 이미 수집 중이라 건너뜁니다.", flush=True)
        return
    try:
        now = datetime.now(KST)
        running = [s for s, status in _recent_runs(now) if status == "running" and now - s < RUNNING_TIMEOUT]
        if running:
            print(f"[스케줄러] {trigger}: 다른 곳에서 수집 중({running[0]:%H:%M} 시작)이라 건너뜁니다.", flush=True)
            return
        print(f"[스케줄러] {trigger} 시작", flush=True)
        collect_all(trigger=trigger)
    finally:
        _lock.release()


def _daily_job() -> None:
    now = datetime.now(KST)
    late = now - last_scheduled_time(now)
    # 6시 정각 실행이면 "정기", 절전 등으로 늦게 실행되면 "놓친 수집 보충"
    _collect("정기(오전 6시)" if late < timedelta(minutes=10) else f"놓친 수집 보충(절전 후, {late.seconds // 60}분 늦음)")


def start_scheduler():
    if scheduler.running:
        return
    scheduler.add_job(_daily_job, "cron", hour=DAILY_HOUR, minute=0, id="daily_collect", replace_existing=True,
                      misfire_grace_time=None, coalesce=True, max_instances=1)
    scheduler.start()
    try:
        init_tables()  # collect_runs 테이블이 없을 수 있음 (처음 실행)
        now = datetime.now(KST)
        if catch_up_needed(now, _recent_runs(now)):
            run_at = now + CATCH_UP_DELAY
            scheduler.add_job(_collect, "date", run_date=run_at, args=["놓친 수집 보충(서버 시작 시)"],
                              id="catch_up_collect", replace_existing=True)
            print(f"[스케줄러] {last_scheduled_time(now):%m-%d %H:%M} 이후 수집 기록이 없어 "
                  f"{run_at:%H:%M}에 보충 수집합니다.", flush=True)
    except Exception as exc:  # noqa: BLE001 — DB가 아직 안 떠 있어도 서버는 켜지도록
        print(f"[스케줄러] 보충 수집 확인 실패: {exc.__class__.__name__} {exc}", flush=True)


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
