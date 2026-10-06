// 백엔드 서버가 꺼져 있을 때 화면 확인용으로 보여주는 예시 공고 (실제 공고 아님)
// 날짜는 오늘 기준 상대 일수로 만들어서 언제 열어도 D-day가 자연스럽게 보인다.
import { toDateKey } from "../utils/format";

function day(offset) {
  if (offset == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toDateKey(d);
}

// [단지명, 지역코드, 공급유형, 면적, 세대수, 분양가, 접수시작(오늘+n), 접수마감(오늘+n), 발표(오늘+n)]
const ROWS = [
  ["(예시) 역세권 푸르지오 1단지", "410", "APT", 84, 612, 520000000, -3, 2, 9],
  ["(예시) 강서 행복주택", "100", "국민임대", 36, 180, 42000000, -5, 6, 20],
  ["(예시) 하남 신혼희망타운", "410", "신혼희망타운", 55, 350, 385000000, 15, 19, 30],
  ["(예시) 은평 자이 더 센트럴", "100", "APT", 59, 428, 690000000, -2, 3, 10],
  ["(예시) 남양주 국민임대", "410", "국민임대", 46, 240, 29000000, -1, 9, 24],
  ["(예시) 수원 힐스테이트 2차", "410", "APT", 74, 890, 560000000, 22, 26, 35],
  ["(예시) 김포 리버뷰", "410", "APT", 84, 540, 470000000, 28, 31, 40],
  ["(예시) 송도 더샵 퍼스트", "400", "APT", 84, 760, 610000000, 4, 8, 15],
  ["(예시) 마포 청년안심주택", "100", "민간임대", 29, 120, 65000000, -20, -12, -2],
  ["(예시) 세종 6-3 공공분양", "338", "APT", 59, 420, 310000000, 10, 13, 22],
  ["(예시) 부산 에코델타 푸르지오", "600", "APT", 84, 980, 450000000, 0, 4, 12],
  ["(예시) 대구 수성 행복주택", "700", "행복주택", 26, 200, 18000000, 6, 11, 25],
  ["(예시) 대전 도안 아이파크", "300", "APT", 84, 1100, 480000000, 35, 38, 48],
  ["(예시) 광주 첨단 오피스텔", "500", "오피스텔", 32, 300, 210000000, -4, 1, 6],
  ["(예시) 청주 테크노폴리스 자이", "360", "APT", 84, 650, 390000000, 12, 16, 26],
  ["(예시) 창원 신혼희망타운", "621", "신혼희망타운", 55, 280, 290000000, null, null, null],
];

export const SAMPLE_LISTINGS = ROWS.map(([name, region, supply, sqm, units, price, s, e, a], i) => ({
  id: 9000 + i,
  external_id: `sample-${i}`,
  complex_name: name,
  region_code: region,
  supply_type: supply,
  unit_size_sqm: sqm,
  unit_count: units,
  sale_price: price,
  contract_deposit: price ? Math.round(price * 0.1) : null,
  receipt_start: day(s),
  receipt_end: day(e),
  announce_date: day(a),
  move_in_date: day(e == null ? null : 900 + i * 30),
  days_until_receipt_start: s,
  days_until_receipt_end: e,
  days_until_announce: a,
  eligibility: {},
  required_documents: [],
}));
