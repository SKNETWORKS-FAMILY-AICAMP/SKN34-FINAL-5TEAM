"""매일 오전 6시 수집 + 놓친 수집 보충 판단 테스트."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.data_pipeline.scheduler import catch_up_needed, last_scheduled_time

KST = ZoneInfo("Asia/Seoul")


def at(day, hour, minute=0):
    return datetime(2026, 10, day, hour, minute, tzinfo=KST)


def test_last_scheduled_time():
    assert last_scheduled_time(at(6, 11, 5)) == at(6, 6)  # 6시 이후면 오늘 6시
    assert last_scheduled_time(at(6, 5, 59)) == at(5, 6)  # 6시 전이면 어제 6시


def test_catch_up_when_pc_was_off_at_six():
    # 10/02 이후 기록이 없고 10/06 11:05에 켬 → 보충
    assert catch_up_needed(at(6, 11, 5), [(at(2, 6), "done")])
    assert catch_up_needed(at(6, 11, 5), [])


def test_no_catch_up_when_already_collected_today():
    assert not catch_up_needed(at(6, 11, 5), [(at(6, 6), "done")])
    # 수동으로 아침 9시에 돌린 것도 오늘 수집으로 친다
    assert not catch_up_needed(at(6, 11, 5), [(at(6, 9), "done")])
    # 새벽 3시에 켰을 때는 어제 6시 이후 기록이 있으면 충분
    assert not catch_up_needed(at(6, 3), [(at(5, 6), "done")])


def test_running_collection_blocks_catch_up_until_timeout():
    assert not catch_up_needed(at(6, 7), [(at(6, 6), "running")])
    # 3시간 넘게 running이면 중간에 꺼진 것 → 보충
    assert catch_up_needed(at(6, 10), [(at(6, 6) , "running")])
    assert catch_up_needed(at(6, 6) + timedelta(hours=3, minutes=1), [(at(6, 6), "running")])
