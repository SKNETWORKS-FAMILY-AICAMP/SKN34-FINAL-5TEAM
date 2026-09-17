"""데이터 수집 스케줄러 (기획안 6장 ① 데이터 수집 계층).

APScheduler로 청약홈 API를 주기적으로 폴링한다.
FastAPI 앱 시작 시 이 스케줄러를 함께 띄우려면 main.py의 startup 이벤트에서 호출한다.
"""

from apscheduler.schedulers.background import BackgroundScheduler

from app.data_pipeline.applyhome_client import fetch_new_listings

scheduler = BackgroundScheduler()


def sync_listings_job():
    """TODO: fetch_new_listings() 결과를 DB에 upsert하는 로직 작성."""
    listings = fetch_new_listings()
    print(f"[scheduler] {len(listings)}건의 공고 데이터를 가져왔습니다. (DB 저장 로직 TODO)")


def start_scheduler():
    scheduler.add_job(sync_listings_job, "interval", hours=6, id="sync_listings")
    scheduler.start()
