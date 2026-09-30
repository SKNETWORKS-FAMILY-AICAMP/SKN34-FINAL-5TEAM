"""데이터 수집 스케줄러 (기획안 6장 ① 데이터 수집 계층).

FastAPI 서버가 켜져 있는 동안 매일 오전 6시(한국 시간)에 전체 수집을 한 번 실행한다
(main.py의 lifespan에서 시작·종료). 청약홈·LH·SH·파인 전체 + 가공 레이어 갱신까지 약 3분.
서버가 꺼져 있던 날은 실행되지 않으므로, 필요하면 터미널에서 python -m app.data_pipeline.save_listings 를 실행한다.
"""

from apscheduler.schedulers.background import BackgroundScheduler

from app.data_pipeline.save_listings import collect_all

scheduler = BackgroundScheduler(timezone="Asia/Seoul")


def start_scheduler():
    if scheduler.running:
        return
    scheduler.add_job(collect_all, "cron", hour=6, minute=0, id="daily_collect", replace_existing=True)
    scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
