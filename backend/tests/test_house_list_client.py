"""LH 주택목록 엑셀 읽기·연결 테스트. 표 모양은 2026-10 실제 LH 매입임대 주택목록에서 가져왔다."""

import io

import openpyxl

from app.data_pipeline.house_list_client import house_costs, house_list_files, read_house_list


def _xlsx(rows: list[list]) -> bytes:
    workbook = openpyxl.Workbook()
    for row in rows:
        workbook.active.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


# 경남 일반매입임대: 헤더 2줄, 윗줄 "면적(㎡)"·"임대조건(원)"이 병합 셀
GYEONGNAM = _xlsx([
    ["공급대상주택"],
    ["* 계약시점에 따라 임대조건이 변경될 수 있습니다."],
    ["순번", "지자체명", "도로명주소", "동번호", "호", "주택형", "층수", "방수", "면적(㎡)", None, "임대조건(원)", None, None, None],
    [None, None, None, None, None, None, None, None, "전용", "공용", "보증금", "임대료", "무보증월세여부", "무보증전환임대료"],
    [1, "매입다가구(경남 김해시)", "경상남도 김해시 평전로150번길 6(내동) 평전빌", "100", "204", "단독(1인)", "2층", "1",
     18.68, 21.18, 2047000, 21030, "Y", 42000],
    [2, "매입다가구(경남 김해시)", "경상남도 김해시 구지로211번길 17-15(동상동) 시티뷰 A동", "2302", "202", "1형", "2층", "1",
     34.94, 4.27, 2179000, 41820, "Y", 63170],
])

# 인천 다자녀: 자격별 보증금·임대료가 두 쌍 (수급자 / 소득70%이하)
INCHEON = _xlsx([
    ["순번", "모집단위", "주소", None, None, "주택정보", None, None, None, None, None, "다자녀 수급자", None, None,
     "다자녀 소득70%이하", None, None],
    [None, None, "도로명주소", "지번", "호", "전용\n면적", "주거공용\n면적", "면적계", "방수", "승강기\n유무", "주택유형",
     "임대보증금", "월임대료", "증액전환시\n하한기준액", "임대보증금", "월임대료", "증액전환시\n하한기준액"],
    [1, "26-4 제물포구(제이빌)", "인천광역시 제물포구 제물량로113번길 16(신흥동1가) 제이빌", "신흥동1가 38-28", "201",
     84.03, 19.87, 103.9, "3", "Y", "다가구주택", 11210000, 304640, 121850, 12000000, 422250, 168900],
])


def test_read_house_list_two_row_header():
    first, second = read_house_list(GYEONGNAM)
    assert first["address"] == "경상남도 김해시 평전로150번길 6(내동) 평전빌"
    assert (first["dong"], first["ho"], first["house_label"]) == ("100", "204", "단독(1인)")
    assert (first["exclusive_area_sqm"], first["common_area_sqm"]) == (18.68, 21.18)
    # "무보증전환임대료"는 월임대료가 아니다
    assert (first["rent_deposit"], first["monthly_rent"]) == (2_047_000, 21_030)
    assert second["house_label"] == "1형"


def test_read_house_list_condition_groups_use_cheapest():
    (house,) = read_house_list(INCHEON)
    assert house["address"].startswith("인천광역시 제물포구 제물량로113번길 16")  # 지번 주소가 아니라 도로명 주소
    assert house["ho"] == "201"
    assert house["conditions"] == [
        {"group": "다자녀 수급자", "deposit": 11_210_000, "rent": 304_640},
        {"group": "다자녀 소득70%이하", "deposit": 12_000_000, "rent": 422_250},
    ]
    assert (house["rent_deposit"], house["monthly_rent"], house["condition_group"]) == (11_210_000, 304_640, "다자녀 수급자")


def test_house_list_files_picks_excel_house_lists():
    detail = {"dsAhflInfo": [
        {"CMN_AHFL_NM": "(경남지역본부)일반매입임대입주자모집공고문.pdf", "AHFL_URL": "a"},
        {"CMN_AHFL_NM": "(경남지역본부)일반매입임대주택공급대상주택목록.xlsx", "AHFL_URL": "b"},
        {"CMN_AHFL_NM": "신청서양식.xlsx", "AHFL_URL": "c"},
    ]}
    assert house_list_files(detail) == [("(경남지역본부)일반매입임대주택공급대상주택목록.xlsx", "b")]


def test_house_costs_matching_order():
    houses = [
        {"address": "경기도 동두천시 강변로336번길 18-5(생연동) 성운빌라", "ho": "502", "house_label": "2형",
         "exclusive_area_sqm": 55.77, "rent_deposit": 3_455_000, "condition_group": None},
        {"address": "경기도 김포시 봉화로 164-2(북변동) MU빌리지", "ho": "403", "house_label": "2형",
         "exclusive_area_sqm": 70.23, "rent_deposit": 6_754_000, "condition_group": None},
        {"address": "경기도 김포시 봉화로 170(북변동) 가나빌", "ho": "101", "house_label": "1형",
         "exclusive_area_sqm": 30.0, "rent_deposit": 900_000, "condition_group": None},
    ]
    base = {"source": "lh", "external_id": "1"}
    listings = [
        # API 주소에 "제1동"이 붙어 주소 전체는 다르지만 도로명·건물번호 + 호로 같은 주택
        {**base, "model_no": "01-001", "address": "경기도 동두천시 강변로336번길 18-5(생연동) 성운빌라 제1동",
         "complex_name": "… - 매입다가구(경기동두천시) 502호", "unit_type": None, "exclusive_area_sqm": 55.77},
        {**base, "model_no": "01-002", "address": None, "complex_name": "모집공고", "unit_type": "2형"},
        {**base, "model_no": "01-003", "address": None, "complex_name": "모집공고", "unit_type": None},
    ]
    costs = house_costs(listings, houses)
    assert [(c["model_no"], c["method"], c["contract_deposit"]) for c in costs] == [
        ("01-001", "주택목록 보증금", 3_455_000),
        ("01-002", "주택목록 주택형 최솟값", 3_455_000),
        ("01-003", "주택목록 최솟값", 900_000),
    ]
    assert all(c["contract_ratio"] == 100 for c in costs)
