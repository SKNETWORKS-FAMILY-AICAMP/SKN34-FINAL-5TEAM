// 청약홈 공고의 공급지역 코드(SUBSCRPT_AREA_CODE) 기준 시·도 목록
export const REGIONS = [
  { code: "100", name: "서울" },
  { code: "410", name: "경기" },
  { code: "400", name: "인천" },
  { code: "600", name: "부산" },
  { code: "700", name: "대구" },
  { code: "500", name: "광주" },
  { code: "300", name: "대전" },
  { code: "680", name: "울산" },
  { code: "338", name: "세종" },
  { code: "200", name: "강원" },
  { code: "360", name: "충북" },
  { code: "312", name: "충남" },
  { code: "560", name: "전북" },
  { code: "513", name: "전남" },
  { code: "712", name: "경북" },
  { code: "621", name: "경남" },
  { code: "690", name: "제주" },
];

export function regionName(code) {
  return REGIONS.find((r) => r.code === code)?.name || code || "-";
}
