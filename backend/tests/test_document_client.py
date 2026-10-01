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

# 광주선운 신혼희망타운 공급가격 표 (천원): 주택가격 261,270 = 계약금 26,127 + 잔금 180,143 + 융자금 55,000
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


def test_table_entries_price_with_fund_loan():
    (entry,) = table_entries(SALE_TABLE)
    assert (entry["label"], entry["contract"], entry["total"]) == ("1층", 26_127_000, 261_270_000)


def test_table_entries_skip_option_price_lines():
    # 광주선운 옵션표: "거실+침실1 … 계약금 잔금"은 주택 계약금이 아니다
    assert table_entries("55A 거실+침실1 1,130 113 1,017\n침실2붙박이장 2,060 206 1,854") == []


def test_find_entry_by_area_in_line_and_type_letter():
    from app.data_pipeline.document_client import find_entry

    # 매각 표: 주택형 대신 계약면적(132.8905)이 표기로 잡히지만 같은 줄에 전용면적 84.9811이 있다
    sale = table_entries("1 104 503 110.8274 84.9811 25.8463 22.0631 132.8905 14,450,000 130,050,000 144,500,000\n"
                         "2 102 701 110.8458 84.9879 25.8579 22.065 132.9108 14,650,000 131,850,000 146,500,000")
    entry, method = find_entry("084.9879", 84.9879, sale)
    assert (method, entry["contract"]) == ("공고문 표(면적 일치)", 14_650_000)
    # 국민임대: API 주택형이 "4600"처럼 와도 전용면적 46.90의 정수 46 + 타입 문자 B로 46B 줄
    rent = table_entries("전주 46A 18,054,000 902,700 17,151,300\n전주 46B 19,122,000 956,100 18,165,900")
    entry, method = find_entry("46.90B", 46.9, rent)
    assert (method, entry["contract"]) == ("공고문 표", 956_100)
    entry, method = find_entry("4600", 46.22, rent)
    assert (method, entry["contract"]) == ("공고문 표(면적 일치)", 902_700)


def test_table_entries_ignores_household_counts():
    # 세대수 표: 계 3 = 1 + 2 는 금액이 아니다
    assert table_entries("39(주거약자) 3 1 2\n40.6561 20 1 19") == []


def test_table_entries_other_column_orders():
    # 목포 국민임대: 계약금 잔금 합계 순서
    (rent,) = table_entries("목포옥암1 51 1,229,000 23,366,000 24,595,000 163,110")
    assert (rent["label"], rent["contract"], rent["total"]) == ("51", 1_229_000, 24_595_000)
    # 양산 매각 붙임1: 계약금(10%) 잔금 총 주택가격
    (sale,) = table_entries("1 102 701 110.8458 84.9879 25.8579 22.065 132.9108 14,650,000 131,850,000 146,500,000")
    assert (sale["contract"], sale["total"]) == (14_650_000, 146_500_000)
    # 아산 오피스텔: 계약금 할부금 잔금 합계
    (installment,) = table_entries("33A 3~11층 13 5,000,000 14,260,000 77,040,000 96,300,000")
    assert (installment["contract"], installment["total"], installment["balance"]) == (5_000_000, 96_300_000, 91_300_000)


def test_table_entries_splits_glued_numbers():
    # 제주 행복주택 (두 단 편집 PDF, 천원 단위): "28,8661,443" = 계 28,866 + 계약금 1,443
    (entry,) = table_entries("대학생 28,8661,443 27,423 132,300")
    assert (entry["contract"], entry["total"]) == (1_443_000, 28_866_000)


def test_fixed_amount():
    assert fixed_amount("선착순 동호지정 및 계약 (계약금 1,000만원 정액제)") == 10_000_000
    assert fixed_amount("안내받은 계좌번호에 계약금(50만원) 입금") == 500_000
    assert fixed_amount("감리금액(계약금액 기준)") is None
    assert fixed_amount("계약시 계약금[주택가격(1천만원)] → 입주시 입주잔금") == 10_000_000
    # 원주무실 공공분양: 주택 계약금은 10%이고 1백만원은 발코니 확장 계약금
    assert fixed_amount("※ 주택공급금액의 10% + 발코니확장비용 계약금(1백만원) + 추가선택품목 계약금 10% 입금") is None
    assert fixed_amount("아산배방LH4단지오피스텔잔여세대선착순동호지정공고(계약금500만원,3년무이자할부).pdf") == 5_000_000


def test_fallback_cost():
    from app.data_pipeline.document_client import fallback_cost

    def row(supply, name="", sale_price=None):
        return {"source": "lh", "external_id": "1", "model_no": None, "supply_type": supply,
                "complex_name": name, "sale_price": sale_price}

    youth = fallback_cost(row("전세임대"), "■ 기본임대조건(입주자부담)\n- 임대보증금 : 100만원\n- 월 임대료 : …")
    assert (youth["method"], youth["contract_deposit"]) == ("공고문 본인부담 보증금", 1_000_000)
    family = fallback_cost(row("전세임대"), "■ 기본임대조건(입주자부담)\n7. 지원대상\n- 임대보증금 : 지원한도액 범위 내 전세보증금의 2%")
    assert (family["method"], family["contract_deposit"], family["contract_ratio"]) == ("주택 선택 후 결정", None, 2)
    # SH 주택목록(상세): "… 일반형 재공급 19,530,000 2 54,400 32,560,000 …" (임대료 칸이 쪼개져 나와도 보증금만 읽음)
    sh_list = "1 강동구 서도휴빌 42C … 0201 44.42 2 일반형 재공급 19,530,000 2 54,400 32,560,000 424,100\n" \
              "2 강동구 서도휴빌 47C … 0303 45.75 2 일반형 신규 20,320,000 2 64,700 33,870,000 441,300"
    sh = fallback_cost(row("SH 임대", "신혼·신생아 매입임대주택Ⅰ 입주자 모집공고"), sh_list)
    assert (sh["method"], sh["contract_deposit"]) == ("공고문 보증금 최솟값", 19_530_000)
    dorm = fallback_cost(row("SH 임대"), "13형 13.25 1,090,000 110,000~111,100\n갈현공공기숙사 18형 18.04 1,090,000 150,000")
    assert dorm["contract_deposit"] == 1_090_000
    reserve = fallback_cost(row("매입임대"), "예비입주자 모집공고 (주택별 임대조건은 계약 시 안내)")
    assert (reserve["method"], reserve["contract_deposit"]) == ("배정 시 안내", None)
    assert fallback_cost(row("국민임대"), "임대조건 표 없음") is None


def test_ratio_percent():
    assert ratio_percent("주택가격 계약금 (10%) 입주잔금 (90%)") == 10
    assert ratio_percent("임대보증금 합계 계약금(20%) 잔금(80%)") == 20
    assert ratio_percent("계약금 납부 후 계약체결") is None


def test_match_entry_by_exact_label_then_area_number():
    entries = table_entries(RENT_TABLE_WON)
    assert match_entry("46A", entries)["contract"] == 1_121_000
    assert match_entry("51", entries)["contract"] == 866_350
    assert match_entry("084.9972A", entries) is None


def test_listing_costs_priority():
    # 우선순위: 주택형이 맞는 표 > 정액 > 주택형을 못 맞춘 표의 최솟값 > 비율
    listings = [
        {"source": "lh", "external_id": "1", "model_no": "01-001", "unit_type": "46", "sale_price": None, "rent_deposit": None},
        {"source": "lh", "external_id": "1", "model_no": "01-002", "unit_type": "39", "sale_price": None, "rent_deposit": None},
    ]
    matched, fixed = listing_costs(RENT_TABLE_WON + "\n계약금(20%) 계약금 100만원", listings)
    assert (matched["method"], matched["contract_deposit"]) == ("공고문 표", 1_121_000)
    assert (fixed["method"], fixed["contract_deposit"]) == ("공고문 정액", 1_000_000)
    _, lowest = listing_costs(RENT_TABLE_WON + "\n계약금(20%)", listings)
    assert (lowest["method"], lowest["contract_deposit"]) == ("공고문 표·최솟값", 866_350)


def test_listing_costs_sale_rows_need_table_total_near_price():
    # 충정로역자이르네: 계약금 잔금 계 모양이지만 계 2.29억은 분양가 24.3억과 무관한 표 → 비율 규칙으로
    # 리아츠 더 인천: 분양가 = 대지비 195,219,000 + 건축비 → 계약금이 분양가의 36%일 수는 없음
    text = ("5,000,000 178,700,000 228,700,000\n계약금 (10%) 입주잔금 (90%)\n84B 244,350,000 24,435,000 219,915,000\n"
            "84B 545,000,000 195,219,000 349,781,000")
    rows = [{"source": "applyhome", "external_id": "3", "model_no": "01", "unit_type": "084.9972A",
             "sale_price": 2_433_000_000, "rent_deposit": None},
            {"source": "applyhome", "external_id": "3", "model_no": "02", "unit_type": "084.9965B",
             "sale_price": 244_350_000, "rent_deposit": None}]
    far, near = listing_costs(text, rows)
    assert (far["method"], far["contract_deposit"]) == ("공고문 비율", 243_300_000)
    assert (near["method"], near["contract_deposit"]) == ("공고문 표", 24_435_000)


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
