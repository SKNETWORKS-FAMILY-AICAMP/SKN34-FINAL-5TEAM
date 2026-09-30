"""공고문 계약금 추출 규칙 테스트. 예시 문장·표는 2026-10 실제 LH·청약홈 공고문에서 가져왔다."""

from app.data_pipeline.document_client import (
    fixed_amount,
    lh_document,
    listing_costs,
    match_entry,
    ratio_percent,
    table_entries,
)

# 국민임대 임대조건 표 (원 단위): 주택형 / 계 / 계약금(5%) / 잔금 / 월임대료
RENT_TABLE_WON = """임대조건 주 전환가능 단지명 택 임대보증금(원) 보증금 월임대료
계 계약금 잔금 (원) (원) (+) 16,000,000 38,420,000 67,130
원주문막1 46A 22,420,000 1,121,000 21,299,000 67,130
원주문막1 51일반 17,327,000 866,350 16,460,650 94,990"""

# 양산 삼성파크빌 국민임대 (천원 단위): 계 18,551 = 계약금 500 + 잔금 18,051
RENT_TABLE_THOUSAND = "(단위:천원)\n삼성파크빌 55 18,551 500 18,051 114,150 4,551 154,980 28,551 64,150"

# 분양 공급가격 표: 계약금 + 잔금이 주택가격과 같지 않으므로(융자금 별도) 표 규칙에 걸리면 안 된다
SALE_TABLE = "A-1 055.8300A 55A 1층 261,270 26,127 180,143 55,000"


def test_table_entries_won_unit():
    entries = table_entries(RENT_TABLE_WON)
    assert [(e["label"], e["contract"], e["total"]) for e in entries] == [
        ("46A", 1_121_000, 22_420_000),
        ("51일반", 866_350, 17_327_000),
    ]


def test_table_entries_thousand_unit_scaled_to_won():
    (entry,) = table_entries(RENT_TABLE_THOUSAND)
    assert entry["label"] == "55"
    assert entry["contract"] == 500_000
    assert entry["total"] == 18_551_000
    assert entry["balance"] == 18_051_000


def test_table_entries_ignores_sale_price_rows():
    assert table_entries(SALE_TABLE) == []


def test_table_entries_ignores_household_counts():
    # 세대수 표: 계 3 = 1 + 2 는 금액이 아니다
    assert table_entries("39(주거약자) 3 1 2\n40.6561 20 1 19") == []


def test_fixed_amount():
    assert fixed_amount("선착순 동호지정 및 계약 (계약금 1,000만원 정액제)") == 10_000_000
    assert fixed_amount("안내받은 계좌번호에 계약금(50만원) 입금") == 500_000
    assert fixed_amount("감리금액(계약금액 기준)") is None


def test_ratio_percent():
    assert ratio_percent("주택가격 계약금 (10%) 입주잔금 (90%)") == 10
    assert ratio_percent("임대보증금 합계 계약금(20%) 잔금(80%)") == 20
    assert ratio_percent("계약금 납부 후 계약체결") is None


def test_match_entry_by_exact_label_then_area_number():
    entries = table_entries(RENT_TABLE_WON)
    assert match_entry("46A", entries)["contract"] == 1_121_000
    assert match_entry("51", entries)["contract"] == 866_350
    assert match_entry("084.9972A", entries) is None


def test_listing_costs_priority_table_over_fixed_and_ratio():
    text = RENT_TABLE_WON + "\n계약금(20%) 계약금 100만원"
    listings = [
        {"source": "lh", "external_id": "1", "model_no": "01-001", "unit_type": "46", "sale_price": None, "rent_deposit": None},
        {"source": "lh", "external_id": "1", "model_no": "01-002", "unit_type": "39", "sale_price": None, "rent_deposit": None},
    ]
    matched, fallback = listing_costs(text, listings)
    assert (matched["method"], matched["contract_deposit"]) == ("공고문 표", 1_121_000)
    assert (fallback["method"], fallback["contract_deposit"]) == ("공고문 표·최솟값", 866_350)


def test_listing_costs_ratio_uses_sale_price_and_skips_unknown():
    listings = [
        {"source": "applyhome", "external_id": "2", "model_no": "01", "unit_type": "084.9972A", "sale_price": 356_990_000, "rent_deposit": None},
        {"source": "applyhome", "external_id": "2", "model_no": "02", "unit_type": "059A", "sale_price": None, "rent_deposit": None},
    ]
    costs = listing_costs("주택가격 계약금 (10%) 입주잔금 (90%)", listings)
    assert costs == [{
        "source": "applyhome", "external_id": "2", "model_no": "01", "contract_deposit": 35_699_000,
        "contract_ratio": 10.0, "deposit_total": None, "balance": None, "method": "공고문 비율", "doc_label": None,
    }]


def test_lh_document_prefers_notice_pdf():
    detail = {"dsAhflInfo": [
        {"CMN_AHFL_NM": "[팸플릿]인천석남_행복주택.pdf", "AHFL_URL": "u1"},
        {"CMN_AHFL_NM": "공고문.hwpx", "AHFL_URL": "u2"},
        {"CMN_AHFL_NM": "[공고문]인천석남_행복주택_입주자모집.pdf", "AHFL_URL": "u3"},
    ]}
    assert lh_document(detail) == ("[공고문]인천석남_행복주택_입주자모집.pdf", "u3")
    assert lh_document({"dsAhflInfo": [{"CMN_AHFL_NM": "공고문.hwp", "AHFL_URL": "u"}]}) == (None, None)


def test_receipt_period():
    from datetime import date

    from app.data_pipeline.document_client import receipt_period

    assert receipt_period("우편접수 진행 - 접수기간: 2026. 10. 2.(목) ~ 10. 8.(수)") == (date(2026, 10, 2), date(2026, 10, 8))
    assert receipt_period("청약접수 2026.09.28 ∼ 2026.09.30") == (date(2026, 9, 28), date(2026, 9, 30))
    # 시각이 끼어 있어도 끝 날짜까지 읽는다 (SH 공고문)
    assert receipt_period("■ 접수일정 : 2026. 10. 13.(화) 10:00 ~ 10. 15.(목) 17:00 (3일간)") == (date(2026, 10, 13), date(2026, 10, 15))
    assert receipt_period("접수기간 ◻ 2026.10.1.(목)10:00~2026.10.2.(금)17:00") == (date(2026, 10, 1), date(2026, 10, 2))
    # 날짜 하나짜리 언급보다 기간이 있는 문장을 먼저 쓴다
    assert receipt_period("방문청약 접수 첫 날(2026.09.10.) 방문\n인터넷 청약 접수기간 2026. 9. 10.(목) 10:00 ~ 9. 12.(토)") == (date(2026, 9, 10), date(2026, 9, 12))
    assert receipt_period("신청일시 : 2026년 10월 12일(월) 10:00") == (date(2026, 10, 12), date(2026, 10, 12))
    # "신청자격 : 공고일 현재(2026. 9. 30.)"는 접수기간이 아니다
    assert receipt_period("신청자격 : 공고일 현재(2026. 9. 30.)") == (None, None)


def test_sh_document_and_recruitment_title():
    from app.data_pipeline.document_client import sh_document
    from app.data_pipeline.sh_client import is_recruitment

    links = [{"name": "주택목록(요약)_신혼Ⅱ.pdf", "url": "a"}, {"name": "[공고문_신혼2] 입주자 모집공고.hwp", "url": "b"},
             {"name": "[공고문_신혼2] 입주자 모집공고.pdf", "url": "c"}]
    assert sh_document(links) == ("[공고문_신혼2] 입주자 모집공고.pdf", "c")
    assert is_recruitment("2026년 하반기 신혼·신생아 매입임대주택Ⅱ 입주자 모집공고")
    assert not is_recruitment("2026년 2차 행복주택 입주자 모집 최종 청약 경쟁률 게시")
    assert not is_recruitment("청년 매입임대주택 예비자 공급 계약대상자 발표")
