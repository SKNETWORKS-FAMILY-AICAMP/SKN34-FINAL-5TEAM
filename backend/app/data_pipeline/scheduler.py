"""데이터 수집 스케줄러 (기획안 6장 ① 데이터 수집 계층).

FastAPI 서버가 켜져 있는 동안 APScheduler로 주기적으로 수집한다 (main.py의 lifespan에서 시작·종료).
  - 6시간마다: 최근 공고 (청약홈 최근 90일 + LH + SH)
  - 24시간마다: 경쟁률·당첨가점·특별공급 전체 + 대출 상품
처음 한 번 전체를 채울 때는 터미널에서 python -m app.data_pipeline.save_listings 를 실행한다.
"""

from apscheduler.schedulers.background import BackgroundScheduler

from app.data_pipeline.save_listings import collect_recent, collect_results_and_loans

scheduler = BackgroundScheduler()


def start_scheduler():
    if scheduler.running:
        return
    scheduler.add_job(collect_recent, "interval", hours=6, id="sync_listings", replace_existing=True)
    scheduler.add_job(collect_results_and_loans, "interval", hours=24, id="sync_results_loans", replace_existing=True)
    scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
