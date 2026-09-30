"""데이터 수집 스케줄러 (기획안 6장 ① 데이터 수집 계층).

APScheduler로 청약홈 API를 주기적으로 폴링한다.
FastAPI 앱 시작 시 lifespan에서 start_scheduler를 호출한다.
"""

from apscheduler.schedulers.background import BackgroundScheduler

from app.data_pipeline.save_listings import save_all_sources

scheduler = BackgroundScheduler()


def sync_listings_job():
    save_all_sources(per_kind=20, include_other=True)
    print("[scheduler] 청약홈 최근 공고 + LH·대출·SH를 한 바퀴 돌렸습니다.", flush=True)


def start_scheduler():
    if scheduler.running:
        return
    scheduler.add_job(sync_listings_job, "interval", hours=6, id="sync_listings", replace_existing=True)
    scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
