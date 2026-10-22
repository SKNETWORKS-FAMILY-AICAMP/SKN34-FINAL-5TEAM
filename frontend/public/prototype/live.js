/* live.js — 청약돼?! 화면을 백엔드(FastAPI)에 연결하는 계층

   app.js 뒤에서 불러온다.
   - 예전에 코드 안에 들어 있던 가짜 공고·상품·답변 대신 백엔드 API 응답으로 화면을 그린다.
   - homes, detail, result … 화면 함수를 여기서 정의한다 (app.js에는 공통 틀과 진단 화면만 남아 있다).
   - 서버(백엔드)에 없는 기능(커뮤니티, 관심 공고 저장, 예적금·카드, 보험 안내)은 화면에서 뺐다. */

/* ───────── 1. 서버 주소와 호출 도우미 ───────── */

// 부모(React) 화면이 window.CY_API_BASE로 알려 주면 그 주소를 쓰고, 없으면 로컬 백엔드를 쓴다.
const API_BASE = (() => {
  try { return window.parent.CY_API_BASE || window.CY_API_BASE || 'http://localhost:8000'; }
  catch { return window.CY_API_BASE || 'http://localhost:8000'; }
})();

// fetch 래퍼: 쿼리 문자열, JSON 본문, 제한 시간, 서버 오류 메시지(detail)를 한곳에서 처리한다.
async function api(path, { method = 'GET', body, params, timeout = 30000 } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value == null || value === '') continue;
    // 배열은 status=a&status=b 처럼 같은 키를 반복해서 보낸다 (백엔드가 list 쿼리를 받는다)
    for (const item of [].concat(value)) query.append(key, item);
  }
  const url = `${API_BASE}${path}${query.toString() ? '?' + query : ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data?.detail;
      throw new Error(typeof detail === 'string' ? detail : `서버 오류 (${res.status})`);
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('서버 응답이 너무 늦어요. 잠시 뒤 다시 시도해 주세요.');
    if (error instanceof TypeError) throw new Error('백엔드 서버(' + API_BASE + ')에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* ───────── 2. 값 변환 (백엔드 ↔ 화면) ───────── */

// 지역 이름 ↔ 백엔드 region_code. SH 공고는 코드가 'seoul'로 저장돼 있다.
const REGION_CODE = { 서울: '100', 강원: '200', 대전: '300', 충남: '312', 세종: '338', 충북: '360', 인천: '400', 경기: '410', 광주: '500', 전남: '513', 전북: '560', 부산: '600', 경남: '621', 울산: '680', 제주: '690', 대구: '700', 경북: '712' };
const REGION_NAME = { ...Object.fromEntries(Object.entries(REGION_CODE).map(([name, code]) => [code, name])), seoul: '서울' };

// 백엔드 금액은 원 단위, 이 화면의 money()는 만원 단위라서 10,000으로 나눈다.
const toMan = (won) => (won == null ? null : Math.round(Number(won) / 10000));
const moneyOr = (man, fallback = '공고문 확인') => (man == null ? fallback : money(man));
const mmdd = (iso) => (iso ? iso.slice(5).replace('-', '.') : '');

// 화면의 접수 상태 표시 (백엔드의 접수중/예정/마감과 같은 기준)
function receiptStatus(l) {
  const today = new Date().toISOString().slice(0, 10);
  const { receipt_start: start, receipt_end: end } = l;
  if (end && end < today) return '접수 마감';
  if (start && start > today) return '접수 예정';
  if (end || start) return '접수 중';
  return '일정 미정';
}

// 단지 그림 색: 공고 id로 정해서 같은 공고는 늘 같은 색이 나온다
const PALETTE = ['#bfcfbf', '#d8d0b9', '#c6d1da', '#bcc8b4', '#b7cfd0', '#d2c8b7'];
const SOURCE_LABEL = { sh: 'SH', lh: 'LH', applyhome: '청약홈' };

// 진단의 "관심 주거 유형"과 비교하려고 공급유형을 세 갈래로 묶는다
// 공고 유형 → 진단의 "관심 주거 유형" 묶음
// (청약홈: 국민=공공분양 / 민영·오피스텔·도시형=민간분양 / 공공지원민간임대·민간임대=민간임대,
//  LH·SH: 임대 계열=공공임대 / 분양주택·공공분양(신혼희망)=공공분양, 가정어린이집 같은 비주택은 추천에서 뺀다)
// 순서가 중요하다: '민간임대 오피스텔'처럼 여러 단어가 섞인 이름이 있어서 구체적인 것부터 본다.
function supplyGroup(type = '') {
  if (/가정어린이집/.test(type)) return '비주택';
  if (/공공지원민간임대|민간임대 민간임대/.test(type)) return '민간임대';
  if (/오피스텔|도시형|생활숙박/.test(type)) return '민간분양';
  if (/임대|행복주택|전세/.test(type)) return '공공임대';
  if (/민영|민간/.test(type)) return '민간분양';
  if (/국민|분양주택|공공분양|신혼희망/.test(type)) return '공공분양';
  if (/무순위|임의|재공급/.test(type)) return '민간분양';   // 청약홈 무순위·임의공급·재공급은 대부분 민영 단지 잔여분
  return '기타';
}

// 백엔드 ListingOut → 화면이 쓰는 house 모양
function toHouse(l) {
  const price = l.sale_price ?? l.rent_deposit ?? null;
  const area = l.exclusive_area_sqm ?? l.unit_size_sqm;
  const start = l.receipt_start, end = l.receipt_end;
  const d = l.days_until_receipt_start;
  const tags = [SOURCE_LABEL[l.source] || l.source];
  if (d != null && d >= 0) tags.push(d === 0 ? '오늘 접수 시작' : `접수 D-${d}`);
  if (l.unit_count) tags.push(`${l.unit_count.toLocaleString('ko-KR')}세대`);
  return {
    id: l.id,
    name: l.complex_name || '(공고명 없음)',
    region: REGION_NAME[l.region_code] || (l.region_name || '').slice(0, 2) || '전국',
    loc: l.address || l.region_name || '위치 공고문 확인',
    type: l.supply_type || l.house_type || '유형 확인',
    group: supplyGroup(l.supply_type || l.house_type),
    area: area ? `${Number(area).toLocaleString('ko-KR')}㎡` : '면적 공고문 확인',
    price: toMan(price),
    priceLabel: l.sale_price != null ? '분양가' : '보증금',
    monthlyRent: toMan(l.monthly_rent),
    deposit: toMan(l.contract_deposit),
    depositIsEstimate: !!l.deposit_is_estimate,
    status: receiptStatus(l),
    date: start || end ? `${mmdd(start)} ~ ${mmdd(end)}` : '일정 공고문 확인',
    tags,
    color: PALETTE[l.id % PALETTE.length],
    raw: l,
  };
}

/* ───────── 3. 공고 데이터 (houses는 지금까지 받은 공고를 모아 둔 캐시) ───────── */

const live = {
  ids: [], total: 0, page: 1, listLoading: false, listError: null, listStarted: false,   // 집 찾기 목록
  featured: [], featuredStarted: false,                                                   // 홈에 보이는 공고
  missing: new Set(), pending: new Set(),                                                 // 상세 조회 실패/진행 중인 id
  userTried: false, userError: null,                                                     // 내 정보 저장 시도/오류
  recs: null, recsLoading: false, recsError: null,                                        // 추천 결과
  loan: { houseId: null, loading: false, error: null, items: null, key: '' },             // 대출 매칭
  units: {}, unitsPending: new Set(), unitPick: {}, unitPyeong: false,                   // 면적별 정보 (공고 id → 주택형 목록, 고른 탭, ㎡/평)
};

// 같은 id가 이미 있으면 교체하고, 없으면 추가한다
function upsertHouse(h) {
  const i = houses.findIndex((x) => x.id === h.id);
  if (i >= 0) houses[i] = h; else houses.push(h);
  return h;
}
const houseById = (id) => houses.find((h) => h.id === Number(id));

// 접수 상태 필터 → 백엔드 status 값
const STATUS_QUERY = { '접수 중·예정': ['접수중', '예정'], '접수 중': ['접수중'], '접수 예정': ['예정'], '마감 포함 전체': null };
const TYPE_OPTIONS = ['전체', '임대', '행복주택', 'APT', '분양주택', '무순위'];   // supply_type 부분 일치로 검색
state.filterStatus = state.filterStatus || '접수 중·예정';

async function loadHouses(append = false) {
  live.listLoading = true; live.listError = null;
  const page = append ? live.page + 1 : 1;
  try {
    const data = await api('/listings/', {
      params: {
        page, per_page: 12,
        region_code: REGION_CODE[state.filterRegion],
        supply_type: state.filterType === '전체' ? null : state.filterType,
        keyword: state.search,
        status: STATUS_QUERY[state.filterStatus],
      },
    });
    const items = data.items.map(toHouse);
    items.forEach(upsertHouse);
    live.ids = append ? [...live.ids, ...items.map((h) => h.id)] : items.map((h) => h.id);
    live.total = data.total; live.page = page;
  } catch (error) {
    live.listError = error.message;
  } finally {
    live.listLoading = false;
  }
}

// 필터가 바뀌면 처음부터 다시 불러온다
async function reloadList() {
  live.listStarted = true; live.ids = []; live.listLoading = true; render();
  await loadHouses(false); render();
}

// 홈에 보여 줄 접수 중 공고 3건
async function loadFeatured() {
  live.featuredStarted = true;
  try {
    const data = await api('/listings/', { params: { per_page: 12, status: ['접수중'] } });
    live.featured = data.items.map(toHouse).map(upsertHouse).map((h) => h.id);
  } catch { live.featured = []; }
  render();
}
const featuredHouses = () => live.featured.map(houseById).filter(Boolean);

// 목록에 없는 공고(저장·직접 링크)는 id로 따로 조회한다. 한 번 실패한 id는 다시 요청하지 않는다.
async function ensureHouse(id) {
  id = Number(id);
  if (!id || houseById(id) || live.missing.has(id) || live.pending.has(id)) return;
  live.pending.add(id);
  try { upsertHouse(toHouse(await api(`/listings/${id}`))); }
  catch { live.missing.add(id); }
  finally { live.pending.delete(id); }
  render();
}

// 면적별 정보: 같은 공고의 주택형(평형) 행을 모두 받아 온다. 한 번 받은(또는 실패한) id는 다시 요청하지 않는다.
async function ensureUnits(id) {
  id = Number(id);
  if (!id || live.units[id] || live.unitsPending.has(id)) return;
  live.unitsPending.add(id);
  try { live.units[id] = await api(`/listings/${id}/units`); }
  catch { live.units[id] = []; }                              // 실패하면 빈 목록 → 섹션을 그리지 않는다
  finally { live.unitsPending.delete(id); }
  if (location.hash.startsWith(`#detail/${id}`)) render();   // 아직 그 상세 화면에 있을 때만 다시 그린다
}

/* ───────── 4. 내 정보·추천·대출 ───────── */

// 진단 답변 → 백엔드 UserProfileIn. 진단은 연령대·통장 가입 기간만 받으므로 아래 값은 추정이다.
// 진단의 연 소득 구간 → 대표값(원, 구간 가운데쯤). 정책대출 금리·한도 계산에만 쓴다
const INCOME_WON = { '3천만 원 이하': 25000000, '3천~5천만 원': 40000000, '5천~7천만 원': 60000000, '7천만~1억 원': 85000000, '1억 원 초과': 120000000 };
const incomeBand = (won) => (won == null ? '입력 안 함' : Object.entries(INCOME_WON).reduce((best, [k, v]) => (Math.abs(v - won) < Math.abs(INCOME_WON[best] - won) ? k : best), '3천만 원 이하'));

function profilePayload(email) {
  const a = state.diagnosis;
  const base = { email, ...(state.user?.member ? { nickname: state.user.name } : {}) };
  if (!a) return base;
  const now = new Date();
  const ageOffset = { '20대': 25, '30대': 35, '40대 이상': 45 }[a.age] ?? 35;      // 연령대의 가운데 나이로 출생 연도를 추정
  const joined = new Date(now); joined.setFullYear(now.getFullYear() - (Number(a.account) || 0));
  return {
    ...base,
    birth_date: `${now.getFullYear() - ageOffset}-01-01`,
    is_married: a.marriage !== '미혼',
    is_newlywed: a.marriage === '신혼',
    is_householder: a.head === '세대주',
    is_first_time_buyer: a.ownership === '무주택' && a.firstHome !== '있어요',      // 세대원 포함 주택 소유 이력이 없어야 생애최초
    no_house_period_months: a.ownership === '무주택' ? Math.round((Number(a.years) || 0) * 12) : 0,
    dependents_count: Number(a.family) || 0,
    subscription_account_type: '주택청약종합저축',
    subscription_joined_at: joined.toISOString().slice(0, 10),
    subscription_payment_count: Number(a.payments) || 0,
    available_assets: (Number(a.assets) || 0) * 10000,                              // 만원 → 원
    annual_income: INCOME_WON[a.income] ?? null,
    // 청약 1순위 판정용 (모르면 null → 서버가 '확인 필요'로 표시)
    residence_region_code: REGION_CODE[a.region] || null,
    house_count: { 무주택: 0, '1주택': 1, '주택 보유': 1, '2주택 이상': 2 }[a.ownership] ?? null,
    deposit_balance: a.deposit == null || a.deposit === '' ? null : Number(a.deposit) * 10000,     // 만원 → 원
    won_within_5y: a.won5 === '있어요' ? true : a.won5 === '없어요' ? false : null,
    minor_children: { 없음: 0, '1명': 1, '2명 이상': 2 }[a.children] ?? null,
    household_size: { '1인': 1, '2인': 2, '3인': 3, '4인': 4, '5인 이상': 5 }[a.household] ?? null,
    welfare_status: a.welfare || null,
    ...(() => {   // 공공임대 총자산 판정용 상세 자산 (만원 → 원). '자세히 입력'을 고른 경우에만 보낸다
      const on = a.assetDetail === '자세히 입력할게요';
      const won = (v) => (on ? Math.round((Number(v) || 0) * 10000) : null);
      return { real_estate_value: won(a.realEstate), car_value: won(a.car), other_financial_assets: won(a.otherFin), debt_amount: won(a.debt) };
    })(),                                    // 소득 구간의 대표값(원). 입력 안 함이면 null
    desired_region_code: REGION_CODE[a.wish] || null,
  };
}

// 서버에 내 정보를 저장(같은 이메일이면 갱신)하고 받은 id를 이 브라우저에 기억한다.
// - 로그인(email, name을 넘김): 입력한 이메일로 저장하고 member 표시를 붙인다.
// - 그냥 진단만 한 경우: 처음 한 번 이 브라우저용 익명 주소(guest-…)를 만들어 계속 쓴다.
const guestId = () => (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
async function saveProfile(email, name) {
  const before = state.user;
  if (email) state.user = { email: email.trim().toLowerCase(), name: (name || email.split('@')[0]).trim(), member: true };
  else if (!state.user?.email) state.user = { email: `guest-${guestId()}@guest.app`, name: '나' };
  try {
    const user = await api('/users/', { method: 'POST', body: profilePayload(state.user.email) });
    state.user = { ...state.user, id: user.id };
  } catch (error) {
    state.user = before;                                      // 실패하면 로그인 전 상태 그대로
    throw error;
  }
  save('user', state.user);
  live.recs = null; live.loan.key = '';
  return state.user;
}

// 서버 프로필 → 진단 답변 (profilePayload의 반대 방향)
// 서버에 없는 값(현재 거주 지역, 미성년 자녀, 소득 확인 상태, 관심 유형)은 기본값으로 채운다.
function diagnosisFromProfile(p) {
  const now = new Date();
  const age = p.birth_date ? now.getFullYear() - Number(p.birth_date.slice(0, 4)) : 35;
  const joinedYears = p.subscription_joined_at ? Math.max(0, Math.round((now - new Date(p.subscription_joined_at)) / (365.25 * 24 * 3600 * 1000))) : 0;
  const months = Number(p.no_house_period_months) || 0;
  return {
    ...state.answers,
    age: age < 30 ? '20대' : age < 40 ? '30대' : '40대 이상',
    head: p.is_householder ? '세대주' : '세대원',
    marriage: p.is_newlywed ? '신혼' : p.is_married ? '기혼' : '미혼',
    ownership: p.house_count != null ? ['무주택', '1주택', '2주택 이상'][Math.min(2, p.house_count)] : months > 0 || p.is_first_time_buyer ? '무주택' : '1주택',
    region: REGION_NAME[p.residence_region_code] || state.answers.region,
    deposit: p.deposit_balance == null ? null : Math.round(Number(p.deposit_balance) / 10000),
    won5: p.won_within_5y == null ? '잘 모르겠어요' : p.won_within_5y ? '있어요' : '없어요',
    children: ['없음', '1명', '2명 이상'][p.minor_children ?? -1] || state.answers.children,
    household: ['1인', '2인', '3인', '4인', '5인 이상'][(p.household_size ?? 0) - 1] || state.answers.household,
    welfare: p.welfare_status || state.answers.welfare,
    ...(() => {
      const keys = ['real_estate_value', 'car_value', 'other_financial_assets', 'debt_amount'];
      if (!keys.some((k) => p[k] != null)) return { assetDetail: '나중에 할게요' };
      const man = (v) => Math.round((Number(v) || 0) / 10000);
      return { assetDetail: '자세히 입력할게요', realEstate: man(p.real_estate_value), car: man(p.car_value), otherFin: man(p.other_financial_assets), debt: man(p.debt_amount) };
    })(),
    firstHome: p.is_first_time_buyer ? '없어요' : '있어요',
    income: incomeBand(p.annual_income == null ? null : Number(p.annual_income)),
    years: Math.round(months / 12),
    family: Number(p.dependents_count) || 0,
    account: joinedYears,
    payments: Number(p.subscription_payment_count) || 0,
    assets: Math.round((Number(p.available_assets) || 0) / 10000),            // 원 → 만원
    wish: REGION_NAME[p.desired_region_code] || '전체',
    type: '전체',
  };
}

// 시연·테스트용 관리자 계정 (비밀번호가 없는 이메일·닉네임 로그인 방식이라 실제 권한 차이는 없다)
const TEST_ACCOUNT = { email: 'admin@cheongyakdwae.com', nickname: '관리자' };

// 로그인: 이메일 + 닉네임이 서버에 저장된 것과 맞으면, 그 사람의 진단 정보를 불러와 이어서 쓴다
async function loginWith(email, nickname) {
  const p = await api('/users/login', { method: 'POST', body: { email: email.trim().toLowerCase(), nickname: nickname.trim() } });
  state.user = { id: p.id, email: p.email, name: p.nickname, member: true };
  state.diagnosis = diagnosisFromProfile(p);
  state.answers = { ...state.diagnosis };
  save('user', state.user); save('diagnosis', state.diagnosis);
  live.recs = null; live.loan.key = ''; live.userTried = false; live.userError = null;
  return state.user;
}

async function loadRecs() {
  if (!state.user?.id) return;
  live.recsLoading = true; live.recsError = null;
  try {
    const type = state.diagnosis?.type;   // 관심 주거 유형은 서버에서 먼저 걸러야 개수 제한(50) 안에서 0건이 되지 않는다
    const data = await api(`/recommendations/${state.user.id}`, { params: { group: typeSet(type).size ? [...typeSet(type)].join(',') : null } });
    live.recs = data.items.map((item) => ({
      house: upsertHouse(toHouse(item.listing)),
      eligible: item.eligible, score: item.score, band: item.percentile_band,
      fp: item.first_priority || '확인 필요', fpNotes: item.first_priority_notes || [],
      fit: item.fit || null, fitNotes: item.fit_notes || [], badges: item.badges || [],
    }));
  } catch (error) { live.recsError = error.message; live.recs = []; }
  finally { live.recsLoading = false; }
  render();
}

// 내 추천 공고 = 서버 추천 중 비주택을 빼고, 진단의 "관심 주거 유형"으로 거른 것.
// 메인 숫자·흐르는 카드·진단 결과 목록·진단 기록 숫자가 모두 이 목록 하나를 기준으로 맞춰진다.
function myRecs() {
  const picked = typeSet(state.diagnosis?.type);   // 비어 있으면 전체
  return (live.recs || []).filter((r) => r.house && r.house.group !== '비주택' && (!picked.size || picked.has(r.house.group)));
}

// 공고 한 건의 '신청 가능성' 표시: 임대처럼 유형별 자격(fit)이 있으면 그것을, 없으면 1순위 판정을 보여 준다
const STATUS_CLASS = { '1순위 가능': 'fp-ok', '자격 가능': 'fp-ok', '1순위 아님': 'fp-no', '대상 아님': 'fp-no', '확인 필요': 'fp-check' };
function recStatus(r) {
  const label = r.fit || r.fp;
  return { label, cls: STATUS_CLASS[label] || 'fp-etc', notes: r.fit ? r.fitNotes : r.fpNotes };
}
// 공고 출처(청약홈 / LH / SH)를 색 배지로: 어디서 신청하는 공고인지 바로 보이게
const srcBadge = (h) => { const src = h?.raw?.source; return src ? `<span class="src-badge src-${esc(src)}">${esc(SOURCE_LABEL[src] || src)}</span>` : ''; };
const recBadges = (r) => (r.badges || []).map((b) => `<span class="badge sp-badge${b === '통장 없이 신청' ? ' sp-free' : ''}">${esc(b)}</span>`).join('');

// 내 추천 공고를 보여 줄 순서: 자금 충족 → 1순위 가능 → 당첨 가능 구간(상·중·하) → 마감 가까운 순
// (진단 결과 화면과 내 공간이 같은 순서를 쓴다)
function rankedRecs() {
  const BAND = { 상: 0, 중: 1, 하: 2, '데이터 부족': 3 };
  const FP = { '1순위 가능': 0, '자격 가능': 0, '순위 없음': 1, '확인 필요': 2, '해당 없음': 3, '1순위 아님': 4, '대상 아님': 5 };
  const end = (r) => (r.house.raw?.receipt_end ? new Date(r.house.raw.receipt_end).getTime() : Infinity);
  return [...myRecs()].sort((x, y) => (x.eligible ? 0 : 1) - (y.eligible ? 0 : 1) || (FP[recStatus(x).label] ?? 2) - (FP[recStatus(y).label] ?? 2)
    || (x.eligible ? BAND[x.band] ?? 3 : 4) - (y.eligible ? BAND[y.band] ?? 3 : 4) || end(x) - end(y));
}

async function loadLoans(houseId) {
  const key = `${state.user.id}:${houseId}`;
  live.loan = { houseId, loading: true, error: null, items: null, key };
  render();
  try { live.loan.items = await api('/loans/match', { method: 'POST', body: { user_id: state.user.id, listing_id: Number(houseId) } }); }
  catch (error) { live.loan.error = error.message; }
  finally { live.loan.loading = false; }
  render();
}

/* ───────── 5. 화면 (예전 app.js의 예시 데이터 화면을 서버 데이터 화면으로 대체) ───────── */

const loadingBox = (text) => `<div class="wrap page"><div class="empty"><h3>${text}</h3></div></div>`;
const noteBox = (text) => `<div class="callout">${esc(text)}</div>`;

// 공고 카드: 화면에 보이는 값은 모두 백엔드 값. 없는 값은 "공고문 확인"으로 표시한다.
// 카드 가격 자리: 가격이 없으면 공고 원문으로 바로 가는 링크 (원문 주소도 없으면 회색 안내 글자)
function priceOrNotice(h) {
  if (h.price != null) return moneyOr(h.price);
  const url = h.raw?.notice_url;
  return url
    ? `<a class="notice-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="공고 기관 사이트에서 원문 열기">공고문에서 확인 ↗</a>`
    : '<span class="price-na">공고문 참고</span>';
}

function houseCard(h) {
  return `<article class="house-card"><div class="house-visual" data-hid="${h.id}"><a href="#detail/${h.id}" tabindex="-1">${building(h)}</a><span class="badge">${esc(h.type)}</span></div><div class="house-body"><div class="tags"><span class="badge ${h.status === '접수 중' ? 'orange-badge' : 'gray'}">${h.status}</span></div><a href="#detail/${h.id}"><h3>${esc(h.name)}</h3></a><p class="location">${esc(h.loc)} · ${h.area}</p><div class="house-bottom"><div><small>${h.priceLabel}</small><br><strong>${priceOrNotice(h)}</strong></div><span class="text-link">${h.date}</span></div><div class="tags" style="margin-top:13px">${h.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></div></article>`;
}

// 집 찾기: 필터를 바꿀 때마다 서버에 다시 물어보고, 12건씩 "더 보기"로 이어 붙인다
function homes() {
  const list = live.ids.map(houseById).filter(Boolean);
  if (state.sort === 'price') list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  const radios = (name, key, values) => values.map((v) => `<label><input type="radio" name="${name}" value="${v}" data-filter="${key}" ${state[key] === v ? 'checked' : ''}> ${v}</label>`).join('');
  let body;
  if (live.listError) body = `<div class="empty"><h3>공고를 불러오지 못했어요</h3><p>${esc(live.listError)}</p><button class="btn soft" data-action="reload-list">다시 시도</button></div>`;
  else if (live.listLoading && !list.length) body = '<div class="empty"><h3>공고를 불러오는 중이에요…</h3></div>';
  else if (!list.length) body = '<div class="empty"><h3>조건에 맞는 공고가 없어요</h3><p>지역·유형·접수 상태 또는 검색어를 바꿔 보세요.</p><button class="btn soft" data-action="clear-filters">조건 초기화</button></div>';
  else body = `<div class="list-grid">${list.map((h) => houseCard(h)).join('')}</div>${list.length < live.total ? `<div style="text-align:center;margin-top:28px"><button class="btn secondary" data-action="more-list" ${live.listLoading ? 'disabled' : ''}>${live.listLoading ? '불러오는 중…' : `공고 더 보기 (${list.length} / ${live.total.toLocaleString('ko-KR')})`}</button></div>` : ''}`;
  return `<div class="wrap page reveal"><div class="page-title"><div class="eyebrow">FIND YOUR PLACE</div><h1>내 생활에 맞는 집 찾기</h1><p>청약홈·LH·SH 공고를 조건별로 살펴보고, 접수 일정과 금액을 한눈에 확인해 보세요.</p></div><div class="filter-layout"><aside class="panel filter-panel"><h3>공고 조건</h3><div class="filter-group"><h3>지역</h3>${radios('region', 'filterRegion', ['전체', ...Object.keys(REGION_CODE)])}</div><div class="filter-group"><h3>공급 유형</h3>${radios('type', 'filterType', TYPE_OPTIONS)}</div><div class="filter-group"><h3>접수 상태</h3>${radios('status', 'filterStatus', Object.keys(STATUS_QUERY))}</div><button class="text-link" data-action="clear-filters" style="margin-top:20px">조건 초기화 ↺</button><p class="filter-help">자격을 확정하는 필터가 아닙니다.<br>공고마다 원문의 요건을 확인하세요.</p></aside><section><form class="search-row" id="house-search"><input aria-label="공고명 검색" placeholder="공고(단지)명으로 검색해 보세요" value="${esc(state.search)}"><button class="btn" type="submit">검색</button></form><div class="results-head"><h3>공고 ${live.total.toLocaleString('ko-KR')}건 ${live.listLoading ? '<span class="badge gray">불러오는 중</span>' : ''}</h3><div class="view-toggle"><select aria-label="공고 정렬" data-filter="sort"><option value="default">기본 순서</option><option value="price" ${state.sort === 'price' ? 'selected' : ''}>비용 낮은순 (불러온 공고)</option></select></div></div>${body}</section></div></div>`;
};

// 탭 이름: 청약홈 "084.9600A" → "84A", LH "59.6100H(59B2)" → "59B2"(괄호 안 약칭). 주택형이 없으면 전용면적을 반올림해서 쓴다.
function unitLabel(u) {
  const short = /\(([^)]+)\)/.exec(u.unit_type || '');
  if (short) return short[1];
  const m = /^0*(\d+)(?:\.\d+)?\s*(.*)$/.exec(u.unit_type || '');
  if (m) return m[1] + m[2];
  return u.exclusive_area_sqm != null ? String(Math.round(u.exclusive_area_sqm)) : '-';
}
const won = (v) => (v == null ? null : `${Number(v).toLocaleString('ko-KR')}원`);

// 면적별 정보 섹션 안쪽 HTML. 탭을 누르면 이 부분만 다시 그린다(화면 전체를 다시 그리면 스크롤이 튄다).
function unitBody(id) {
  const units = live.units[id];
  if (!units) return '<p>면적별 정보를 불러오는 중이에요…</p>';
  if (!units.length) return '<p>면적별 정보를 불러오지 못했어요. 공고문을 확인해 주세요.</p>';
  const pick = live.unitPick[id] ?? id;                                         // 처음엔 목록에서 누른 그 주택형
  const u = units.find((x) => x.id === pick) || units[0];
  const area = (v) => (v == null ? null : live.unitPyeong ? `${(v / 3.3058).toFixed(2)}평` : `${Number(v).toFixed(2)}㎡`);
  const common = u.unit_size_sqm != null && u.exclusive_area_sqm != null ? u.unit_size_sqm - u.exclusive_area_sqm : null;   // 공용 = 공급 − 전용
  // 탭 이름이 겹치면(오피스텔 군 구분 등) 주택형 순번을 붙여서 구분한다
  const labels = units.map(unitLabel);
  const tabName = (x, i) => (labels.filter((t) => t === labels[i]).length > 1 && x.model_no ? `${labels[i]}·${x.model_no}` : labels[i]);
  // 값이 없는 칸은 빼고 3칸씩 보여 준다 (0원·0㎡처럼 지어낸 값은 쓰지 않는다)
  const cells = [
    ['전용면적', area(u.exclusive_area_sqm)], ['공용면적', area(common)], ['공급면적', area(u.unit_size_sqm)],
    ['분양가', won(u.sale_price)], ['임대보증금', won(u.rent_deposit)], ['월임대료', won(u.monthly_rent)],
    ['공급 세대', u.unit_count ? `${u.unit_count.toLocaleString('ko-KR')}세대` : null],
    ['일반공급', u.general_supply_count != null ? `${u.general_supply_count}세대` : null],
    ['특별공급', u.special_supply_count != null ? `${u.special_supply_count}세대` : null],
  ].filter(([, v]) => v);
  return `<div class="unit-head"><div class="unit-tabs" role="tablist">${units.map((x, i) => `<button class="unit-tab ${x.id === u.id ? 'active' : ''}" role="tab" aria-selected="${x.id === u.id}" data-action="unit-tab" data-id="${id}" data-value="${x.id}">${esc(tabName(x, i))}</button>`).join('')}</div><button class="unit-toggle" data-action="unit-toggle" data-id="${id}">⇄ ${live.unitPyeong ? '㎡' : '평'}</button></div>${cells.length ? `<div class="unit-grid">${cells.map(([t, v]) => `<div><small>${t}</small><strong>${v}</strong></div>`).join('')}</div>` : '<p>이 주택형은 면적·금액 정보가 없어요. 공고문을 확인해 주세요.</p>'}<p class="demo-note">공공데이터 기준 참고용이에요. 정확한 조건은 공고문을 확인해 주세요.</p>`;
}

// ───── 공고 사진 (상세 화면) ─────
// 카카오 로드뷰: 공고 주소 근처의 실제 거리 사진 1장(정면 방향). 카카오 JavaScript 키가 있고, 주소에서 100m 안에 로드뷰가 있을 때만 보여 준다.
// 조건이 안 되면 예전처럼 단지 그림(building)을 그대로 보여 준다.
// (공고문 PDF 속 이미지와 로드뷰 여러 방향 버튼은 뺐다. 서버의 /listings/{id}/images API는 남겨 두었다.)
const gallery = { pano: {}, views: {}, kakaoKey: '', sdk: null };

// 카카오 지도 SDK는 키가 있을 때 한 번만 불러온다
function loadKakaoSdk() {
  if (!gallery.sdk) {
    gallery.sdk = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(gallery.kakaoKey)}&autoload=false&libraries=services`;
      script.onload = () => window.kakao.maps.load(resolve);
      script.onerror = () => reject(new Error('카카오 지도 SDK를 불러오지 못했어요'));
      document.head.appendChild(script);
      setTimeout(() => reject(new Error('카카오 지도 SDK 응답 없음')), 10000);
    });
  }
  return gallery.sdk;
}

// 공고 주소 → 좌표 → 가장 가까운(100m 안) 로드뷰. 못 찾으면 null
async function findPano(h) {
  if (gallery.pano[h.id] !== undefined) return;
  gallery.pano[h.id] = 'loading';
  try {
    if (!h.raw.address) throw new Error('주소 없음');
    await loadKakaoSdk();
    const kakao = window.kakao;
    const coords = await new Promise((resolve) => new kakao.maps.services.Geocoder().addressSearch(h.raw.address, (rows, status) =>
      resolve(status === kakao.maps.services.Status.OK ? new kakao.maps.LatLng(rows[0].y, rows[0].x) : null)));
    const panoId = coords && await new Promise((resolve) => new kakao.maps.RoadviewClient().getNearestPanoId(coords, 100, resolve));
    gallery.pano[h.id] = panoId ? { panoId, coords } : null;
  } catch {
    gallery.pano[h.id] = null;
  }
  refreshGallery(h.id);
  cardMedia();
}

const hasRoadview = (h) => !!gallery.pano[h.id] && gallery.pano[h.id] !== 'loading';

function galleryHtml(h) {
  if (!hasRoadview(h)) return `<div id="gallery"><div class="detail-cover">${building(h)}</div></div>`;
  return `<div id="gallery"><div class="detail-cover" style="position:relative"><div id="roadview" style="width:100%;height:100%"></div><span class="badge gray" style="position:absolute;left:12px;bottom:12px">카카오 로드뷰 · 주변 실제 거리 사진</span></div></div>`;
}

// 로드뷰는 화면에 자리(#roadview)가 생긴 뒤에 붙인다
function mountGallery(h) {
  const el = $('#roadview'), pano = gallery.pano[h.id];
  if (!hasRoadview(h) || !el || !window.kakao?.maps) return;
  attachView(el, `detail:${h.id}`, pano, 'position:absolute;inset:0');   // 절대 위치: 로드뷰 속 큰 사진이 화면 폭을 밀어내지 않게
}

// 화면이 다시 그려질 때마다 로드뷰를 새로 만들면 사진을 처음부터 다시 받느라 흐릿한 상태로 멈춘다.
// 그래서 공고마다 한 번 만든 로드뷰를 보관해 두고, 새 자리(place)에 그대로 옮겨 붙인다.
function attachView(place, key, pano, css) {
  let v = gallery.views[key];
  if (!v) {
    const el = document.createElement('div');
    el.style.cssText = css;
    place.replaceWith(el);
    const rv = new window.kakao.maps.Roadview(el);
    rv.setPanoId(pano.panoId, pano.coords);
    window.kakao.maps.event.addListener(rv, 'init', () => faceHouse(rv, pano));
    gallery.views[key] = { el, rv };
    return;
  }
  if (v.el === place || v.el.isConnected) return;
  place.replaceWith(v.el);
  v.rv.relayout();
}

// 화면 전체를 다시 그리지 않고 사진 자리만 바꾼다 (보던 위치가 튀지 않게)
function refreshGallery(id) {
  const h = houseById(id), el = $('#gallery');
  if (!h || !el || location.hash !== `#detail/${id}`) return;
  el.outerHTML = galleryHtml(h);
  mountGallery(h);
}

// 로드뷰 카메라를 공고 주소(건물) 쪽으로 돌린다: 사진 찍은 지점 → 주소 좌표의 방위각(북=0, 동=90)
function faceHouse(rv, pano) {
  const from = rv.getPosition(), to = pano.coords;
  const rad = (d) => d * Math.PI / 180;
  const y = Math.sin(rad(to.getLng() - from.getLng())) * Math.cos(rad(to.getLat()));
  const x = Math.cos(rad(from.getLat())) * Math.sin(rad(to.getLat())) - Math.sin(rad(from.getLat())) * Math.cos(rad(to.getLat())) * Math.cos(rad(to.getLng() - from.getLng()));
  const pan = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  rv.setViewpoint({ pan, tilt: 0, zoom: -3 });
}

// 목록·홈의 공고 카드: 로드뷰가 있는 공고는 카드 그림 자리에 실제 거리 사진을 넣는다 (눌러서 상세로 가는 건 그대로)
function cardMedia() {
  document.querySelectorAll('.house-visual[data-hid]').forEach((box) => {
    const h = houseById(Number(box.dataset.hid));
    if (!h) return;
    if (gallery.kakaoKey && gallery.pano[h.id] === undefined) { findPano(h); return; }
    if (!hasRoadview(h) || box.querySelector('.card-rv') || !window.kakao?.maps) return;
    const place = document.createElement('div');
    box.querySelector('a').appendChild(place);
    box.querySelectorAll('.badge').forEach((b) => { b.style.zIndex = 2; });
    attachView(place, `card:${h.id}`, gallery.pano[h.id], 'position:absolute;inset:0;pointer-events:none');
    gallery.views[`card:${h.id}`].el.className = 'card-rv';
  });
}

// 상세 화면을 그린 뒤: 로드뷰를 (처음 한 번만) 찾고, 이미 찾았으면 붙인다
function detailMedia(id) {
  const h = houseById(id);
  if (!h) return;
  if (gallery.kakaoKey && gallery.pano[id] === undefined) findPano(h);
  mountGallery(h);
}

// ───── 교통: 공고 주소 → 자주 가는 곳 대중교통 경로 (서버 /commute) ─────
// 위: 총 소요시간·환승·요금·거리 / 가운데: 구간별 시간 비율 막대 / 아래: 출발 → 구간 → 도착 타임라인 / 다른 경로 버튼
const ROUTE_KIND = { walk: '도보', bus: '버스', subway: '지하철', etc: '열차·고속버스' };
// 수도권 지하철 노선 색 (노선 이름에 들어 있는 글자로 찾는다). 없으면 기본 파랑
const SUBWAY_COLORS = [['신분당', '#d4003b'], ['경의중앙', '#77c4a3'], ['공항', '#0090d2'], ['수인분당', '#e0a800'], ['우이신설', '#b0ce18'], ['1호선', '#0052a4'], ['2호선', '#00a84d'], ['3호선', '#ef7c1c'], ['4호선', '#00a5de'], ['5호선', '#996cac'], ['6호선', '#cd7c2f'], ['7호선', '#747f00'], ['8호선', '#e6186c'], ['9호선', '#bdb092']];
function legColor(leg) {
  if (leg.kind === 'walk') return '#c9d1c8';
  if (leg.kind === 'bus') return '#3a9a5b';
  if (leg.kind === 'subway') return (SUBWAY_COLORS.find(([k]) => (leg.line || '').includes(k)) || [, '#3b6fd8'])[1];
  return '#7a6aa8';
}
const routeTime = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60 ? (m % 60) + '분' : ''}` : `${m}분`).trim();

function routeHtml(r, pick = 0) {
  const all = [r, ...(r.alternatives || [])], cur = all[pick] || r;
  const total = cur.legs.reduce((s, l) => s + l.minutes, 0) || 1;
  const stats = [`환승 ${cur.transfers}회`, cur.fare != null ? `${Number(cur.fare).toLocaleString('ko-KR')}원` : '요금 정보 없음', cur.distance_m ? `${(cur.distance_m / 1000).toFixed(1)}km` : null].filter(Boolean);
  const bar = cur.legs.map((l) => `<span style="flex:${l.minutes || 0.5};background:${legColor(l)}" title="${ROUTE_KIND[l.kind] || l.kind} ${l.minutes}분"></span>`).join('');
  const step = (l) => {
    if (l.kind === 'walk') return `<li class="rt-step walk"><span class="rt-dot" style="background:${legColor(l)}"></span><div class="rt-step-body"><p>도보 ${l.minutes}분</p></div></li>`;   // 걷는 구간은 한 줄로 작게
    const name = `${ROUTE_KIND[l.kind] || l.kind}${l.line ? ' ' + esc(l.line.replace(/^수도권\s*/, '')) : ''}`;
    const where = l.start && l.end ? `${esc(l.start)} → ${esc(l.end)}${l.stations ? ` <small>· ${l.stations}개 ${l.kind === 'bus' ? '정류장' : '역'}</small>` : ''}` : '';
    return `<li class="rt-step ${l.kind}"><span class="rt-dot" style="background:${legColor(l)}"></span><div class="rt-step-body"><span class="rt-chip" style="background:${legColor(l)}">${name}</span><p>${where}</p></div><b>${l.minutes}분</b></li>`;
  };
  const alts = all.length > 1 ? `<div class="rt-alts">${all.map((a, i) => `<button class="chip ${i === pick ? 'active' : ''}" data-action="route-alt" data-value="${i}">${i ? `다른 경로 ${i}` : '추천'} · ${routeTime(a.total_minutes)}</button>`).join('')}</div>` : '';
  return `<div class="rt-card">${alts}<div class="rt-head"><div><small>예상 소요시간</small><strong>${routeTime(cur.total_minutes)}</strong></div><div class="rt-stats">${stats.map((s) => `<span>${s}</span>`).join('')}</div></div><div class="rt-bar">${bar}</div><ol class="rt-steps"><li class="rt-end"><span class="rt-dot start"></span><div class="rt-step-body"><small>출발</small><p>${esc(r.origin?.label || '')}</p></div></li>${cur.legs.map(step).join('')}<li class="rt-end"><span class="rt-dot goal"></span><div class="rt-step-body"><small>도착</small><p>${esc(r.destination?.label || '')}</p></div></li></ol>${r.origin?.approximate ? '<p class="demo-note" style="margin:12px 0 0">공고 주소를 정확히 찾지 못해 근처 위치에서 출발하는 것으로 계산했어요.</p>' : ''}</div>`;
}

// 공고 상세: 백엔드가 주는 일정·금액·원문 링크·제출 서류를 그대로 보여 준다
function detail(id) {
  const h = houseById(id);
  if (!h) return live.missing.has(Number(id)) ? emptyPage('공고를 찾을 수 없어요', '목록에서 공고를 다시 선택해 주세요.', 'homes', '공고 목록') : loadingBox('공고를 불러오는 중이에요…');
  const l = h.raw;
  const range = (s, e) => (s || e ? `${mmdd(s)} ~ ${mmdd(e)}` : null);
  const facts = [
    ['접수 일정', h.date], ['특별공급 접수', range(l.special_receipt_start, l.special_receipt_end)],
    ['당첨자 발표', l.announce_date], ['계약 기간', range(l.contract_start, l.contract_end)], ['입주 예정', l.move_in_date],
    ['공급 유형', h.type], ['전용면적', h.area], ['공급 세대', l.unit_count ? `${l.unit_count.toLocaleString('ko-KR')}세대` : null],
  ].filter(([, v]) => v);
  const docs = Array.isArray(l.required_documents) ? l.required_documents : [];
  const flags = [['투기과열지구', l.is_speculative_area], ['조정대상지역', l.is_adjusted_area], ['분양가상한제', l.is_price_capped]].filter(([, v]) => v != null);
  return `<div class="wrap page reveal"><div class="breadcrumbs"><a href="#homes">집 찾기</a> / ${esc(h.region)} / 공고 상세</div><div class="detail-layout"><div><div class="detail-title"><div class="tags"><span class="badge">${esc(h.type)}</span><span class="badge orange-badge">${h.status}</span></div><h1>${esc(h.name)}</h1><p>${esc(h.loc)} · ${h.area}</p></div>${galleryHtml(h)}<nav class="detail-nav"><a href="#detail/${h.id}" data-action="scroll-section" data-target="summary">핵심 정보</a><a href="#detail/${h.id}" data-action="scroll-section" data-target="units">면적별 정보</a><a href="#detail/${h.id}" data-action="scroll-section" data-target="conditions">확인할 조건</a><a href="#detail/${h.id}" data-action="scroll-section" data-target="transport">교통·생활</a><a href="#detail/${h.id}" data-action="scroll-section" data-target="document">공고문</a></nav><section id="summary" class="panel detail-box"><h3>공고 핵심 정보</h3><div class="facts">${facts.map(([t, v]) => `<div class="fact"><small>${t}</small><strong>${esc(v)}</strong></div>`).join('')}</div></section><section id="units" class="panel detail-box"><h3>면적별 정보</h3><div id="unit-body">${unitBody(h.id)}</div></section><section id="conditions" class="panel detail-box"><h3>내 조건과 함께 확인할 항목</h3>${flags.map(([t, v]) => `<div class="kv"><span>${t}</span><span class="badge gray">${v ? '해당' : '해당 없음'}</span></div>`).join('')}${['무주택·세대 구성 요건', '공고일 기준 거주 요건', '소득·자산 산정 기준', '청약통장 가입·납입 기준'].map((t) => `<div class="kv"><span>${t}</span><span class="badge gray">공고문 확인</span></div>`).join('')}${docs.length ? `<h3 style="margin-top:24px">제출 서류</h3><ul class="plain-list">${docs.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}<p class="demo-note">정보가 부족한 항목을 충족·미충족으로 확정하지 않습니다.</p></section><section id="transport" class="panel detail-box"><h3>자주 가는 곳까지 얼마나 걸릴까요?</h3><form id="route-form" class="search-row"><input aria-label="목적지" placeholder="예: 서울특별시 강남구 테헤란로 152" value=""><button class="btn" type="submit">경로 보기</button></form><div id="route-output"><p>이 공고 주소에서 목적지까지 대중교통 경로를 조회해요. 주소는 도로명이나 지번으로 입력해 주세요.</p></div></section><section id="document" class="panel detail-box"><h3>원문과 근거를 함께 확인해요</h3>${l.notice_url ? `<p>공고 원문은 공고 기관 사이트에서 확인하세요.</p><a class="btn secondary small" href="${esc(l.notice_url)}" target="_blank" rel="noopener noreferrer" style="margin-top:18px">공고 원문 보기 ↗</a>` : '<p>이 공고는 원문 링크가 없어요. 공고 기관 사이트에서 공고명으로 찾아 확인해 주세요.</p>'}</section></div><aside class="panel detail-aside"><small>${h.priceLabel}</small><strong class="price">${moneyOr(h.price)}</strong>${h.monthlyRent != null ? `<div class="kv"><span>월 임대료</span><strong>${money(h.monthlyRent)}</strong></div>` : ''}<div class="kv"><span>계약금${h.depositIsEstimate ? ' (추정)' : ''}</span><strong>${moneyOr(h.deposit, l.deposit_status || '공고문 확인')}</strong></div><div class="kv"><span>납부 일정</span><strong>원문 확인 필요</strong></div><a class="btn" href="#finance/budget/${h.id}">이 공고로 자금 계산</a><a class="btn secondary" href="#chat/${h.id}">공고 내용 물어보기</a><p class="fine-print">실제 청약 신청이나 자격 확정은 공고 기관에서 진행해요.</p></aside></div></div>`;
};

// 진단 결과: 가점과 추천은 백엔드 계산값이다 (진단을 끝내면 내 정보가 서버에 저장되고 추천이 계산된다)
function result() {
  if (!state.diagnosis) return emptyPage('아직 진단 결과가 없어요', '내 조건을 입력하는 간단한 진단을 먼저 진행해 보세요.', 'diagnosis', '진단 시작하기');
  const a = state.diagnosis;
  const recs = live.recs;
  const score = recs?.length ? recs[0].score : null;
  const mine = rankedRecs();
  const okNow = (r) => ['1순위 가능', '자격 가능'].includes(recStatus(r).label);   // 분양 1순위 가능 + 임대 자격 가능
  const firstN = mine.filter(okNow).length;
  const eligibleN = mine.filter((r) => r.eligible).length;
  // 카드 왼쪽 위 공고 유형으로 골라 보기 (긴 이름은 짧게)
  const kindOf = (r) => r.house.type.replace(/^도시형\/오피스텔\/생활숙박시설\/민간임대\s*/, '');
  const kinds = [...mine.reduce((m, r) => m.set(kindOf(r), (m.get(kindOf(r)) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
  if (live.recsKind && !kinds.some(([k]) => k === live.recsKind)) live.recsKind = null;
  const wanted = mine.filter((r) => (live.recsEligibleOnly !== 'eligible' || r.eligible) && (live.recsEligibleOnly !== 'first' || okNow(r)) && (!live.recsKind || kindOf(r) === live.recsKind));
  if (live.recsSort === 'deadline') {                          // 마감 임박순: 접수 마감일 오름차순(마감일 없는 공고는 뒤로)
    const end = (r) => (r.house.raw?.receipt_end ? new Date(r.house.raw.receipt_end).getTime() : Infinity);
    wanted.sort((x, y) => end(x) - end(y));
  }
  const sortRow = mine.length ? `<div class="recs-kinds" role="group" aria-label="정렬"><span>정렬</span><button type="button" class="hist-chip${live.recsSort === 'deadline' ? '' : ' on'}" data-action="recs-sort" data-value="">추천순</button><button type="button" class="hist-chip${live.recsSort === 'deadline' ? ' on' : ''}" data-action="recs-sort" data-value="deadline">마감 임박순</button></div>` : '';
  const PAGE = 9;
  let recBody;
  if (live.userError) recBody = `<div class="callout">내 조건을 서버에 저장하지 못했어요: ${esc(live.userError)} <button class="btn soft small" data-action="retry-user" style="margin-left:12px">다시 시도</button></div>`;
  else if (!state.user?.id || live.recsLoading || recs === null) recBody = '<div class="empty"><h3>추천 공고를 계산하는 중이에요…</h3></div>';
  else if (live.recsError) recBody = noteBox(`추천을 불러오지 못했어요: ${live.recsError}`);
  else if (!wanted.length) recBody = '<div class="callout">지금 접수 중·예정인 공고 중 희망 조건과 맞는 공고가 없어요. 희망 지역이나 유형을 바꾸거나 전체 공고를 둘러보세요.</div>';
  else recBody = `<div class="grid3">${wanted.slice(0, live.recsShowAll ? wanted.length : PAGE).map((r) => `<div>${houseCard(r.house)}<div class="tags" style="margin-top:10px">${srcBadge(r.house)}<span class="badge ${r.eligible ? '' : 'gray'}">${r.eligible ? '신청 조건 충족' : '조건 미충족'}</span><span class="badge gray">당첨 가능 구간 ${esc(r.band)}</span><span class="badge fp ${recStatus(r).cls}">${esc(recStatus(r).label)}</span>${recBadges(r)}</div>${recStatus(r).notes?.length ? `<ul class="fp-notes">${recStatus(r).notes.slice(0, 3).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>${wanted.length > PAGE ? `<div style="text-align:center;margin-top:24px"><button class="btn secondary" data-action="recs-more">${live.recsShowAll ? '접기' : `추천 공고 ${wanted.length}건 모두 보기`}</button></div>` : ''}`;
  return `<div class="wrap page reveal"><div class="breadcrumbs">청약 진단 / 결과</div><div class="result-banner"><div><div class="eyebrow" style="color:#c1d6c3">YOUR FIRST STEP</div><h2>내 조건이 정리됐어요.</h2><p>${esc(a.age)} · ${esc(a.marriage)} · ${esc(a.ownership)} · ${esc(a.region)} 거주<br>희망 조건: ${esc(a.wish)} · ${esc(typeLabel(a.type))}</p></div><div><small style="color:#c5d7c5">내 청약 가점</small><div class="score">${score ?? '–'}<span> / 84</span></div></div></div><div class="grid2"><section class="panel"><h3>가점은 이렇게 계산돼요</h3><p>무주택 기간, 부양가족 수, 청약통장 가입 기간과 납입 횟수를 서버(백엔드)가 계산한 값이에요.</p><p class="demo-note">연령별 산정·세대원 인정 등 예외 조건을 모두 반영한 실제 자격 판정은 아닙니다.</p><a href="#diagnosis" class="text-link" style="display:block;margin-top:20px">입력 정보 수정 ↗</a></section><section class="panel"><h3>신청 전에 확인할 항목</h3><div class="kv"><span>공고일 기준 세대 정보</span><span class="badge gray">직접 확인</span></div><div class="kv"><span>소득·자산 산정 기준</span><span class="badge gray">직접 확인</span></div><div class="kv"><span>공고별 거주·통장 요건</span><span class="badge gray">원문 확인</span></div></section></div><section class="section"><div class="section-head"><div><h2>내게 맞는 공고 <small style="font-size:15px;color:#748079">${mine.length}건 · 1순위·자격 가능 ${firstN}건 · 신청 자격 충족 ${eligibleN}건</small></h2><p>접수 중·예정 공고 중 희망 지역${typeSet(a.type).size ? `·관심 유형(${esc(typeLabel(a.type))})` : ''} 기준으로 서버가 고른 결과예요. 신청 자격 → 1순위 가능 → 당첨 가능 구간 순서로 보여 드려요. 1순위는 공고마다 다를 수 있어 \"가능성\"으로 안내해요.</p></div>${mine.length ? `<div class="hist-chips" role="group" aria-label="자격으로 보기"><button type="button" class="hist-chip${live.recsEligibleOnly ? '' : ' on'}" data-action="recs-filter" data-value="all">전체 ${mine.length}</button><button type="button" class="hist-chip${live.recsEligibleOnly === 'first' ? ' on' : ''}" data-action="recs-filter" data-value="first">1순위·자격 가능 ${firstN}</button><button type="button" class="hist-chip${live.recsEligibleOnly === 'eligible' ? ' on' : ''}" data-action="recs-filter" data-value="eligible">자금 충족 ${eligibleN}</button></div>` : ''}</div>${sortRow}${kinds.length > 1 ? `<div class="recs-kinds" role="group" aria-label="공고 유형으로 보기"><span>공고 유형</span><button type="button" class="hist-chip${live.recsKind ? '' : ' on'}" data-action="recs-kind" data-value="">전체</button>${kinds.map(([k, n]) => `<button type="button" class="hist-chip${live.recsKind === k ? ' on' : ''}" data-action="recs-kind" data-value="${esc(k)}">${esc(k)} ${n}</button>`).join('')}</div>` : ''}${recBody}</section>${state.user?.member ? '<div class="join-box"><h2>이제 자금 계획을 세워 볼까요?</h2><p>추천 공고별 대출 한도·금리와 필요한 자금을 계산해요.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn" data-action="finance-tab" data-value="대출">내 대출 한도·금리 보기 →</button><button class="btn secondary" data-action="finance-tab" data-value="자금 계산">자금 계획 계산하기 →</button></div></div>' : '<div class="join-box"><h2>내 조건을 저장하고, 다음 단계로.</h2><p>로그인하면 내 정보가 이메일 기준으로 서버에 저장돼요.</p><button class="btn" data-action="signup">결과 저장하고 시작하기 →</button><p style="margin-bottom:0">비밀번호·본인 인증은 아직 없어요. 이메일로 내 정보를 구분합니다.</p></div>'}</div>`;
}

// 내 공간: 내 진단 요약과 다음에 할 일 (진단을 마쳐야 볼 수 있다)
function dashboard() {
  const a = state.diagnosis;
  if (!a) return `<div class="wrap page"><div class="empty">${icon('check')}<h3>내 조건을 한곳에</h3><p>진단을 마치면 진단 요약과 추천 공고, 준비 리포트를 이곳에서 이어볼 수 있어요.</p><a class="btn" href="#diagnosis">진단 시작하기</a></div></div>`;
  return `<div class="wrap page reveal"><div class="welcome"><div><div class="eyebrow">MY SPACE</div><h2>${state.user?.member ? esc(state.user.name) + '님, ' : ''}다음 집을 함께 찾아봐요.</h2><p>진단 결과를 바탕으로 추천 공고와 자금 계획을 이어보세요.</p></div><a class="btn secondary small" href="#result">진단 결과 ↗</a></div><div class="dash-grid"><div><div class="section-head"><h2>다음으로 해볼 일</h2></div><div class="grid2"><a class="feature-panel" href="#homes"><div><h3>공고 둘러보기</h3><p>접수 중인 공고 살펴보기 ↗</p></div>${icon('home')}</a><a class="feature-panel warm" href="#finance"><div><h3>대출·자금 정리</h3><p>내게 맞는 대출 계산 ↗</p></div>${icon('money')}</a></div></div><aside class="dash-aside"><section class="panel"><h3>내 조건 요약</h3><div class="kv"><span>희망 지역</span><strong>${esc(a.wish)}</strong></div><div class="kv"><span>주거 유형</span><strong>${esc(typeLabel(a.type))}</strong></div><div class="kv"><span>보유 현금</span><strong>${money(a.assets)}</strong></div><a href="#profile" class="dash-action">내 정보 관리 <span>→</span></a><a href="#report" class="dash-action">청약 준비 리포트 <span>→</span></a></section></aside></div></div>`;
}

// 금융 정보: 대출은 서버가 내 정보와 선택한 공고로 계산한 결과, 자금 계산은 단순 차액이다.
const FINANCE_TABS = ['대출', '자금 계산'];
function loanPanel() {
  if (!state.diagnosis) return `<div class="empty"><h3>진단을 마치면 내게 맞는 대출을 계산해 드려요</h3><p>내 조건(소득·자산)과 공고의 분양가를 바탕으로 서버가 한도를 계산합니다.</p><a class="btn" href="#diagnosis">진단 시작하기</a></div>`;
  if (live.userError) return `<div class="callout">내 조건을 서버에 저장하지 못했어요: ${esc(live.userError)} <button class="btn soft small" data-action="retry-user" style="margin-left:12px">다시 시도</button></div>`;
  if (!state.user?.id) return '<div class="empty"><h3>내 조건을 서버에 저장하는 중이에요…</h3></div>';
  const candidates = [...new Set([...live.ids, ...live.featured])].map(houseById).filter(Boolean).slice(0, 40);
  if (!candidates.length) return '<div class="empty"><h3>먼저 공고를 골라 주세요</h3><p>대출은 공고의 분양가를 기준으로 계산해요.</p><a class="btn soft" href="#homes">집 찾기</a></div>';
  const cur = live.loan.houseId ?? candidates[0].id;
  const L = live.loan;
  let body;
  if (L.loading) body = '<div class="empty"><h3>대출 상품을 계산하는 중이에요…</h3></div>';
  else if (L.error) body = noteBox(`대출을 불러오지 못했어요: ${L.error}`);
  else if (!L.items?.length) body = '<div class="callout">이 공고와 맞는 대출 상품이 없어요.</div>';
  else body = `<div class="grid3">${L.items.map((p) => `<article class="product-card"><div class="product-top"><div class="product-logo">${esc((p.company_name || p.fin_group || '?')[0])}</div><div><h3>${esc(p.company_name || p.fin_group || '금융사')}</h3><small>${esc(p.product_type || p.category)}</small></div></div><span class="badge gray">${esc(p.name)}</span><div class="product-number" style="font-size:22px">${p.interest_rate_min != null ? `연 ${p.interest_rate_min}${p.interest_rate_max != null && p.interest_rate_max !== p.interest_rate_min ? '~' + p.interest_rate_max : ''}%` : '금리 공시 확인'}</div><p>${p.max_loan != null ? `예상 대출 가능액 ${money(toMan(p.max_loan))}` : p.estimated_limit != null ? `예상 한도 ${money(toMan(p.estimated_limit))}` : esc(p.loan_limit_text || '한도 공시 확인')}</p>${p.covers_shortfall != null ? `<span class="badge ${p.covers_shortfall ? '' : 'gray'}">${p.covers_shortfall ? '부족 자금 충당 가능' : '부족 자금 일부만 충당'}</span>` : ''}${p.note ? `<p style="font-size:12px;color:var(--muted)">${esc(p.note)}</p>` : ''}</article>`).join('')}</div>`;
  return `<div class="field" style="max-width:520px"><label for="loan-house">대출을 계산할 공고</label><select id="loan-house">${candidates.map((h) => `<option value="${h.id}" ${h.id === Number(cur) ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></div>${body}`;
}
function finance(sub, id) {
  if (FINANCE_TABS.includes(sub)) state.finance = sub;
  if (sub === 'budget') state.finance = '자금 계산';
  if (!FINANCE_TABS.includes(state.finance)) state.finance = '대출';
  const tab = state.finance;
  return `<div class="wrap page reveal"><div class="finance-hero"><div><div class="eyebrow">FINANCE FOR EVERYDAY LIFE</div><h1>내 생활에 맞는 금융 정보</h1><p>주거 자금을 계산하고, 내 조건에 맞는 대출을 살펴보세요.</p></div><div class="big-icon">₩</div></div><div class="subnav">${FINANCE_TABS.map((t) => `<button class="chip ${tab === t ? 'active' : ''}" data-action="finance-tab" data-value="${t}">${t}</button>`).join('')}</div>${tab === '자금 계산' ? budget(id) : `<div class="section-head"><div><h2>어떤 자금이 필요한가요?</h2><p>금융감독원 금융상품 공시를 바탕으로 서버가 계산한 결과예요. 실제 신청·승인은 금융사에서 진행해요.</p></div></div>${loanPanel()}`}<div class="callout">대출 한도와 금리는 참고용이며 개인별 대출 승인·한도를 확정하지 않습니다.</div></div>`;
};
function budget(id) {
  const h = houseById(id);
  const assets = Number(state.diagnosis?.assets || 0);
  const cost = h?.price ?? 0;
  const known = [...new Set([...live.ids, ...live.featured])].map(houseById).filter(Boolean).slice(0, 40);
  if (h && !known.includes(h)) known.unshift(h);
  return `<section class="panel"><div class="section-head"><div><h2>주거 자금, 숫자로 정리해요</h2><p>비용과 보유 현금의 단순 차액을 계산합니다.</p></div></div><form id="budget-form" class="calculator"><div><div class="field"><label for="budget-house">공고 선택</label><select id="budget-house"><option value="">직접 입력</option>${known.map((x) => `<option value="${x.id}" ${h?.id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label for="budget-cost">주택 비용 · 만원</label><input id="budget-cost" type="number" min="0" max="1000000" value="${cost}"></div><div class="field"><label for="budget-cash">주거에 쓸 수 있는 현금 · 만원</label><input id="budget-cash" type="number" min="0" max="1000000" value="${assets}"></div><button class="btn" type="submit">필요한 추가 자금 계산 →</button></div><div class="calc-result"><span class="badge">단순 차액 계산</span>${h && h.price == null ? '<p style="font-size:12px;color:var(--muted)">이 공고는 공고문에 금액이 없어요. 주택 비용을 직접 입력해 주세요.</p>' : ''}<p style="margin-top:18px">추가로 마련할 자금</p><strong id="budget-output">${money(Math.max(0, cost - assets))}</strong><p style="font-size:11px;color:var(--muted)">주택 비용 − 보유 현금<br>부대비용·대출 가능액은 포함하지 않습니다.</p></div></form></section>`;
};

// 공고 상담: 서버의 /chat이 공고문 문장을 찾아서(RAG) 근거가 있을 때만 AI가 답한다
function chat(id) {
  const known = [...new Set([...live.ids, ...live.featured])].map(houseById).filter(Boolean).slice(0, 40);
  const h = houseById(id) || known[0];
  if (!h) return '<div class="wrap page"><div class="empty"><h3>상담할 공고를 먼저 골라 주세요</h3><a class="btn" href="#homes">집 찾기</a></div></div>';
  if (!known.includes(h)) known.unshift(h);
  return `<div class="wrap page reveal"><div class="page-title"><div class="eyebrow">ASK WITH CONTEXT</div><h1>공고를 읽다 궁금해졌다면</h1><p>공고를 고르고 질문하면, 공고문에서 찾은 근거와 함께 답해요.</p></div><div class="chat-layout"><aside class="panel chat-side"><h3>참조할 공고</h3><select id="chat-house" aria-label="상담 공고">${known.map((x) => `<option value="${x.id}" ${x.id === h.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><p class="demo-note">공고문 원문이 있는 공고만 근거를 찾아요. 근거가 없으면 모른다고 답해요.</p><h3 style="margin-top:25px">이렇게 물어보세요</h3>${['접수 기간이 언제야?', '신청할 때 필요한 서류가 뭐야?', '중도금이 뭐야?'].map((q) => `<button class="chat-prompt" data-action="prompt" data-value="${q}" data-id="${h.id}">${q} ↗</button>`).join('')}</aside><section class="panel chat-panel"><div class="chat-title"><h3>${esc(h.name)} · 공고 상담</h3></div><div class="messages" id="messages"><div class="message assistant">${esc(h.name)}의 정보를 함께 살펴볼게요.<br>일정, 비용 또는 확인할 조건을 물어보세요.</div>${state.messages.map((m) => `<div class="message ${m.role}">${esc(m.text).replace(/\n/g, '<br>')}${m.evidence?.length ? `<span class="source">근거: ${m.evidence.map(esc).join(' / ')}</span>` : ''}</div>`).join('')}</div><form id="chat-form" class="chat-form" data-id="${h.id}"><input aria-label="공고 질문" placeholder="예: 신청 전에 어떤 조건을 확인하나요?" maxlength="1000" required><button class="btn" type="submit">보내기 ↑</button></form></section></div></div>`;
};
async function answerChat(q, id) {
  if (!q) return;
  id = Number(id);
  state.messages.push({ role: 'user', text: q }, { role: 'assistant', text: '답변을 만드는 중이에요… (AI는 최대 3~4분 걸릴 수 있어요)' });
  const mine = state.messages[state.messages.length - 1];
  go('chat/' + id);
  try {
    const r = await api('/chat/', { method: 'POST', body: { question: q, listing_id: id }, timeout: 300000 });
    mine.text = r.answer; mine.evidence = r.evidence;
  } catch (error) { mine.text = `답변을 가져오지 못했어요: ${error.message}`; }
  go('chat/' + id);
  setTimeout(() => { const m = $('#messages'); if (m) m.scrollTop = m.scrollHeight; }, 0);
};

// 준비 리포트·내 정보
function report() {
  if (!state.diagnosis) return dashboard();
  const a = state.diagnosis, recs = live.recs || [];
  return `<div class="wrap page reveal"><div class="section-head"><div class="page-title" style="margin:0"><div class="eyebrow">YOUR HOME CHECKLIST</div><h1>나의 청약 준비 리포트</h1><p>확인한 조건, 추천 공고와 다음 할 일을 한곳에 정리했어요.</p></div><button class="btn secondary small no-print" data-action="print">PDF로 저장 ↗</button></div><article class="panel"><div class="report-section"><h3>01 · 내 조건</h3><p>${a ? `${esc(a.age)} · ${esc(a.marriage)} · ${esc(a.ownership)} · 희망 지역 ${esc(a.wish)} · ${esc(a.type)}` : '아직 진단 정보가 없습니다. 진단을 완료해 보세요.'}</p>${recs.length ? `<p>내 청약 가점: <b>${recs[0].score}점</b></p>` : ''}<a class="text-link" href="#diagnosis">정보 확인·수정 ↗</a></div><div class="report-section"><h3>02 · 추천 공고</h3>${recs.length ? recs.slice(0, 5).map((r) => `<div class="kv"><a href="#detail/${r.house.id}">${esc(r.house.name)} ↗</a><strong>${r.eligible ? '조건 충족' : '조건 미충족'} · ${esc(r.band)}</strong></div>`).join('') : '<p>추천 결과가 없습니다. 진단을 완료하면 서버가 추천 공고를 계산해요.</p>'}</div><div class="report-section"><h3>03 · 자금 계획</h3><p>주거에 쓸 수 있는 현금: ${money(a?.assets || 0)}</p><p>공고별 납부 일정과 부대비용을 함께 확인해 주세요.</p><a class="text-link" href="#finance/budget">자금 계산하기 ↗</a></div><div class="report-section"><h3>04 · 다음으로 확인할 것</h3><ul class="plain-list"><li>공고일 기준 세대 정보와 주택 소유 이력</li><li>소득·자산 산정 방식과 증빙 서류</li><li>통장 납입 인정 회차와 지역 요건</li><li>접수 마감 시간과 공식 접수처</li></ul></div><p class="demo-note">가점·추천·대출 한도는 입력한 정보를 바탕으로 한 참고용 계산이며 신청 자격이나 대출 승인 결과를 보장하지 않습니다.</p></article></div>`;
};
function profile() {
  if (!state.diagnosis) return dashboard();
  return `<div class="wrap page"><div class="page-title"><h1>내 정보 관리</h1><p>진단 정보를 관리합니다.</p></div><div class="panel">${state.user?.member ? `<div class="kv"><span>이메일</span><strong>${esc(state.user.email)}</strong></div><div class="kv"><span>닉네임</span><strong>${esc(state.user.name)}</strong></div>` : ''}<div class="kv"><span>진단 상태</span><strong>${state.diagnosis ? '완료' : '아직 없음'}</strong></div><a class="btn soft" href="#diagnosis" style="margin-top:25px">진단 정보 수정</a><button class="btn secondary" data-action="delete-diagnosis" style="margin:25px 8px 0">이 브라우저의 진단 정보 삭제</button><p class="demo-note">진단 정보는 추천 계산을 위해 서버(DB)에 저장돼요. 서버에 저장된 정보를 지우는 기능은 아직 없어요.</p></div></div>`;
};
function guide() {
  modal(`<div class="eyebrow">HOW IT WORKS</div><h2>이렇게 이용하세요.</h2><p>각 화면의 버튼을 누르면 다음 단계로 이어집니다.</p><div class="flow-guide">${[['01', '내 조건 진단', '6단계 선택 후 결과 확인', 'diagnosis'], ['02', '추천 결과', '서버가 계산한 가점과 추천 공고', 'result'], ['03', '집 찾기', '필터 → 공고 상세 → 공고 상담', 'homes'], ['04', '금융생활', '대출 계산·자금 계산', 'finance'], ['05', '내 공간·리포트', '진단 요약과 준비 항목 확인', 'dashboard']].map(([n, t, d, r]) => `<button class="flow-card" data-action="guide-go" data-value="${r}"><span class="num">${n}</span><strong>${t} ↗</strong><small>${d}</small></button>`).join('')}</div><p style="margin-bottom:0">공고·대출·AI 답변은 서버에서 가져와요.</p>`, true);
}

// 로그인 창: 처음이면 "결과 저장하고 시작"(이메일·닉네임으로 서버에 저장),
// 이미 저장했다면 "로그인"(이메일·닉네임이 맞으면 서버에 저장된 내 정보를 불러온다). 비밀번호는 없다.
function login() {
  modal(`<div class="eyebrow">SAVE YOUR NEXT STEP</div><h2>내 집 찾기를 이어가요</h2><p>처음이면 <b>결과 저장하고 시작</b>, 이미 저장했다면 같은 이메일·닉네임으로 <b>로그인</b>하세요.<br>비밀번호·본인 인증은 아직 없어요.</p><form id="login-form"><div class="field"><label for="email">이메일</label><input id="email" type="email" placeholder="example@email.com" required value="${esc(state.user?.member ? state.user.email : '')}"></div><div class="field"><label for="nickname">닉네임</label><input id="nickname" placeholder="예: 새싹" value="${esc(state.user?.member ? state.user.name : '')}" maxlength="12" required></div><div style="display:flex;gap:8px"><button class="btn" type="submit" style="flex:1">결과 저장하고 시작 →</button><button class="btn secondary" type="button" data-action="login-submit" style="flex:1">로그인</button></div></form><button class="btn soft" type="button" data-action="login-test" style="width:100%;margin-top:8px">🔑 관리자 테스트 계정으로 바로 로그인</button><p id="login-error" style="margin:14px 0 0;color:#b3402b"></p><p style="margin-top:12px;margin-bottom:0">내 정보는 이메일 기준으로 서버(DB)에 저장돼요.</p>`);
}

/* ───────── 6. 이벤트 연결 (app.js보다 먼저 받도록 capture 단계에서 가로챈다) ───────── */

// 필터 변경 → 서버에 다시 조회
document.addEventListener('change', (e) => {
  const el = e.target;
  if (['filterRegion', 'filterType', 'filterStatus'].includes(el.dataset?.filter)) {
    e.stopImmediatePropagation();
    state[el.dataset.filter] = el.value;
    reloadList();
  } else if (el.id === 'loan-house') {
    e.stopImmediatePropagation();
    loadLoans(Number(el.value));
  }
}, true);

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.id === 'house-search') {                              // 공고명 검색
    e.preventDefault(); e.stopImmediatePropagation();
    state.search = form.querySelector('input').value.trim();
    reloadList();
  } else if (form.id === 'login-form') {                         // 로그인 = 이메일·닉네임으로 서버에 내 정보 저장
    e.preventDefault(); e.stopImmediatePropagation();
    const button = form.querySelector('button'), err = $('#login-error');
    button.disabled = true; button.textContent = '저장하는 중…';
    try {
      await saveProfile($('#email').value.trim(), $('#nickname').value.trim() || '새싹');
      closeModal();
      const next = afterLogin; afterLogin = null;                 // 로그인이 필요해서 열렸다면 하려던 일을 이어서 한다 (restored.js)
      if (next) { render(); next(); } else if (location.hash === '#result') render(); else go('home');   // 로그인 뒤 첫 화면은 메인(그림 있는 화면)
      toast('저장했어요. 다음부터 이 이메일·닉네임으로 로그인할 수 있어요.');
    } catch (error) {
      err.textContent = error.message; button.disabled = false; button.textContent = '다시 시도';
    }
  } else if (form.id === 'route-form') {                         // 공고 주소 → 목적지 대중교통 경로
    e.preventDefault(); e.stopImmediatePropagation();
    const id = Number(location.hash.split('/')[1]), dest = form.querySelector('input').value.trim(), out = $('#route-output');
    if (!dest) { out.innerHTML = '<p>목적지 주소를 입력해 주세요.</p>'; return; }
    out.innerHTML = '<p>경로를 조회하는 중이에요… (최대 1~2분 걸릴 수 있어요)</p>';
    try {
      const r = await api('/commute/', { method: 'POST', body: { origin_listing_id: id, destination_address: dest }, timeout: 180000 });
      live.route = r;                                             // 다른 경로 버튼에서 다시 쓴다
      out.innerHTML = routeHtml(r);
    } catch (error) { out.innerHTML = `<p>경로를 가져오지 못했어요: ${esc(error.message)}</p>`; }
  }
}, true);

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const act = b.dataset.action;
  if (act === 'more-list') { live.listLoading = true; render(); loadHouses(true).then(render); }
  else if (act === 'reload-list') reloadList();
  else if (act === 'clear-filters') {                            // app.js 처리보다 먼저, 서버 조회까지 하도록 가로챈다
    e.stopImmediatePropagation();
    state.filterRegion = state.filterType = '전체'; state.filterStatus = '접수 중·예정'; state.search = '';
    reloadList();
  } else if (act === 'next' && state.step === 5) {               // 진단 마지막 단계: 답변을 저장하고, 서버에 내 정보가 이미 있으면 새 답변으로 갱신한다
    e.stopImmediatePropagation();
    state.diagnosis = { ...state.answers }; save('diagnosis', state.diagnosis);
    live.recs = null;
    live.userTried = false; live.userError = null;
    const finish = () => go('result');
    if (state.user?.id) saveProfile().then(finish).catch((error) => { toast(error.message); finish(); });   // 이미 있으면 새 답변으로 갱신
    else finish();                                                                                              // 없으면 결과 화면에서 자동으로 만든다
  } else if (act === 'signup') {                                // 로그인 창 열기 (app.js 처리보다 먼저)
    e.stopImmediatePropagation(); login();
  } else if (act === 'login-test') {                            // 시연·테스트용: 정해진 관리자 테스트 계정으로 바로 로그인 (없으면 지금 진단 답변으로 만든 뒤 로그인)
    e.stopImmediatePropagation();
    const err = $('#login-error');
    b.disabled = true; b.textContent = '테스트 계정으로 로그인하는 중…'; err.textContent = '';
    try {
      try { await loginWith(TEST_ACCOUNT.email, TEST_ACCOUNT.nickname); }
      catch { await saveProfile(TEST_ACCOUNT.email, TEST_ACCOUNT.nickname); await loginWith(TEST_ACCOUNT.email, TEST_ACCOUNT.nickname); }
      closeModal();
      const next = afterLogin; afterLogin = null;
      if (next) { render(); next(); } else go('home');
      toast(`${state.user.name} 테스트 계정으로 로그인했어요.`);
    } catch (error) {
      err.textContent = error.message; b.disabled = false; b.textContent = '🔑 관리자 테스트 계정으로 바로 로그인';
    }
  } else if (act === 'login-submit') {                          // 이메일·닉네임이 맞으면 로그인
    e.stopImmediatePropagation();
    const form = $('#login-form'), err = $('#login-error');
    if (!form.reportValidity()) return;
    b.disabled = true; b.textContent = '확인하는 중…'; err.textContent = '';
    try {
      await loginWith($('#email').value, $('#nickname').value);
      closeModal();
      const next = afterLogin; afterLogin = null;
      if (next) { render(); next(); } else go('home');
      toast(`${state.user.name}님, 다시 만나 반가워요.`);
    } catch (error) {
      err.textContent = error.message; b.disabled = false; b.textContent = '로그인';
    }
  } else if (act === 'logout') {                                // 로그인 정보와 이 브라우저의 진단 정보를 지운다
    e.stopImmediatePropagation();
    state.diagnosis = null; save('diagnosis', null);
    state.user = null; save('user', null); live.recs = null; live.userTried = false; live.loan = { houseId: null, loading: false, error: null, items: null, key: '' };
    render(); toast('로그아웃했어요.');
  } else if (act === 'recs-more') {                            // 진단 결과: 추천 공고 모두 보기 / 접기
    live.recsShowAll = !live.recsShowAll; render();
  } else if (act === 'recs-kind') {                            // 진단 결과: 공고 유형으로 골라 보기
    live.recsKind = b.dataset.value || null; live.recsShowAll = false; render();
  } else if (act === 'recs-sort') {                            // 진단 결과: 추천순 / 마감 임박순
    live.recsSort = b.dataset.value || null; render();
  } else if (act === 'recs-filter') {                          // 진단 결과: 전체 / 신청 자격 충족만
    live.recsEligibleOnly = b.dataset.value === 'all' ? false : b.dataset.value; live.recsShowAll = false; render();
  } else if (act === 'retry-user') {                            // 내 조건 저장 재시도
    live.userTried = false; live.userError = null; render();
  } else if (act === 'route-alt') {                               // 교통: 추천/다른 경로 바꾸기
    e.stopImmediatePropagation();
    if (live.route) $('#route-output').innerHTML = routeHtml(live.route, Number(b.dataset.value));
  } else if (act === 'unit-tab' || act === 'unit-toggle') {      // 면적별 정보: 주택형 탭 / ㎡↔평 전환
    e.stopImmediatePropagation();
    if (act === 'unit-tab') live.unitPick[b.dataset.id] = Number(b.dataset.value);
    else live.unitPyeong = !live.unitPyeong;
    const box = $('#unit-body');
    if (box) box.innerHTML = unitBody(Number(b.dataset.id));    // 섹션만 다시 그린다
  }
}, true);

/* ───────── 7. render 뒤에 필요한 데이터를 불러온다 ───────── */

// 화면을 그린 직후, 그 화면에 필요한데 아직 없는 데이터만 서버에서 받아 온다.
// 이미 요청한 것은 live.* 플래그로 막아서 render → 요청 → render 무한 반복을 피한다.
const baseRender = render;
render = function () {
  baseRender();
  cardMedia();
  const [route, arg] = (location.hash.slice(1) || 'home').split('/');
  if (route === 'home' && !live.featuredStarted) loadFeatured();
  if (route === 'homes' && !live.listStarted) reloadList();
  if (route === 'detail' || route === 'chat') ensureHouse(arg);
  if (route === 'detail') detailMedia(Number(arg));
  if (route === 'detail') ensureUnits(arg);                      // 면적별 정보
  if (['result', 'report', 'finance', 'dashboard', 'profile'].includes(route) && state.diagnosis && !state.user?.id && !live.userTried) {
    live.userTried = true;
    saveProfile().catch((error) => { live.userError = error.message; }).finally(render);
  }
  if (route === 'result' || route === 'report') { if (state.user?.id && live.recs === null && !live.recsLoading) loadRecs(); }
  if (route === 'finance' && state.finance === '대출' && state.user?.id) {
    if (!live.featuredStarted) loadFeatured();
    const pick = live.loan.houseId ?? [...live.ids, ...live.featured][0];
    if (pick && !live.loan.loading && live.loan.key !== `${state.user.id}:${pick}`) loadLoans(pick);
  }
};

// 이전 버전에서 저장된 예시 공고 번호(1~6)와 닉네임뿐인 로그인 정보는 지금 쓸 수 없어서 한 번만 지운다
if (!read('live-v1', false)) {
  for (const key of ['saved', 'user', 'diagnosis', 'products', 'preferences']) localStorage.removeItem('cydemo-' + key);
  state.user = null; state.diagnosis = null;
  save('live-v1', true);
}
render();
api('/config/public').then((c) => {
  gallery.kakaoKey = c.kakao_javascript_key || '';
  if (gallery.kakaoKey) render();
}).catch(() => {});
