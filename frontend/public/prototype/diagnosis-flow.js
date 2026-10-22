/* 청약 진단 흐름 (app.js 의 diagnosis() 를 바꿔 끼운다)
 *
 * 1) 관심 유형을 가장 먼저 고른다 — 유형마다 필요한 정보가 다르기 때문.
 * 2) 모든 유형에 공통으로 필요한 질문만 단계(기본 정보 → 주택 소유 → 가족 구성 → 소득·자산)로 묻는다.
 * 3) 유형에만 필요한 질문은 그 유형을 고르는 순간 유형 버튼 바로 아래에 펼쳐서 묻는다 (오른쪽 위·아래 '나중에 입력'으로 미룰 수 있음).
 *    - 공공분양·민간분양 → 청약통장 (가입 기간·납입 회차·예치금·5년 내 당첨)
 *    - 공공임대 → 수급·차상위 여부, 총자산(부동산·자동차·금융자산·부채)
 *    - 민간임대 → 추가 질문 없음 (무주택 여부만 보면 됨)
 * 4) 단계마다 답을 해야 '다음'이 나타난다. '나중에 입력하기'를 누르면 답 없이도 '다음'이 나타나고,
 *    비워 둔 값은 마지막 확인 단계에서 기본값으로 채워 계산한다 (확인 화면에 '나중에 입력'으로 표시).
 * 5) 소득·자산 단계에 '대출 추천'(선택) 질문: 받을지 → 목적·필요 금액·상환 기간·지금 대출(종류·금리·잔액).
 * 6단계 구성(마지막 '확인')을 유지해서 app.js·landing.js 의 '다음/마지막 단계' 처리와 그대로 맞는다.
 */
(() => {
  const STAGES = ['관심 유형', '기본 정보', '주택 소유', '가족 구성', '소득·자산', '확인'];
  const LEADS = [
    '어떤 집을 찾는지부터 골라 주세요. 유형마다 필요한 정보가 달라서, 필요한 것만 물어볼게요.',
    '모든 유형에 공통으로 필요한 정보예요.',
    '분양·임대 모두 무주택 여부가 가장 중요해요.',
    '가점(부양가족)과 임대 소득 기준(가구원 수)에 쓰여요.',
    '임대 소득 기준과 계약금 자금 확인에 쓰여요. 원하면 내 조건에 맞는 대출도 추천해 드려요.',
    '입력한 내용을 확인하고 결과를 볼게요.',
  ];
  const FLOWS = {
    account: {
      groups: ['공공분양', '민간분양'], key: 'accountInfo', title: '청약통장 정보', short: '청약통장', tag: '공공분양 · 민간분양', src: ['applyhome', 'lh'],
      lead: '분양(청약홈·LH 분양)은 청약통장의 가입 기간·납입 회차·예치금으로 1순위와 가점을 정해요.',
    },
    rental: {
      groups: ['공공임대'], key: 'rentalInfo', title: '공공임대 자격 정보', short: '임대 자격', tag: '공공임대', src: ['lh', 'sh'],
      lead: '국민임대·행복주택·영구임대 등은 청약통장이 없어도 되는 경우가 많아요. 대신 수급 여부와 총자산(현금+부동산+자동차+금융자산−부채)으로 자격을 봐요.',
    },
  };
  const flow = { open: null, queue: [], advance: false };

  /* ── 단계별 필수 답: 다 답했거나 '나중에 입력하기'를 눌러야 '다음'이 나타난다 ── */
  const REQUIRED = [['type'], ['age', 'head', 'marriage', 'region'], ['ownership', 'years'], ['family', 'children', 'household'], ['income', 'assets'], []];
  // '나중에 입력'으로 비워 둔 값을 결과 계산 때 채우는 기본값 (확인 화면에서는 '나중에 입력'으로 보여 준다)
  const FALLBACK = { type: '전체', wish: '전체', age: '30대', head: '잘 모르겠어요', marriage: '미혼', region: '서울', ownership: '확인 필요', years: 0, family: 0, children: '없음', household: '1인', income: '입력 안 함', assets: 0 };
  const blank = (v) => v == null || v === '';
  function filled(a, k) {
    if (k === 'type') return a.type === '전체' || typeSet(a.type).size > 0;
    if (k === 'years' && a.ownership !== '무주택') return true;   // 무주택일 때만 기간을 묻는다
    return !blank(a[k]);
  }
  const later = (a) => (Array.isArray(a.laterSteps) ? a.laterSteps : []);
  const stepDone = (a, i) => REQUIRED[i].every((k) => filled(a, k)) || later(a).includes(i);
  const firstOpen = (a) => { for (let i = 0; i < 5; i += 1) if (!stepDone(a, i)) return i; return 5; };
  // 처음 진단하는 사람은 미리 골라진 값 없이 빈 칸에서 시작한다 (예전 진단이 있으면 그 값을 그대로 보여 줌)
  const dx = { fresh: false };
  function startFresh(a) {
    if (dx.fresh || state.diagnosis) return;
    dx.fresh = true;
    REQUIRED.flat().forEach((k) => { a[k] = k === 'type' ? '' : null; });
    a.wish = null; a.laterSteps = [];
  }
  function fillLater(a) {   // 확인 단계: 비워 둔 값만 기본값으로 (답한 값은 그대로)
    Object.entries(FALLBACK).forEach(([k, v]) => { if (k === 'type' ? !filled(a, 'type') : blank(a[k])) a[k] = v; });
    if (blank(a.household)) a.household = FALLBACK.household;
  }
  function actionBar(a) {
    const i = state.step;
    const prev = `<button class="btn secondary" data-action="previous" ${i === 0 ? 'disabled' : ''}>이전</button>`;
    if (i === 5) return `${prev}<span class="sa-right"><button class="btn" data-action="next">진단 결과 보기 →</button></span>`;
    if (stepDone(a, i)) {
      const skipped = later(a).includes(i) && !REQUIRED[i].every((k) => filled(a, k));
      return `${prev}<span class="sa-right">${skipped ? '<em class="sa-later">나중에 입력</em>' : ''}<button class="btn" data-action="next">다음 →</button></span>`;
    }
    return `${prev}<span class="sa-right"><small class="sa-hint">답을 고르면 다음 버튼이 나타나요</small><button type="button" class="btn secondary sa-skip" data-action="step-later">나중에 입력하기</button></span>`;
  }
  const refreshBar = () => { const bar = document.querySelector('.step-actions'); const html = actionBar(state.answers); if (bar && bar.dataset.state !== html) { bar.innerHTML = html; bar.dataset.state = html; } };   // 같으면 건드리지 않는다 (누르는 중인 버튼이 사라지지 않게)
  const pickRegion = (key, values, label) => { const v = state.answers[key]; return `<select aria-label="${label}" data-region-answer="${key}">${blank(v) ? '<option value="" selected disabled>선택해 주세요</option>' : ''}${values.map((x) => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`; };
  const allGroups = () => [...TYPE_GROUPS];
  const groupsOf = (type) => { const s = typeSet(type); return s.size ? [...s] : allGroups(); };
  // 추가 질문은 '직접 고른' 유형 기준: 아무것도 안 고르면(빈 값) 묻지 않고, '전체'면 모두 묻는다
  const pickedGroups = (type) => (type === '전체' || type == null ? allGroups() : [...typeSet(type)]);
  const neededFlows = (a) => Object.keys(FLOWS).filter((k) => FLOWS[k].groups.some((g) => pickedGroups(a.type).includes(g)));
  const pendingFlows = (a) => neededFlows(a).filter((k) => !a[FLOWS[k].key]);
  const man = (v) => { const n = Number(v) || 0; return n >= 10000 ? `${(n / 10000).toFixed(n % 10000 ? 1 : 0)}억 원` : `${n.toLocaleString('ko-KR')}만 원`; };
  const num = (k, label, hint, attrs = 'min="0" max="10000000" step="100"') => `<div class="field"><label for="${k}">${label}</label><input id="${k}" type="number" ${attrs} value="${state.answers[k] ?? ''}" data-answer="${k}">${hint ? `<small>${hint}</small>` : ''}</div>`;

  // 관심 유형 버튼: 이름 아래에 공고 출처(청약홈·LH·SH) 배지와, 고르면 더 묻는 정보를 작게 표시
  const TYPE_INFO = {
    공공분양: { src: ['applyhome', 'lh'], extra: '청약통장', ex: '국민주택·신혼희망타운·LH 분양' },
    민간분양: { src: ['applyhome'], extra: '청약통장', ex: '민영 아파트·오피스텔·무순위' },
    공공임대: { src: ['lh', 'sh'], extra: '수급·총자산', ex: '국민·행복·영구·매입임대' },
    민간임대: { src: ['applyhome'], extra: '추가 질문 없음', ex: '공공지원민간임대 등' },
  };
  const SRC_NAME = { applyhome: '청약홈', lh: 'LH', sh: 'SH' };
  // 유형 버튼 맨 아래 한 줄: 이 유형을 고르면 필요한 추가 정보와 그 상태 (모든 버튼에서 같은 높이에 맞춘다)
  function extraLine(g) {
    const k = Object.keys(FLOWS).find((x) => FLOWS[x].groups.includes(g));
    if (!k) return '<span class="tc-extra none">추가 정보 없음</span>';
    const v = state.answers[FLOWS[k].key];
    const name = FLOWS[k].short;
    if (v === '입력') return `<span class="tc-extra ok">✓ ${name} 입력됨</span>`;
    if (v === '나중에') return `<span class="tc-extra later">${name} 나중에</span>`;
    return `<span class="tc-extra">${name} 입력 필요</span>`;
  }
  typeOptions = function () {
    const t = state.answers.type; const all = t === '전체' || t == null; const picked = all ? new Set(TYPE_GROUPS) : typeSet(t);
    return `<p class="type-help">필요한 유형만 <b>여러 개</b> 고를 수 있어요. <b>전체</b>를 체크하면 모든 유형이 선택되고, 한 번 더 누르면 모두 풀려요.</p>
      <label class="type-all"><input type="checkbox" data-action="type-all" ${all ? 'checked' : ''}> 전체 유형 보기</label>
      <div class="options type-options type-cards">${TYPE_GROUPS.map((g) => { const info = TYPE_INFO[g] || { src: [], extra: '', ex: '' }; const on = picked.has(g); return `<button type="button" class="option ${on ? 'selected' : ''}" data-action="type-toggle" data-value="${g}" aria-pressed="${on}">
        <span class="tc-name">${on ? '✓ ' : ''}${g}</span>
        <span class="tc-src">${info.src.map((x) => `<i class="src-badge src-${x}">${SRC_NAME[x]}</i>`).join('')}</span>
        <span class="tc-ex">${info.ex}</span>
        ${extraLine(g)}</button>`; }).join('')}</div>
      ${picked.size ? '' : '<small class="type-empty">아무 유형도 고르지 않으면 전체 유형으로 보여 드려요.</small>'}`;
  };

  // 유형별 추가 정보: 유형 버튼 바로 아래에 펼쳐지는 카드 (창을 띄우지 않아 다른 내용이 가려지지 않게)
  function flowStatus(a) {
    const list = neededFlows(a);
    if (!list.length) return `<p class="flow-none">${pickedGroups(a.type).length ? '고른 유형은 추가로 입력할 정보가 없어요.' : '유형을 고르면 그 유형에만 필요한 질문이 여기에 펼쳐져요.'}</p>`;
    return `<div class="flow-status">${list.map((k) => {
      const f = FLOWS[k]; const v = a[f.key]; const open = flow.open === k;
      const badge = v === '입력' ? '<em class="ok">입력함</em>' : v === '나중에' ? '<em class="later">나중에 입력</em>' : '<em class="todo">아직 안 함</em>';
      const mine = f.groups.filter((g) => pickedGroups(a.type).includes(g));   // 고른 유형만, 그 유형의 공고 출처만
      const srcs = [...new Set(mine.flatMap((g) => TYPE_INFO[g]?.src || []))];
      const tags = `<span class="fs-tags">${mine.map((g) => `<i class="fs-type">${g}</i>`).join('')}${srcs.map((x) => `<i class="src-badge src-${x}">${SRC_NAME[x]}</i>`).join('')}</span>`;
      if (!open) return `<div class="fs-card"><div class="fs-row"><span><b>${f.title}</b>${tags}</span>${badge}<button type="button" data-action="flow-open" data-value="${k}">${v === '입력' ? '수정' : '지금 입력'}</button></div></div>`;
      return `<div class="fs-card open" id="fs-${k}"><div class="fs-row"><span>${tags}<b class="fs-title">${f.title}</b></span><button type="button" class="dx-later" data-action="flow-later">나중에 입력</button></div>
        <p class="dx-lead">${f.lead}</p>${modalBody(k)}
        <div class="dx-foot"><span>${flow.queue.length ? `다음: ${FLOWS[flow.queue[0]].title}` : ''}</span><button type="button" class="btn secondary small" data-action="flow-later">나중에 입력</button><button type="button" class="btn small" data-action="flow-save">저장하기</button></div></div>`;
    }).join('')}</div>`;
  }

  function contents(a) {
    return [
      `<div class="field"><label>관심 주거 유형</label>${typeOptions()}</div>${flowStatus(a)}<div class="field"><label>희망 지역</label>${pickRegion('wish', ['전체', ...REGIONS], '희망 지역 선택')}<small>비워 두면 전체 지역으로 보여 드려요.</small></div>`,
      `<div class="field"><label>연령대</label>${options('age', ['20대', '30대', '40대 이상'])}</div><div class="field"><label>세대주 여부</label>${options('head', ['세대주', '세대원', '잘 모르겠어요'])}</div><div class="field"><label>혼인 상태</label>${options('marriage', ['미혼', '신혼', '기혼'])}</div><div class="field"><label>현재 거주 지역</label>${pickRegion('region', REGIONS, '현재 거주 지역 선택')}</div>`,
      `<div class="field"><label>세대의 주택 소유 상태</label>${options('ownership', ['무주택', '1주택', '2주택 이상', '확인 필요'])}<small>세대 구성원 모두의 소유 이력을 기준으로 해요.</small></div>${a.ownership === '무주택' ? `<div class="field"><label>과거에 집을 가진 적이 있나요? · 세대원 포함</label>${options('firstHome', ['없어요', '있어요'])}<small>한 번도 없으면 생애최초 특별공급·생애최초 정책대출 대상이 될 수 있어요.</small></div>` : ''}${num('years', '무주택 기간 · 년', '만 30세(그 전에 혼인했다면 혼인신고일)부터 세요.', 'min="0" max="30"')}`,
      `${num('family', '부양가족 수 · 본인 제외', '배우자, 3년 이상 같은 주민등록인 부모님, 미혼 자녀를 세요.', 'min="0" max="6"')}<div class="field"><label>미성년 자녀</label>${options('children', ['없음', '1명', '2명 이상'])}</div><div class="field"><label>가구원 수 · 본인 포함, 주민등록상 세대</label>${options('household', HOUSEHOLDS)}<small>공공임대 소득 기준이 가구원 수별로 달라요.</small></div><div class="callout">가족의 이름이나 주민등록번호는 입력하지 않습니다. 숫자와 조건만 입력해요.</div>`,
      `<div class="field"><label>연 소득 · 세전, 대략 구간 (선택)</label>${options('income', INCOME_BANDS)}<small>정확한 금액은 받지 않아요. 정책대출 금리·한도와 임대 소득 기준 판정에 써요.</small></div>${num('assets', '주거에 쓸 수 있는 현금 · 만원', '계약금·보증금으로 바로 쓸 수 있는 돈이에요.')}${loanBlock(a)}`,
      summary(a),
    ];
  }

  function summary(a) {
    const rows = [
      ['관심 유형', typeLabel(a.type), 0], ['희망 지역', a.wish, 0],
      ['기본 정보', `${a.age} · ${a.marriage} · ${a.head} · ${a.region} 거주`, 1],
      ['주택 소유', a.ownership === '무주택' ? `무주택 ${a.years ?? 0}년${a.firstHome === '있어요' ? ' (과거 소유)' : ''}` : a.ownership, 2],
      ['가족', `부양가족 ${a.family ?? 0}명 · 자녀 ${a.children} · ${a.household}`, 3],
      ['소득·현금', `${a.income} · 현금 ${man(a.assets)}`, 4],
      ['대출 추천', loanSummary(a), 4],
    ];
    const skipped = later(a);
    return `<div class="dx-summary">${rows.map(([k, v, s]) => `<button type="button" data-action="step" data-id="${s}"><span>${k}</span><b>${skipped.includes(s) && k !== '대출 추천' ? '<em class="sa-later">나중에 입력</em> 기본값으로 계산' : esc(String(v ?? '–'))}</b><i>수정</i></button>`).join('')}</div>
      <h3 class="dx-sub">유형별 추가 정보</h3>${flowStatus(a)}
      <div class="callout">결과에서는 선택한 지역·유형과 연결된 공고를 보여 드려요. '나중에 입력'한 정보는 공고마다 '확인 필요'로 안내돼요.</div>`;
  }

  /* ── 대출 추천 (선택): 받을지 고른 사람에게만 목적·금액·기간·지금 대출을 묻는다 ── */
  const LOAN_PURPOSE = ['집 사기', '전세·임대 보증금', '대출 갈아타기'];
  const LOAN_TERM = ['10년', '20년', '30년', '잘 모르겠어요'];
  const LOAN_TYPE = ['주택담보대출', '전세자금대출', '신용대출', '정책대출', '기타'];
  const LOAN_RATE = ['3% 미만', '3%대', '4%대', '5%대', '6% 이상'];
  const CREDIT_BAND = ['900점 초과', '801~900점', '701~800점', '601~700점', '600점 이하', '잘 모르겠어요'];
  function loanBlock(a) {
    const on = a.loanWanted === '받을래요';
    const head = `<div class="fs-row"><span><span class="fs-tags"><i class="fs-type">선택</i></span><b class="fs-title">대출 추천도 받을래요?</b></span></div>
      <p class="dx-lead">답해 주시면 정책대출(디딤돌 등)과 은행 대출 중 내 소득·신용점수·상환 기간·지금 대출에 맞는 상품을 골라 드려요. 추천이 필요 없으면 '괜찮아요'를 고르세요.</p>
      ${options('loanWanted', ['받을래요', '괜찮아요'])}`;
    if (!on) return `<div class="fs-card open loan-card">${head}</div>`;
    const has = a.loanHas === '있어요';
    return `<div class="fs-card open loan-card">${head}
      <div class="field"><label>대출이 필요한 곳</label>${options('loanPurpose', LOAN_PURPOSE)}<small>분양·매매는 주택담보·디딤돌, 전세·임대는 전세자금대출 위주로 보여 드려요. 갈아타기는 지금보다 금리가 낮은 상품만 보여요.</small></div>
      ${num('loanNeed', '필요한 대출 금액 · 만원 (선택)', '모르면 비워 두세요. 공고 가격에서 현금을 뺀 금액으로 계산해요.', 'min="0" max="200000" step="100"')}<div class="field"><label>원하는 상환 기간</label>${options('loanTerm', LOAN_TERM)}<small>길수록 월 상환액이 줄어 받을 수 있는 한도가 커져요.</small></div>
      <div class="field"><label>신용점수 · 대략</label>${options('creditBand', CREDIT_BAND)}<small>토스·카카오뱅크·은행 앱에서 무료로 볼 수 있어요 (NICE·KCB 1000점 기준). 신용점수를 조회하지 않고, 고른 구간만 저장해 신용대출 금리를 골라요.</small></div>
      <div class="field"><label>지금 받고 있는 대출이 있나요?</label>${options('loanHas', ['없어요', '있어요'])}<small>지금 갚고 있는 금액만큼 소득 기준 한도(DSR)가 줄어들어요.</small></div>
      ${has ? `<div class="field"><label>대출 종류</label>${options('loanType', LOAN_TYPE)}</div>
      <div class="field"><label>금리 · 대략</label>${options('loanRate', LOAN_RATE)}<small>이보다 금리가 낮은 상품은 '지금보다 낮아요'로 표시해요.</small></div>
      ${num('loanBalance', '남은 대출 금액 · 만원', '은행 앱의 대출 잔액이에요.', 'min="0" max="500000" step="100"')}` : ''}</div>`;
  }
  function loanSummary(a) {
    if (a.loanWanted !== '받을래요') return a.loanWanted === '괜찮아요' ? '받지 않음' : '답하지 않음';
    const parts = [a.loanPurpose, a.loanTerm && a.loanTerm !== '잘 모르겠어요' ? `${a.loanTerm} 상환` : null, Number(a.loanNeed) > 0 ? `${man(a.loanNeed)} 필요` : null];
    if (a.creditBand && a.creditBand !== '잘 모르겠어요') parts.push(`신용 ${a.creditBand}`);
    if (a.loanHas === '있어요') parts.push(`지금 ${a.loanType || '대출'} ${a.loanRate || ''} ${Number(a.loanBalance) > 0 ? man(a.loanBalance) : ''}`.replace(/\s+/g, ' ').trim());
    else if (a.loanHas === '없어요') parts.push('지금 대출 없음');
    return parts.filter(Boolean).join(' · ') || '받을래요';
  }

  function normalize(a) {
    if (!blank(a.household) && !HOUSEHOLDS.includes(a.household)) a.household = HOUSEHOLDS[Math.min(4, Number(a.family) || 0)];
    if (!blank(a.income) && !INCOME_BANDS.includes(a.income)) a.income = '입력 안 함';
    if (!['없어요', '있어요'].includes(a.firstHome)) a.firstHome = '없어요';
    if (a.ownership === '주택 보유') a.ownership = '1주택';
    if (!['없어요', '있어요', '잘 모르겠어요'].includes(a.won5)) a.won5 = '없어요';
    if (!['있어요', '없어요'].includes(a.hasAccount)) a.hasAccount = '있어요';
    if (!WELFARE.includes(a.welfare)) a.welfare = '아니요';
  }

  diagnosis = function () {
    const a = state.answers;
    startFresh(a);
    if (state.step > firstOpen(a)) state.step = firstOpen(a);   // 아직 안 끝낸 단계를 건너뛰지 않게
    if (state.step === 5) fillLater(a);
    normalize(a);
    const body = contents(a)[state.step] || '';
    return `<div class="diagnosis-wrap reveal"><div class="diagnosis-head"><div class="eyebrow" style="justify-content:center">GET TO KNOW YOUR CONDITIONS</div><h1>내 집 찾기, 내 조건부터.</h1><p>관심 유형을 먼저 고르면, 그 유형에 필요한 것만 물어볼게요.</p></div>
      <div class="stepper">${STAGES.map((s, i) => `<button data-action="step" data-id="${i}" class="${i === state.step ? 'current' : i < state.step ? 'done' : ''}" ${i > firstOpen(a) ? 'disabled' : ''}><span>${i < state.step ? '✓' : i + 1}</span>${s}</button>`).join('')}</div>
      <div class="progress"><div style="width:${((state.step + 1) / STAGES.length) * 100}%"></div></div>
      <div class="diagnosis-body dx-single"><section class="panel diagnosis-panel dx-bare"><div class="step-count">STEP 0${state.step + 1} / 0${STAGES.length}</div><h2>${STAGES[state.step]}</h2><p class="description">${LEADS[state.step]}</p>${body}
        <div class="step-actions" data-state="${esc(actionBar(a))}">${actionBar(a)}</div></section>
      </div></div>`;
  };

  /* ── 유형별 질문 창 ── */
  function modalBody(k) {
    const a = state.answers;
    if (k === 'account') {
      return `<div class="field"><label>청약통장이 있나요?</label>${options('hasAccount', ['있어요', '없어요'])}<small>주택청약종합저축(또는 청약저축·예금·부금)을 말해요.</small></div>
        ${a.hasAccount === '있어요' ? `<div class="dx-grid">${num('account', '가입 기간 · 년', '은행 앱에서 가입일을 확인할 수 있어요.', 'min="0" max="30"')}${num('payments', '납입 인정 회차', '국민주택(공공분양) 1순위·순위 판정에 써요.', 'min="0" max="500"')}${num('deposit', '통장 잔액(예치금) · 만원', '민영주택 1순위 예치금 기준 (예: 서울 85㎡ 이하 300만 원)', 'min="0" max="100000" step="10"')}</div>
        <div class="field"><label>최근 5년 안에 청약에 당첨된 적이 있나요? · 세대원 포함</label>${options('won5', ['없어요', '있어요', '잘 모르겠어요'])}<small>투기과열지구·조정대상지역에서는 5년 안 당첨 이력이 있으면 1순위가 될 수 없어요.</small></div>` : '<p class="dx-note">통장이 없으면 무순위·임의공급(통장 없이 신청) 공고와 임대 공고 위주로 보여 드려요. 통장을 만들면 가입 기간 가점이 쌓이기 시작해요.</p>'}`;
    }
    const t = (Number(a.assets) || 0) + (Number(a.realEstate) || 0) + (Number(a.car) || 0) + (Number(a.otherFin) || 0) - (Number(a.debt) || 0);
    return `<div class="field"><label>기초생활수급·차상위 여부</label>${options('welfare', WELFARE)}<small>영구임대·매입임대는 수급자·차상위 가구가 우선 대상이에요. 증명은 공고 신청 때 해요.</small></div>
      <div class="field"><label>총자산 · 만원</label><small style="margin:0 0 10px">주거에 쓸 현금(${man(a.assets)})에 아래를 더하고 부채를 빼서 계산해요. 없으면 0으로 두세요.</small>
      <div class="dx-grid">${num('realEstate', '부동산 가액', '토지·건물·분양권 (공시가격)')}${num('car', '자동차 가액', '보험 기준 차량 가액')}${num('otherFin', '현금 외 금융자산', '예금·주식·펀드 등')}${num('debt', '부채', '주택담보·신용대출 등')}</div>
      <p class="asset-sum">총자산 약 <b data-asset-sum>${t >= 10000 ? `${(t / 10000).toFixed(1).replace('.0', '')}억 원` : `${Math.max(t, 0).toLocaleString('ko-KR')}만 원`}</b> <small>· 국민임대·행복주택(신혼) 3.45억, 행복주택 청년 2.51억 이하 · 자동차 4,542만 원 이하</small></p></div>`;
  }
  function reveal(k) {   // 펼친 카드가 화면에 보이게
    requestAnimationFrame(() => document.getElementById(`fs-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  function openFlows(keys, advance = false) {
    const list = [...new Set(keys)].filter((k) => FLOWS[k]);
    if (!list.length) return false;
    flow.open = list[0]; flow.queue = list.slice(1); flow.advance = advance;
    render(); reveal(flow.open);
    return true;
  }
  function closeFlow(value) {
    const a = state.answers; const f = FLOWS[flow.open];
    a[f.key] = value;
    if (flow.open === 'rental') a.assetDetail = value === '입력' ? '자세히 입력할게요' : '나중에 할게요';
    if (flow.queue.length) { flow.open = flow.queue.shift(); render(); reveal(flow.open); return; }
    flow.open = null;
    if (flow.advance && state.step === 0) { state.step = 1; window.scrollTo(0, 0); }
    flow.advance = false;
    render();
  }
  window.openDiagnosisFlow = (k) => openFlows([k]);


  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const act = b.dataset.action;
    const inDx = !!b.closest('.diagnosis-wrap');
    if (inDx && act === 'step-later') {   // 이 단계는 나중에: 답이 없어도 '다음'이 나타난다
      e.preventDefault(); e.stopImmediatePropagation();
      const a = state.answers; a.laterSteps = [...new Set([...later(a), state.step])];
      refreshBar(); document.querySelector('.step-actions [data-action="next"]')?.focus();
      return;
    }
    if (inDx && act === 'step' && Number(b.dataset.id) > firstOpen(state.answers)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (inDx && act === 'next' && state.step < 5 && !stepDone(state.answers, state.step)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (inDx && act === 'answer') {   // 답을 고르면 '나중에' 표시를 지운다
      const step = state.step;
      setTimeout(() => { const a = state.answers; if (REQUIRED[step].every((k) => filled(a, k))) { a.laterSteps = later(a).filter((x) => x !== step); render(); } }, 0);
    }
    if (act === 'flow-open') { e.preventDefault(); e.stopImmediatePropagation(); openFlows([b.dataset.value]); return; }
    if (act === 'flow-save') { e.preventDefault(); e.stopImmediatePropagation(); closeFlow('입력'); return; }
    if (act === 'flow-later') { e.preventDefault(); e.stopImmediatePropagation(); closeFlow('나중에'); return; }
    // 유형을 새로 고르면 그 유형에만 필요한 질문 창을 바로 연다 (app.js 가 값을 바꾼 다음에 비교)
    if (act === 'type-toggle' || act === 'type-all') {
      const before = new Set(pickedGroups(state.answers.type));
      const explicitBefore = typeSet(state.answers.type).size > 0 || state.answers.type === '전체';
      setTimeout(() => {
        // 유형을 빼서 더 이상 필요 없는 카드는 닫는다
        const need = neededFlows(state.answers);
        flow.queue = flow.queue.filter((k) => need.includes(k));
        if (flow.open && !need.includes(flow.open)) { flow.open = flow.queue.shift() || null; render(); }
        const after = pickedGroups(state.answers.type);
        const added = after.filter((g) => !before.has(g));
        if (!added.length) return;
        const keys = Object.keys(FLOWS).filter((k) => FLOWS[k].groups.some((g) => added.includes(g)) && state.answers[FLOWS[k].key] !== '입력' && k !== flow.open);
        if (keys.length) openFlows(flow.open ? [flow.open, ...keys] : keys);
      }, 0);
      return;
    }
    // 1단계에서 '다음': 고른 유형의 질문을 아직 안 봤으면 먼저 보여 주고, 다 끝나면 다음 단계로
    if (act === 'next' && state.step === 0 && (location.hash.slice(1).split('/')[0] === 'diagnosis' || location.hash === '#start' || location.hash === '')) {
      const keys = pendingFlows(state.answers);
      if (keys.length) { e.preventDefault(); e.stopImmediatePropagation(); openFlows(keys, true); }
    }
  }, true);
  // 단계의 숫자·지역 입력: 다시 그리지 않고 값만 저장하고 '다음' 버튼만 바꾼다 (빈 칸은 0이 아니라 '답 안 함')
  function stepInput(el) {
    if (flow.open && el.closest?.('.fs-card.open:not(.loan-card)')) return false;
    if (!el.closest?.('.diagnosis-wrap')) return false;
    const k = el.dataset?.answer || el.dataset?.regionAnswer;
    if (!k) return false;
    state.answers[k] = el.value === '' ? null : el.dataset.answer ? Math.max(Number(el.min || 0), Math.min(Number(el.max || 1e9), Number(el.value) || 0)) : el.value;
    const a = state.answers;
    if (REQUIRED[state.step]?.every((x) => filled(a, x))) a.laterSteps = later(a).filter((x) => x !== state.step);
    refreshBar();
    return true;
  }
  document.addEventListener('input', (e) => { if (e.target.dataset?.answer) stepInput(e.target); }, true);
  document.addEventListener('change', (e) => { if (stepInput(e.target)) { if (e.target.dataset.answer && e.target.value !== '') e.target.value = state.answers[e.target.dataset.answer]; e.stopImmediatePropagation(); } }, true);

  // 펼친 카드 안 숫자 입력: 다시 그리지 않고 값만 저장하고 합계만 바꾼다 (입력 중 포커스가 사라지지 않게)
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!flow.open || !el.closest?.('.fs-card.open:not(.loan-card)') || !el.dataset?.answer) return;
    state.answers[el.dataset.answer] = el.value === '' ? (el.dataset.answer === 'deposit' ? null : 0) : Math.max(0, Number(el.value) || 0);
    const a = state.answers; const out = document.querySelector('[data-asset-sum]');
    if (out) { const t = (Number(a.assets) || 0) + (Number(a.realEstate) || 0) + (Number(a.car) || 0) + (Number(a.otherFin) || 0) - (Number(a.debt) || 0); out.textContent = t >= 10000 ? `${(t / 10000).toFixed(1).replace('.0', '')}억 원` : `${Math.max(t, 0).toLocaleString('ko-KR')}만 원`; }
  });

  render();
})();
