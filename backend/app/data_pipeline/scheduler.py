"""데이터 수집 스케줄러 (기획안 6장 ① 데이터 수집 계층).

APScheduler로 청약홈 API를 주기적으로 폴링해서, 새로 올라온 공고가 있으면
자동으로 DB에 반영(upsert)한다. FastAPI 서버가 켜져 있는 동안만 동작한다
(main.py의 lifespan에서 start_scheduler()를 호출해서 같이 띄움).
"""

from apscheduler.schedulers.background import BackgroundScheduler

from app.data_pipeline.applyhome_client import fetch_all_house_types, save_listings
from app.data_pipeline.notice_parser import sync_missing_deposits
from app.data_pipeline.other_ingest import sync_other_sources

scheduler = BackgroundScheduler()


def sync_listings_job():
    """청약홈 최신 공고 + LH·대출·SH를 한 바퀴 돌린다."""
    try:
        listings = fetch_all_house_types()
        saved = save_listings(listings)
        print(f"[scheduler] 청약홈 {len(listings)}건 조회 → {saved}건 저장/갱신.", flush=True)
    except Exception as exc:
        print(f"[scheduler] 청약홈 동기화 실패: {exc}", flush=True)

    try:
        sync_other_sources()
        print("[scheduler] LH·대출·SH 동기화 완료.", flush=True)
    except Exception as exc:
        print(f"[scheduler] LH·대출·SH 동기화 실패: {exc}", flush=True)

    try:
        updated = sync_missing_deposits()
        print(f"[scheduler] 계약금 숫자를 읽은 공고 행 {updated}건.", flush=True)
    except Exception as exc:
        print(f"[scheduler] 계약금 공고문 읽기 실패: {exc}", flush=True)


def start_scheduler():
    if scheduler.running:
        return
    scheduler.add_job(sync_listings_job, "interval", hours=6, id="sync_listings", replace_existing=True)
    scheduler.start()
    print("[scheduler] 6시간마다 청약홈·LH·대출·SH를 자동 동기화합니다.", flush=True)


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
