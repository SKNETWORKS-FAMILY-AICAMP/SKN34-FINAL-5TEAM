"""데이터 수집 스케줄러 (기획안 6장 ① 데이터 수집 계층).

APScheduler로 청약홈 API를 주기적으로 폴링해서, 새로 올라온 공고가 있으면
자동으로 DB에 반영(upsert)한다. FastAPI 서버가 켜져 있는 동안만 동작한다
(main.py의 lifespan에서 start_scheduler()를 호출해서 같이 띄움).
"""

from apscheduler.schedulers.background import BackgroundScheduler

from app.data_pipeline.applyhome_client import fetch_all_house_types, save_listings

scheduler = BackgroundScheduler()


def sync_listings_job():
    """청약홈 최신 공고를 가져와서 DB에 upsert.

    save_listings()가 external_id + unit_type 기준으로 이미 있으면 갱신,
    없으면 새로 추가하기 때문에, 이 job을 반복 실행해도 중복 저장되지 않는다.
    """
    try:
        listings = fetch_all_house_types()
        saved = save_listings(listings)
        print(f"[scheduler] {len(listings)}건 조회 → {saved}건 저장/갱신 완료.")
    except Exception as exc:
        print(f"[scheduler] 동기화 실패: {exc}")


def start_scheduler():
    scheduler.add_job(sync_listings_job, "interval", hours=6, id="sync_listings")
    scheduler.start()
    print("[scheduler] 6시간마다 청약홈 공고를 자동 동기화합니다.")
