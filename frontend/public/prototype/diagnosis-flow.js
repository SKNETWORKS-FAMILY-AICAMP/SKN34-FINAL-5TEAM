/* 청약 진단 흐름 (app.js 의 diagnosis() 를 바꿔 끼운다)
 *
 * 1) 관심 유형을 가장 먼저 고른다 — 유형마다 필요한 정보가 다르기 때문.
 * 2) 모든 유형에 공통으로 필요한 질문만 단계(기본 정보 → 주택 소유 → 가족 구성 → 소득·자산)로 묻는다.
 * 3) 유형에만 필요한 질문은 그 유형을 고르는 순간 유형 버튼 바로 아래에 펼쳐서 묻는다 (오른쪽 위·아래 '나중에 입력'으로 미룰 수 있음).
 *    - 공공분양·민간분양 → 청약통장 (가입 기간·납입 회차·예치금·5년 내 당첨)
 *    - 공공임대 → 수급·차상위 여부, 총자산(부동산·자동차·금융자산·부채)
 *    - 민간임대 → 추가 질문 없음 (무주택 여부만 보면 됨)
 * 6단계 구성(마지막 '확인')을 유지해서 app.js·landing.js 의 '다음/마지막 단계' 처리와 그대로 맞는다.
 */
(() => {
  const STAGES = ['관심 유형', '기본 정보', '주택 소유', '가족 구성', '소득·자산', '확인'];
  const LEADS = [
    '어떤 집을 찾는지부터 골라 주세요. 유형마다 필요한 정보가 달라서, 필요한 것만 물어볼게요.',
    '모든 유형에 공통으로 필요한 정보예요.',
    '분양·임대 모두 무주택 여부가 가장 중요해요.',
    '가점(부양가족)과 임대 소득 기준(가구원 수)에 쓰여요.',
    '대출 계산과 임대 소득 기준, 계약금 자금 확인에 쓰여요.',
    '입력한 내용을 확인하고 결과를 볼게요.',
  ];
  const FLOWS = {
    account: {
      groups: ['공공분양', '민간분양'], key: 'accountInfo', title: '청약통장 정보', tag: '공공분양 · 민간분양',
      lead: '분양(청약홈·LH 분양)은 청약통장의 가입 기간·납입 회차·예치금으로 1순위와 가점을 정해요.',
    },
    rental: {
      groups: ['공공임대'], key: 'rentalInfo', title: '공공임대 자격 정보', tag: '공공임대',
      lead: '국민임대·행복주택·영구임대 등은 청약통장이 없어도 되는 경우가 많아요. 대신 수급 여부와 총자산(현금+부동산+자동차+금융자산−부채)으로 자격을 봐요.',
    },
  };
  const flow = { open: null, queue: [], advance: false };
  const allGroups = () => [...TYPE_GROUPS];
  const groupsOf = (type) => { const s = typeSet(type); return s.size ? [...s] : allGroups(); };
  // 추가 질문은 '직접 고른' 유형 기준: 아무것도 안 고르면(빈 값) 묻지 않고, '전체'면 모두 묻는다
  const pickedGroups = (type) => (type === '전체' || type == null ? allGroups() : [...typeSet(type)]);
  const neededFlows = (a) => Object.keys(FLOWS).filter((k) => FLOWS[k].groups.some((g) => pickedGroups(a.type).includes(g)));
  const pendingFlows = (a) => neededFlows(a).filter((k) => !a[FLOWS[k].key]);
  const man = (v) => { const n = Number(v) || 0; return n >= 10000 ? `${(n / 10000).toFixed(n % 10000 ? 1 : 0)}억 원` : `${n.toLocaleString('ko-KR')}만 원`; };
  const num = (k, label, hint, attrs = 'min="0" max="10000000" step="100"') => `<div class="field"><label for="${k}">${label}</label><input id="${k}" type="number" ${attrs} value="${state.answers[k] ?? ''}" data-answer="${k}">${hint ? `<small>${hint}</small>` : ''}</div>`;

  // 유형별 추가 정보: 유형 버튼 바로 아래에 펼쳐지는 카드 (창을 띄우지 않아 다른 내용이 가려지지 않게)
  function flowStatus(a) {
    const list = neededFlows(a);
    if (!list.length) return `<p class="flow-none">${pickedGroups(a.type).length ? '고른 유형은 추가로 입력할 정보가 없어요.' : '유형을 고르면 그 유형에만 필요한 질문이 여기에 펼쳐져요.'}</p>`;
    return `<div class="flow-status">${list.map((k) => {
      const f = FLOWS[k]; const v = a[f.key]; const open = flow.open === k;
      const badge = v === '입력' ? '<em class="ok">입력함</em>' : v === '나중에' ? '<em class="later">나중에 입력</em>' : '<em class="todo">아직 안 함</em>';
      if (!open) return `<div class="fs-card"><div class="fs-row"><span><b>${f.title}</b><small>${f.tag}</small></span>${badge}<button type="button" data-action="flow-open" data-value="${k}">${v === '입력' ? '수정' : '지금 입력'}</button></div></div>`;
      return `<div class="fs-card open" id="fs-${k}"><div class="fs-row"><span><span class="dx-tag">${f.tag} 선택</span><b class="fs-title">${f.title}</b></span><button type="button" class="dx-later" data-action="flow-later">나중에 입력</button></div>
        <p class="dx-lead">${f.lead}</p>${modalBody(k)}
        <div class="dx-foot"><span>${flow.queue.length ? `다음: ${FLOWS[flow.queue[0]].title}` : ''}</span><button type="button" class="btn secondary small" data-action="flow-later">나중에 입력</button><button type="button" class="btn small" data-action="flow-save">저장하기</button></div></div>`;
    }).join('')}</div>`;
  }

  function contents(a) {
    return [
      `<div class="field"><label>관심 주거 유형</label>${typeOptions()}</div>${flowStatus(a)}<div class="field"><label>희망 지역</label>${regionSelect('wish', ['전체', ...REGIONS], a.wish, '희망 지역 선택')}</div>`,
      `<div class="field"><label>연령대</label>${options('age', ['20대', '30대', '40대 이상'])}</div><div class="field"><label>세대주 여부</label>${options('head', ['세대주', '세대원', '잘 모르겠어요'])}</div><div class="field"><label>혼인 상태</label>${options('marriage', ['미혼', '신혼', '기혼'])}</div><div class="field"><label>현재 거주 지역</label>${regionSelect('region', REGIONS, a.region, '현재 거주 지역 선택')}</div>`,
      `<div class="field"><label>세대의 주택 소유 상태</label>${options('ownership', ['무주택', '1주택', '2주택 이상', '확인 필요'])}<small>세대 구성원 모두의 소유 이력을 기준으로 해요.</small></div>${a.ownership === '무주택' ? `<div class="field"><label>과거에 집을 가진 적이 있나요? · 세대원 포함</label>${options('firstHome', ['없어요', '있어요'])}<small>한 번도 없으면 생애최초 특별공급·생애최초 정책대출 대상이 될 수 있어요.</small></div>` : ''}${num('years', '무주택 기간 · 년', '만 30세(그 전에 혼인했다면 혼인신고일)부터 세요.', 'min="0" max="30"')}`,
      `${num('family', '부양가족 수 · 본인 제외', '배우자, 3년 이상 같은 주민등록인 부모님, 미혼 자녀를 세요.', 'min="0" max="6"')}<div class="field"><label>미성년 자녀</label>${options('children', ['없음', '1명', '2명 이상'])}</div><div class="field"><label>가구원 수 · 본인 포함, 주민등록상 세대</label>${options('household', HOUSEHOLDS)}<small>공공임대 소득 기준이 가구원 수별로 달라요.</small></div><div class="callout">가족의 이름이나 주민등록번호는 입력하지 않습니다. 숫자와 조건만 입력해요.</div>`,
      `<div class="field"><label>연 소득 · 세전, 대략 구간 (선택)</label>${options('income', INCOME_BANDS)}<small>정확한 금액은 받지 않아요. 정책대출 금리·한도와 임대 소득 기준 판정에 써요.</small></div>${num('assets', '주거에 쓸 수 있는 현금 · 만원', '계약금·보증금으로 바로 쓸 수 있는 돈이에요.')}`,
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
    ];
    return `<div class="dx-summary">${rows.map(([k, v, s]) => `<button type="button" data-action="step" data-id="${s}"><span>${k}</span><b>${esc(String(v ?? '–'))}</b><i>수정</i></button>`).join('')}</div>
      <h3 class="dx-sub">유형별 추가 정보</h3>${flowStatus(a)}
      <div class="callout">결과에서는 선택한 지역·유형과 연결된 공고를 보여 드려요. '나중에 입력'한 정보는 공고마다 '확인 필요'로 안내돼요.</div>`;
  }

  function normalize(a) {
    if (!HOUSEHOLDS.includes(a.household)) a.household = HOUSEHOLDS[Math.min(4, Number(a.family) || 0)];
    if (!INCOME_BANDS.includes(a.income)) a.income = '입력 안 함';
    if (!['없어요', '있어요'].includes(a.firstHome)) a.firstHome = '없어요';
    if (a.ownership === '주택 보유') a.ownership = '1주택';
    if (!['없어요', '있어요', '잘 모르겠어요'].includes(a.won5)) a.won5 = '없어요';
    if (!['있어요', '없어요'].includes(a.hasAccount)) a.hasAccount = '있어요';
    if (!WELFARE.includes(a.welfare)) a.welfare = '아니요';
  }

  diagnosis = function () {
    const a = state.answers;
    normalize(a);
    const body = contents(a)[state.step] || '';
    return `<div class="diagnosis-wrap reveal"><div class="diagnosis-head"><div class="eyebrow" style="justify-content:center">GET TO KNOW YOUR CONDITIONS</div><h1>내 집 찾기, 내 조건부터.</h1><p>관심 유형을 먼저 고르면, 그 유형에 필요한 것만 물어볼게요.</p></div>
      <div class="stepper">${STAGES.map((s, i) => `<button data-action="step" data-id="${i}" class="${i === state.step ? 'current' : i < state.step ? 'done' : ''}"><span>${i < state.step ? '✓' : i + 1}</span>${s}</button>`).join('')}</div>
      <div class="progress"><div style="width:${((state.step + 1) / STAGES.length) * 100}%"></div></div>
      <div class="diagnosis-body"><section class="panel diagnosis-panel"><div class="step-count">STEP 0${state.step + 1} / 0${STAGES.length}</div><h2>${STAGES[state.step]}</h2><p class="description">${LEADS[state.step]}</p>${body}
        <div class="step-actions"><button class="btn secondary" data-action="previous" ${state.step === 0 ? 'disabled' : ''}>이전</button><button class="btn" data-action="next">${state.step === 5 ? '진단 결과 보기' : '다음'} →</button></div></section>
      <aside class="diagnosis-aside"><h3>유형별로 필요한 정보</h3><p>공통 질문은 단계로, 유형에만 필요한 질문은 유형을 고를 때 따로 물어봐요.</p><div class="flow-mini"><div>공공·민간분양 <span>청약통장</span></div><div>공공임대 <span>수급·총자산</span></div><div>민간임대 <span>추가 없음</span></div><div>모든 유형 <span>무주택·가족·소득</span></div></div><p>입력한 조건은 추천 계산을 위해 서버에 저장돼요.</p></aside></div></div>`;
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
  // 펼친 카드 안 숫자 입력: 다시 그리지 않고 값만 저장하고 합계만 바꾼다 (입력 중 포커스가 사라지지 않게)
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!flow.open || !el.closest?.('.fs-card.open') || !el.dataset?.answer) return;
    state.answers[el.dataset.answer] = el.value === '' ? (el.dataset.answer === 'deposit' ? null : 0) : Math.max(0, Number(el.value) || 0);
    const a = state.answers; const out = document.querySelector('[data-asset-sum]');
    if (out) { const t = (Number(a.assets) || 0) + (Number(a.realEstate) || 0) + (Number(a.car) || 0) + (Number(a.otherFin) || 0) - (Number(a.debt) || 0); out.textContent = t >= 10000 ? `${(t / 10000).toFixed(1).replace('.0', '')}억 원` : `${Math.max(t, 0).toLocaleString('ko-KR')}만 원`; }
  });

  render();
})();
