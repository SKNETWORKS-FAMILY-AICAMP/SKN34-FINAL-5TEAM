from app.data_pipeline.notice_parser import find_notice_files, parse_deposit_text


def test_percent_is_rate_and_first_payment_is_not_total():
    facts = parse_deposit_text("계약금 5% (1차 계약금 500만원)\n중도금 60%")
    assert facts is not None
    assert facts.rate == 0.05
    assert facts.amount_won is None
    assert facts.status is None

    separate = parse_deposit_text("계약금 5%\n1차 계약금 500만원")
    assert separate is not None
    assert separate.rate == 0.05
    assert separate.amount_won is None


def test_won_amount_is_stored_as_total():
    facts = parse_deposit_text("계약금 45,000,000원")
    assert facts is not None
    assert facts.amount_won == 45_000_000
    assert facts.rate is None


def test_later_notice_has_no_amount():
    facts = parse_deposit_text("계약금 추후공지")
    assert facts is not None
    assert facts.status == "later"
    assert facts.rate is None
    assert facts.amount_won is None


def test_missing_number_is_none_status():
    facts = parse_deposit_text("계약금은 계약 체결 시 납부합니다.")
    assert facts is not None
    assert facts.status == "none"


def test_find_notice_file_link():
    html = '<a href="/files/notice.pdf">모집공고</a><a href="/about">소개</a>'
    assert find_notice_files(html, "https://www.applyhome.co.kr/detail") == [
        "https://www.applyhome.co.kr/files/notice.pdf"
    ]
