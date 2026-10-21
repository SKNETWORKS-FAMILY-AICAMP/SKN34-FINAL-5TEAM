// 청약 진단(목업 ⓪ 홈) 계산: 가점 · 1순위 요건 · 특별공급 자격
// 진단 결과는 참고용이며, 실제 자격은 각 입주자모집공고문 기준으로 확인해야 한다.

export const MARITAL_LABEL = { single: "미혼", newlywed: "신혼", married: "기혼" };
export const ACCOUNT_LABEL = {
  total: "주택청약종합저축",
  saving: "청약저축",
  deposit: "청약예금",
  install: "청약부금",
};
export const ACCOUNT_SHORT = { total: "종합저축", saving: "청약저축", deposit: "청약예금", install: "청약부금" };

// 희망 지역 이름 → 공고의 지역 코드 (constants/regions.js 기준)
export const WANT_REGION_CODE = { 서울: "100", 경기: "410", 인천: "400", 대전: "300", 대구: "700", 부산: "600" };

// 가점 (무주택 32 + 부양가족 35 + 통장 17 = 84점)
export function calcScore(d) {
  const single = d.marital === "single";
  const none = d.homeOwn === "none";
  const eff = single ? Math.min(d.noHouseYears, Math.max(0, d.age - 30)) : d.noHouseYears;
  const noHouse = !none || (single && d.age < 30) ? 0 : Math.min(32, 2 * (Math.min(eff, 15) + 1));
  const dependents = 5 + 5 * Math.min(d.dependents, 6);
  const account = d.accountYears === 0 ? 2 : Math.min(17, 2 + d.accountYears);
  return {
    total: noHouse + dependents + account,
    noHouse,
    dependents,
    account,
    rows: [
      { label: "무주택 기간", score: noHouse, max: 32 },
      { label: "부양가족 수", score: dependents, max: 35 },
      { label: "통장 가입 기간", score: account, max: 17 },
    ],
  };
}

// 1순위 요건: ok(충족) / warn(확인) / no(미충족)
export function calcRank1(d) {
  const none = d.homeOwn === "none";
  const capital = ["서울", "인천", "경기"].includes(d.region);
  const big = d.size === "large";
  const depositNeed = {
    서울: big ? 600 : 300,
    인천: big ? 400 : 250,
    경기: big ? 300 : 200,
    "기타 광역시": big ? 400 : 250,
    "기타 시·군": big ? 300 : 200,
  }[d.region];
  const items = [
    ["통장 종류", d.accountType === "total" ? "ok" : "warn"],
    ["가입 기간", d.accountYears >= 1 ? "ok" : capital ? "no" : "warn"],
    ["납입 회차", d.payments >= (capital ? 12 : 6) ? "ok" : "no"],
    ["예치금", d.accountType === "saving" ? "warn" : d.deposit >= depositNeed ? "ok" : "no"],
    ["세대주", d.householder ? "ok" : "warn"],
    ["무주택", none ? "ok" : d.homeOwn === "one" ? "warn" : "no"],
  ].map(([label, status]) => ({ label, status }));
  const badge = items.some((c) => c.status === "no")
    ? { text: "미충족 항목 있음", tone: "no" }
    : items.some((c) => c.status === "warn")
    ? { text: "조건부 충족", tone: "warn" }
    : { text: "1순위 충족 예상", tone: "ok" };
  return { items, badge };
}

// 특별공급 자격
export function calcSpecial(d) {
  const single = d.marital === "single";
  const none = d.homeOwn === "none";
  return [
    ["신혼부부", d.marital === "newlywed" && none ? (d.income > 160 ? "warn" : "ok") : "no"],
    ["신생아", d.newborn && none ? "ok" : "no"],
    ["생애최초", d.firstTime && none ? (single || d.income > 160 ? "warn" : "ok") : "no"],
    ["다자녀", d.minorKids >= 2 && none ? "ok" : "no"],
    ["노부모 부양", d.parentSupport && none ? (d.householder ? "ok" : "warn") : "no"],
    ["청년", single && d.age >= 19 && d.age <= 39 && none ? (d.income <= 130 ? "ok" : "warn") : "no"],
  ].map(([label, status]) => ({ label, status }));
}

export const STATUS_TEXT = { ok: "충족", warn: "확인", no: "미충족" };
export const SPECIAL_TEXT = { ok: "충족", warn: "확인", no: "대상 아님" };

// 비교 그룹 이름 (예: "30대 초반 · 신혼 · 무주택")
export function peerGroup(d) {
  const band = d.age < 30 ? "20대" : d.age < 35 ? "30대 초반" : d.age < 40 ? "30대 후반" : d.age < 50 ? "40대" : "50대 이상";
  return `${band} · ${MARITAL_LABEL[d.marital]} · ${d.homeOwn === "none" ? "무주택" : "유주택"}`;
}

// 저장된 진단 요약 칩
export function profileChips(d) {
  const score = calcScore(d);
  return [
    `가점 ${score.total}점`,
    `만 ${d.age}세`,
    MARITAL_LABEL[d.marital],
    `${d.region} 거주${d.householder ? " · 세대주" : ""}`,
    d.homeOwn === "none" ? `무주택 ${d.noHouseYears}년` : "주택 소유",
    `${ACCOUNT_SHORT[d.accountType]} ${d.accountYears}년 · ${d.payments}회`,
    d.income >= 999 ? "소득 200% 초과" : `소득 ${d.income}% 이하`,
    `자산 ${(d.assets / 10).toFixed(1)}억`,
  ];
}

// 진단 값 → 백엔드 /users/ 저장 형식 (store/userSlice.js의 필드 이름)
export function diagnosisToUser(d, email) {
  const joined = new Date();
  joined.setFullYear(joined.getFullYear() - d.accountYears);
  const firstRegion = d.wantRegions.find((r) => WANT_REGION_CODE[r]);
  return {
    email,
    noHousePeriodMonths: d.homeOwn === "none" ? d.noHouseYears * 12 : 0,
    isHouseholder: d.householder,
    dependentsCount: d.dependents,
    subscriptionAccountType: ACCOUNT_LABEL[d.accountType],
    subscriptionJoinedAt: joined.toISOString().slice(0, 10),
    subscriptionPaymentCount: d.payments,
    availableAssets: d.assets * 10_000_000, // 0.1억 단위 → 원
    desiredRegionCode: firstRegion ? WANT_REGION_CODE[firstRegion] : "",
    isNewlywed: d.marital === "newlywed",
    isFirstTimeBuyer: d.firstTime,
  };
}

// 추가 요구사항 글 → 조건 카드 (키워드 기준. LLM 연결 전 임시 규칙)
export function parseConditions(text) {
  const conds = [];
  const t = text || "";
  const station = t.match(/([가-힣A-Za-z0-9]+역)까지[^.]*?(\d+)\s*(시간|분)/);
  if (station) {
    const minutes = station[3] === "시간" ? Number(station[2]) * 60 : Number(station[2]);
    conds.push({ id: "loc", cat: "위치", text: `${station[1]}까지 대중교통 ${minutes}분 이내`, how: "공고 탐색 필터 · 통근 경로 조회(/commute)로 이동 시간 계산" });
  }
  if (/학교/.test(t)) conds.push({ id: "school", cat: "생활", text: "초등학교 도보권 단지 선호", how: "추천 순위 가중치 · 학교 위치 데이터 연결 [준비 중]" });
  const loan = t.match(/(\d+)\s*만\s*원\s*이하/);
  if (loan) conds.push({ id: "loan", cat: "자금", text: `월 상환 ${loan[1]}만원 이하`, how: "대출 매칭 조건 · 한도 역산 (자금 계획 화면)" });
  const move = t.match(/(\d+)\s*년\s*안/);
  if (move) {
    const y = new Date();
    y.setFullYear(y.getFullYear() + Number(move[1]));
    conds.push({ id: "move", cat: "일정", text: `${y.getFullYear()}년 ${y.getMonth() + 1}월 이전 입주`, how: "공고의 입주 예정 연월로 필터" });
  }
  if (/반려/.test(t)) conds.push({ id: "pet", cat: "생활", text: "반려동물 동반 가능", how: "공고문 유의사항에서 확인 필요" });
  if (/역\s*도보|역세권/.test(t)) conds.push({ id: "station", cat: "위치", text: "지하철역 도보 10분 이내", how: "단지 좌표와 역 위치로 거리 계산 [준비 중]" });
  const near = t.match(/부모님[^.]*?([가-힣]+)(이라|이어서|라서)/);
  if (near) conds.push({ id: "near", cat: "위치", text: `${near[1]} 부모님 댁 가까이`, how: "통근 경로 조회에 도착지로 추가" });
  return conds;
}
