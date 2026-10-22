/* 진단 기록 — 진단을 마칠 때마다 서버에 한 건씩 저장하고(가점·추천 수는 서버 계산),
   · 진단 결과 화면: 날짜별 기록 목록 + 2건 이상 골라 "필요한 기준만" 나란히 비교
   · 내 공간: 맨 위에 최근 진단 카드(눈에 띄게) — 결과 보기 / 기록 비교로 바로 이동
   index.html 에서 landing.js 다음에 불러온다 (render 를 한 번 더 감싼다). */
(function () {
  const hist = { records: null, loadingFor: 0, pending: false, posting: false, selected: new Set(), scrollTo: false, showAll: false, viewId: null };
  const LIST_PAGE = 5;   // 기록이 많아도 처음엔 최근 5건만 (아래 추천 공고가 너무 밀리지 않게)

  // 비교 기준: key → [이름, 값 꺼내기, 숫자 비교 여부]
  const CRITERIA = {
    score: ['청약 가점', (r) => r.score, true, (v) => `${v}점`],
    recommend: ['추천 공고', (r) => r.recommend_count, true, (v) => `${v}건`],
    eligible: ['신청 자격 충족', (r) => r.eligible_count, true, (v) => `${v}건`],
    years: ['무주택 기간', (r) => r.answers.years, true, (v) => `${v}년`],
    family: ['부양가족', (r) => r.answers.family, true, (v) => `${v}명`],
    account: ['청약통장 가입', (r) => r.answers.account, true, (v) => `${v}년`],
    payments: ['납입 회차', (r) => r.answers.payments, true, (v) => `${v}회`],
    assets: ['주거 자금', (r) => r.answers.assets, true, (v) => money(v)],
    age: ['연령대', (r) => r.answers.age],
    marriage: ['혼인 상태', (r) => r.answers.marriage],
    head: ['세대주', (r) => r.answers.head],
    ownership: ['주택 소유', (r) => r.answers.ownership],
    firstHome: ['과거 주택 소유', (r) => r.answers.firstHome],
    income: ['연 소득 구간', (r) => r.answers.income],
    deposit: ['청약통장 잔액', (r) => r.answers.deposit, true, (v) => money(v)],
    won5: ['5년 내 당첨 이력', (r) => r.answers.won5],
    children: ['미성년 자녀', (r) => r.answers.children],
    region: ['현재 거주', (r) => r.answers.region],
    wish: ['희망 지역', (r) => r.answers.wish],
    type: ['관심 유형', (r) => typeLabel(r.answers.type)],
  };
  const DEFAULT_CRITERIA = ['score', 'eligible', 'years', 'family', 'account', 'payments'];
  const criteria = new Set(read('history-criteria', DEFAULT_CRITERIA).filter((k) => CRITERIA[k]));

  const pad = (n) => String(n).padStart(2, '0');
  const when = (iso, withYear) => { const d = new Date(iso); return `${withYear ? d.getFullYear() + '.' : ''}${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const routeNow = () => (location.hash.slice(1) || 'home').split('/')[0];

  // 지금 쓰고 있는 진단 = 이 브라우저의 진단 조건(state.diagnosis)과 같은 기록 (같은 게 여럿이면 가장 최근)
  const COND_KEYS = ['age', 'marriage', 'head', 'region', 'ownership', 'firstHome', 'years', 'family', 'children', 'household', 'account', 'payments', 'deposit', 'won5', 'income', 'welfare', 'assets', 'wish', 'type'];
  // 기록에 있는 항목만 비교한다 (예전 기록에는 나중에 생긴 질문이 없을 수 있어서)
  const sameCond = (rec, cur) => COND_KEYS.filter((k) => rec && k in rec).every((k) => String(rec[k] ?? '') === String(cur?.[k] ?? ''));
  // 사용 중 기록: 서버가 알려 준 기록(active). 서버 값이 없으면(예전 서버) 지금 조건과 같은 가장 최근 기록
  const appliedRecord = () => {
    const recs = hist.records || [];
    return recs.find((r) => r.active) || recs.find((r) => sameCond(r.answers, state.diagnosis)) || null;
  };
  // 기록 하나를 '사용 중'으로: 서버에 고른 기록을 저장하고, 진단 조건·서버 프로필도 그 기록으로 바꿔 가점·추천 공고를 다시 계산
  async function applyRecord(id) {
    const r = (hist.records || []).find((x) => x.id === id);
    if (!r || hist.applying || r.active) return;
    hist.applying = id; hist.pickOpen = false; hist.pickDel = null; render();
    try {
      await api(`/users/${state.user.id}/diagnoses/${id}/active`, { method: 'PUT' });
      hist.records = hist.records.map((x) => ({ ...x, active: x.id === id }));
      state.diagnosis = { ...state.diagnosis, ...r.answers }; save('diagnosis', state.diagnosis);
      state.answers = { ...state.answers, ...state.diagnosis }; state.step = 0;
      await saveProfile();
      await loadRecs();
      toast(`${when(r.created_at, true)} 진단을 사용해요. 가점·추천 공고가 이 조건으로 바뀌었어요.`);
    } catch (err) {
      toast(`적용하지 못했어요: ${err.message}`);
    } finally { hist.applying = null; render(); }
  }

  async function loadRecords(userId) {
    hist.loadingFor = userId;
    try { hist.records = await api(`/users/${userId}/diagnoses`); hist.recordsError = null; }
    catch (error) { hist.records = []; hist.recordsError = error.message; }
    render();
  }

  async function postRecord() {
    hist.posting = true;
    try {
      // 기록의 추천·자격 숫자는 진단 결과 화면 목록과 같은 기준(관심 유형으로 거른 내 추천 공고)으로 남긴다
      // 진단 마지막 버튼에서 시작된 내 조건 저장이 끝난 뒤에 추천을 새로 받아야 새 답(1순위 항목 등)이 반영된다
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (hist.saving) await hist.saving.catch(() => {});
      live.recs = null;
      await loadRecs();
      const mine = myRecs();
      const rec = await api(`/users/${state.user.id}/diagnoses`, { method: 'POST', body: {
        answers: state.diagnosis, recommend_count: mine.length, eligible_count: mine.filter((r) => r.eligible).length,
      } });
      hist.records = [rec, ...(hist.records || []).map((x) => ({ ...x, active: false }))];   // 새 기록이 사용 중
      hist.pending = false;
    } catch (error) { toast(`진단 기록을 저장하지 못했어요: ${error.message}`); hist.pending = false; }
    finally { hist.posting = false; render(); }
  }

  // 진단을 마치면 신호가 온다 → 프로필 저장이 끝난(사용자 번호가 있는) 다음 render 에서 기록을 남긴다
  // 내 조건 저장(saveProfile)이 진행 중인지 기억해 둔다 (기록·추천은 저장이 끝난 뒤에)
  const liveSaveProfile = saveProfile;
  saveProfile = function (...args) { const p = liveSaveProfile(...args); hist.saving = p; p.finally(() => { if (hist.saving === p) hist.saving = null; }); return p; };

  window.addEventListener('cy:diagnosis-done', () => { hist.pending = true; live.recsEligibleOnly = false; live.recsShowAll = false; live.recsKind = null; hist.viewId = null;
    if (state.user?.member && routeNow() === 'diagnosis') hist.toMyPage = true;   // 로그인한 사람은 진단을 마치면 마이페이지(청약 현황)로
  });   // 새 진단이면 결과 목록 보기 방식도 처음으로

  function sync() {
    const uid = state.user?.id || 0;
    if (hist.pending && state.diagnosis && !hist.posting) {
      if (uid) { postRecord(); }
      else if (!live.userTried) { live.userTried = true; saveProfile().catch((error) => { live.userError = error.message; }).finally(render); }   // 손님: 먼저 서버에 내 조건 저장
    }
    if (uid && hist.loadingFor !== uid) { hist.records = null; hist.selected.clear(); loadRecords(uid); }
    if (!uid && hist.loadingFor) { hist.loadingFor = 0; hist.records = null; hist.selected.clear(); }
  }

  /* ── 진단 결과 화면: 날짜별 기록 + 비교 ── */
  function historySection() {
    const recs = hist.records;
    if (!state.user?.id || recs === null) return '<section class="section" id="lp-history"><div class="section-head"><div><h2>날짜별 진단 기록</h2><p>기록을 불러오는 중이에요…</p></div></div></section>';
    const latestId = recs[0]?.id;
    const appliedId = appliedRecord()?.id;
    const shown = hist.showAll ? recs : recs.filter((r, i) => i < LIST_PAGE || hist.selected.has(r.id) || r.id === appliedId);   // 사용 중 기록은 접혀 있어도 보이게
    const rows = shown.map((r) => `<label class="hist-row${hist.selected.has(r.id) ? ' on' : ''}">
        <input type="checkbox" data-hist-pick="${r.id}" ${hist.selected.has(r.id) ? 'checked' : ''} ${!hist.selected.has(r.id) && hist.selected.size >= 4 ? 'disabled' : ''}>
        <span class="hist-date">${when(r.created_at, true)}${r.id === latestId ? ' <em>최근</em>' : ''}</span>
        <span class="hist-score"><b>${r.score}</b>점</span>
        <span class="hist-meta">추천 ${r.recommend_count}건 · 자격 충족 ${r.eligible_count}건</span>
        <span class="hist-meta">${esc(r.answers.wish || '전체')} · ${esc(typeLabel(r.answers.type))}</span>
        ${r.id === appliedId ? '<span class="hist-use on">사용 중</span>' : `<button type="button" class="hist-use" data-action="hist-apply" data-id="${r.id}" ${hist.applying ? 'disabled' : ''}>${hist.applying === r.id ? '적용 중…' : '이 조건 사용'}</button>`}
        ${r.id === appliedId ? '<span class="hist-del" aria-hidden="true"></span>' : `<button type="button" class="hist-del" data-action="hist-del" data-id="${r.id}" aria-label="${when(r.created_at, true)} 기록 삭제">삭제</button>`}
      </label>`).join('');
    const picked = recs.filter((r) => hist.selected.has(r.id)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const chips = Object.entries(CRITERIA).map(([k, [name]]) => `<button type="button" class="hist-chip${criteria.has(k) ? ' on' : ''}" data-action="hist-crit" data-value="${k}" aria-pressed="${criteria.has(k)}">${name}</button>`).join('');
    let table = '';
    if (picked.length >= 2 && criteria.size) {
      const order = new Map([...recs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id).map((r, i) => [r.id, i + 1]));
      const head = picked.map((r) => `<th>${order.get(r.id)}번째 진단<br><small>${when(r.created_at, true)}</small></th>`).join('');
      const body = Object.entries(CRITERIA).filter(([k]) => criteria.has(k)).map(([, [name, get, numeric, fmt]]) => {
        const first = get(picked[0]);
        const cells = picked.map((r, i) => {
          const v = get(r);
          const shown = v == null || v === '' ? '–' : esc(fmt ? fmt(v) : v);
          if (i === 0) return `<td>${shown}</td>`;
          if (numeric && v != null && first != null && Number(v) !== Number(first)) {
            const up = Number(v) > Number(first);
            return `<td class="chg">${shown} <span class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'}</span></td>`;
          }
          return `<td class="${!numeric && v !== first ? 'chg' : ''}">${shown}</td>`;
        }).join('');
        return `<tr><th scope="row">${name}</th>${cells}</tr>`;
      }).join('');
      table = `<div class="hist-table-wrap"><table class="hist-table"><thead><tr><th>기준</th>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="hist-note">▲▼는 가장 오래된 기록과 비교한 변화예요. 바뀐 값은 굵게 표시돼요.</p>`;
    } else if (picked.length >= 2) table = '<p class="hist-note">비교할 기준을 하나 이상 골라 주세요.</p>';
    const compare = recs.length >= 2 ? `<div class="panel hist-compare">
        <div class="hist-compare-head"><h3>기록 비교</h3><span>${picked.length < 2 ? '위 목록에서 비교할 기록을 2~4개 골라 주세요.' : `${picked.length}개 기록 비교 중`}</span>${hist.selected.size ? '<button type="button" class="text-link" data-action="hist-clear">선택 해제</button>' : ''}</div>
        <div class="hist-chips" role="group" aria-label="비교할 기준">${chips}</div>${table}
      </div>` : '';
    const guest = !state.user?.member ? '<p class="hist-note">지금은 이 브라우저에서만 이어 볼 수 있어요. 로그인하면 이메일 기준으로 다른 기기에서도 기록을 볼 수 있어요.</p>' : '';
    return `<section class="section" id="lp-history"><div class="section-head"><div><div class="eyebrow">MY DIAGNOSIS HISTORY</div><h2>날짜별 진단 기록 <small>${recs.length}건</small></h2><p>진단을 마칠 때마다 그날의 조건과 가점·추천 결과가 저장돼요. <b>이 조건 사용</b>을 누르면 그 기록으로 가점·추천 공고·진단 입력값이 바뀌어요.</p></div><button type="button" class="btn secondary small" data-action="redo-diagnosis">새로 진단하기</button></div>
      ${recs.length ? `<div class="hist-list">${rows}</div>${recs.length > LIST_PAGE ? `<button type="button" class="hist-more" data-action="hist-more">${hist.showAll ? '최근 5건만 보기' : `기록 ${recs.length}건 모두 보기`}</button>` : ''}${compare}` : '<div class="empty"><h3>아직 저장된 기록이 없어요</h3><p>진단을 마치면 이곳에 날짜별로 쌓여요.</p></div>'}${guest}</section>`;
  }

  /* ── 내 공간 카드 안: 사용할 진단 기록 고르기 (아래로 펼치는 목록, 화면 이동 없이) ── */
  const shortWhen = (iso) => { const d = new Date(iso); const p = (x) => String(x).padStart(2, '0'); return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  function recordPicker(used, label) {
    const recs = hist.records || [];
    const rows = recs.map((r, i) => {
      const on = used && r.id === used.id; const a = r.answers || {};
      const tip = `${when(r.created_at, true)} · ${a.marriage || ''} · 무주택 ${a.years ?? 0}년 · 통장 ${a.account ?? 0}년 · 희망 ${a.wish || '전체'} · ${typeLabel(a.type)}`;
      if (hist.pickDel === r.id) return `<div class="rp-row rp-ask"><span title="${when(r.created_at, true)} 기록">${shortWhen(r.created_at)} 삭제?</span><button type="button" class="rp-yes" data-action="rp-del-yes" data-id="${r.id}">삭제</button><button type="button" class="rp-no" data-action="rp-del-no">취소</button></div>`;
      return `<div class="rp-row${on ? ' on' : ''}"><button type="button" role="menuitemradio" aria-checked="${!!on}" class="rp-item" data-action="hist-apply" data-id="${r.id}" title="${esc(tip)}" ${hist.applying ? 'disabled' : ''}>
          <span class="rp-check" aria-hidden="true"></span><span class="rp-date" title="${on ? '사용 중' : '누르면 이 기록을 사용'}">${shortWhen(r.created_at)}${i === 0 ? '<em>최근</em>' : ''}</span><span class="rp-score">${r.score}점</span></button>
        ${on ? '<span class="rp-del rp-lock" title="사용 중인 기록은 지울 수 없어요" aria-hidden="true"></span>' : `<button type="button" class="rp-del" data-action="rp-del" data-id="${r.id}" aria-label="${when(r.created_at, true)} 기록 삭제" title="기록 삭제">×</button>`}</div>`;
    }).join('');
    return `<div class="rp"><button type="button" class="rp-btn" data-action="rp-toggle" title="눌러서 다른 진단 기록으로 바꾸기 (${recs.length}건)" aria-label="사용 중인 진단 ${label}, 눌러서 다른 진단 기록으로 바꾸기" aria-haspopup="menu" aria-expanded="${!!hist.pickOpen}">${hist.applying ? '바꾸는 중…' : label}<span aria-hidden="true"></span></button>
      ${hist.pickOpen ? `<div class="rp-menu" role="menu"><div class="rp-list">${rows}</div><button type="button" class="rp-all" data-action="hist-open">기록 비교하기 →</button></div>` : ''}</div>`;
  }

  /* ── 내 공간 카드 안: 진단 때 입력한 조건 전체 (예전 '내 조건 요약' 박스를 카드로 옮김) ── */
  // 내 조건 목록 (가점에 들어가는 무주택 기간·부양가족·통장 가입 기간은 '가점 구성' 쪽에서 보여 준다)
  function condRows(a) {
    const man = (v) => (v === '' || v == null || !Number(v) ? '입력 안 함' : Number(v) >= 10000 ? `${(Number(v) / 10000).toFixed(Number(v) % 10000 ? 1 : 0)}억 원` : `${Number(v).toLocaleString('ko-KR')}만 원`);
    return [
      ['연령대', a.age, 0], ['혼인', a.marriage, 0], ['세대주', a.head, 0], ['현재 거주', a.region, 0],
      ['주택 소유', a.ownership === '무주택' ? (a.firstHome === '있어요' ? '무주택 (과거 소유)' : '무주택 (첫 집)') : a.ownership, 1],
      ['미성년 자녀', a.children, 2], ['가구원 수', a.household || '–', 4], ['납입 회차', `${a.payments ?? 0}회`, 3],
      ['예치금', man(a.deposit), 3], ['5년 내 당첨', a.won5 === '잘 모르겠어요' ? '모름' : a.won5, 3], ['연 소득', String(a.income || '').replace(/ 원$/, ''), 4],
      ['보유 현금', man(a.assets), 4], ['수급·차상위', a.welfare === '아니요' ? '해당 없음' : (a.welfare || '–').replace(' 수급자', ''), 4], ['희망 지역', a.wish, 5], ['관심 유형', typeLabel(a.type), 5],
    ];
  }
  // 가점 구성 (서버 계산: 무주택 32 + 부양가족 35 + 통장 17)
  function scorePage() {
    const sb = hist.score;
    if (!sb) return '<p class="ds-hint">가점 구성을 불러오는 중이에요…</p>';
    const STEP = { no_house: 1, dependents: 2, account: 3 };
    return `<div class="sc-list">${sb.items.map((it) => `<div role="button" tabindex="0" class="sc-row" data-action="cond-edit" data-value="${STEP[it.key] ?? 0}">
        <span class="sc-label"><b>${it.label}${it.rule ? `<span class="sc-q" tabindex="0" role="button" aria-label="${it.label} 점수 계산 방법"><span aria-hidden="true">?</span><span class="sc-tip" role="tooltip"><strong>${it.label} · 최대 ${it.max}점</strong>${esc(it.rule)}${it.tip ? `<em>${esc(it.tip)}</em>` : ''}</span></span>` : ''}</b><small>${esc(it.basis)}</small></span>
        <span class="sc-bar"><i style="width:${Math.round((it.score / it.max) * 100)}%"></i></span>
        <span class="sc-pt"><b>${it.score}</b> / ${it.max}점</span></div>`).join('')}</div>
      <p class="ds-hint">납입 회차·예치금은 가점이 아니라 1순위 조건에 쓰여요.</p>`;
  }
  async function loadScore() {
    if (!state.user?.id || hist.scoreFor === live.recs) return;
    hist.scoreFor = live.recs;   // 추천을 새로 받으면(조건이 바뀌면) 가점 구성도 다시
    try { hist.score = await api(`/users/${state.user.id}/score`); } catch { hist.score = null; }
    render();
  }

  // 카드 왼쪽 넘김 영역: 1쪽 청약 현황·자금, 2쪽 청약 가점 구성, 3쪽 내 조건 (‹ › 로 넘김)
  function slider(a, statusHtml) {
    const rows = condRows(a);
    const half = Math.ceil(rows.length / 2);
    const col = (list) => `<dl>${list.map(([k, v, step]) => `<div role="button" tabindex="0" data-action="cond-edit" data-value="${step}" title="${k} 수정하기"><dt>${k}</dt><dd>${esc(v ?? '–')}</dd></div>`).join('')}</dl>`;
    const pages = [
      ['내 청약 현황', statusHtml],
      [`청약 가점 구성${hist.score ? ` <em class="ds-total">${hist.score.total}<small> / ${hist.score.max}점</small></em>` : ''}`, scorePage(), '항목을 누르면 수정'],
      ['내 조건', `<div class="cl">${col(rows.slice(0, half))}${col(rows.slice(half))}</div>`, '항목을 누르면 수정'],
    ];
    const i = Math.min(Math.max(hist.slide || 0, 0), pages.length - 1);
    return `<div class="ds" aria-roledescription="carousel">
      <button type="button" class="ds-nav" data-action="ds-go" data-value="${i - 1}" ${i === 0 ? 'disabled' : ''} aria-label="이전">‹</button>
      <div class="ds-view" aria-live="polite"><div class="ds-head"><b>${pages[i][0]}</b>${pages[i][2] ? `<small class="ds-note">${pages[i][2]}</small>` : ''}</div>${pages[i][1]}</div>
      <button type="button" class="ds-nav" data-action="ds-go" data-value="${i + 1}" ${i === pages.length - 1 ? 'disabled' : ''} aria-label="다음">›</button>
      <div class="ds-dots">${pages.map(([t], k) => { const plain = esc(t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()).replace(/\s*\d+\s*\/\s*\d+점$/, ''); return `<button type="button" class="${k === i ? 'on' : ''}" data-action="ds-go" data-value="${k}" aria-label="${plain}" title="${plain}"></button>`; }).join('')}<span class="ds-count">${i + 1} / ${pages.length}</span></div>
    </div>`;
  }

  /* ── 내 공간: 최근 진단 카드 ── */
  function dashboardCard() {
    const r = hist.records?.[0];
    const used = appliedRecord();
    const a = state.diagnosis;
    const n = hist.records?.length || 0;
    const mine = live.recs ? myRecs() : null;              // 지금 추천(관심 유형 반영)이 있으면 그 숫자, 없으면 최근 기록 숫자
    const score = live.recs?.[0]?.score ?? r?.score;
    const fact = (label, value, unit) => `<div><small>${label}</small><b>${value ?? '–'}<span>${unit}</span></b></div>`;
    const facts = `<div class="dash-diag-facts">${fact('청약 가점', score, '/84')}${fact('1순위·자격 가능', mine ? mine.filter((x) => ['1순위 가능', '자격 가능'].includes(recStatus(x).label)).length : null, '건')}${fact('추천 공고', mine ? mine.length : r?.recommend_count, '건')}${fact('자금 충족', mine ? mine.filter((x) => x.eligible).length : r?.eligible_count, '건')}</div>`;
    // 자금: 보유 현금과 계약금 10% 기준 분양가 상한 + 대출·자금 계산 바로가기 (계산기 자체는 금융 정보 화면)
    const assets = Number(a.assets) || 0;
    const eok = (man) => (man >= 10000 ? `${(man / 10000).toFixed(man % 10000 ? 1 : 0)}억 원` : `${man.toLocaleString('ko-KR')}만 원`);
    const moneyRow = `<div class="dash-money"><div><small>주거에 쓸 수 있는 현금</small><b>${assets ? eok(assets) : '아직 입력 전'}</b></div><div><small>계약금 10% 기준 분양가</small><b>${assets ? `${eok(assets * 10)} 이하` : '–'}</b></div>
      <div class="dash-money-actions"><button type="button" data-action="finance-tab" data-value="대출">내 대출 한도·금리 보기 →</button><button type="button" data-action="finance-tab" data-value="자금 계산">자금 계획 계산하기 →</button></div></div>`;
    return `<section class="dash-diag" aria-label="내 진단 결과">
      <div class="dash-diag-left">
        <div class="dash-diag-main"><div class="eyebrow">MY SPACE</div><h3>${state.user?.member ? `${esc(state.user.name)}님의 청약 현황` : '내 청약 현황'}</h3><div class="dash-sub-row">${(() => {   // '사용 중인 진단' + 그 진단 날짜가 적힌 선택 상자 (기록이 2개 이상이면 눌러서 다른 기록으로 바꿈)
            const cur = used || r;
            if (hist.recordsError) return '<p class="dash-diag-sub">진단 기록을 불러오지 못했어요</p>';
            if (!cur) return '<p class="dash-diag-sub">내 진단</p>';
            const label = `${when(cur.created_at, true)}${cur.id === r?.id ? ' (최근)' : ''}`;
            return `<p class="dash-diag-sub">사용 중인 진단</p>${n > 1 ? recordPicker(cur, label) : `<span class="rp-static">${label}</span>`}`;
          })()}</div>
          ${slider(a, facts + moneyRow)}</div>
        <div class="dash-diag-actions"><a class="btn orange" href="#result">가점 근거·전체 결과</a>${n >= 1 ? `<button type="button" class="btn secondary" data-action="hist-open">진단 기록 ${n}건 · 비교</button>` : ''}<a class="dash-diag-report" href="#report">청약 준비 리포트 · PDF 저장 ↗</a></div>
      </div>
      ${dashSoon()}
    </section>`;
  }

  /* ── 내 공간 카드 오른쪽: 접고 펼 수 있는 두 상자 (마감 임박 · 내 기준에 맞는 공고) ── */
  const fold = { soon: false, recs: true };   // true = 펼침. 마이페이지에 처음 들어오면 '내 기준에 맞는 공고'만 펼친다(새로고침하면 초기화)
  function ddayOf(h) {
    const e = h.raw?.receipt_end; if (!e) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(e).setHours(0, 0, 0, 0) - today) / 86400000);
  }
  const ddayText = (d) => (d == null ? '' : d < 0 ? '마감' : d === 0 ? '오늘 마감' : `D-${d}`);
  // 이름이 같은 공고(주택형만 다른 공고)는 한 줄로 묶는다
  function groupByName(list) {
    const m = new Map();
    list.forEach((x) => { const k = x.r.house.name; if (m.has(k)) m.get(k).n += 1; else m.set(k, { ...x, n: 1 }); });
    return [...m.values()];
  }
  const FP_CLASS = { '1순위 가능': 'fp-ok', '1순위 아님': 'fp-no', '확인 필요': 'fp-check' };
  function foldBox(key, title, sub, body, more, badge) {
    const open = fold[key] !== false;
    return `<section class="dash-fold${open ? ' open' : ''}" aria-label="${title}">
      <button type="button" class="dash-fold-head" data-action="dash-fold" data-value="${key}" aria-expanded="${open}"><h4>${title}</h4>${sub ? `<small>${sub}</small>` : ''}${badge != null ? `<em class="dash-fold-badge${key === 'recs' ? ' green' : ''}">${badge}</em>` : ''}<span class="dash-fold-icon" aria-hidden="true"></span></button>
      ${open ? `<div class="dash-fold-body">${body}${more || ''}</div>` : ''}</section>`;
  }
  function dashSoon() {
    const ROWS = 5;   // 항상 한 상자만 펼쳐 있으므로 5줄 (왼쪽 높이와 맞춤)
    const loading = !state.user?.id || !live.recs;
    if (live.recsError) {   // 서버 오류를 '0건'으로 보여 주지 않는다
      const err = `<div class="dash-err"><b>서버에서 추천 공고를 불러오지 못했어요.</b><small>${esc(live.recsError)}</small><small>백엔드를 새로 받았다면 DB 업데이트가 필요할 수 있어요: <code>docker compose exec backend alembic upgrade head</code></small><button type="button" data-action="dash-retry">다시 불러오기</button></div>`;
      return `<div class="dash-soon">${foldBox('soon', '마감 임박한 내 추천 공고', '', err)}${foldBox('recs', '내 기준에 맞는 공고', '', err)}</div>`;
    }
    let soonBox;
    if (loading) soonBox = foldBox('soon', '마감 임박한 내 추천 공고', '', '<p class="dash-soon-empty">추천 공고를 불러오는 중이에요…</p>');
    else {
      const open = myRecs().map((r) => ({ r, d: ddayOf(r.house) })).filter((x) => x.d != null && x.d >= 0).sort((x, y) => x.d - y.d);
      const rows = groupByName(open).slice(0, ROWS).map(({ r, d, n }) => `<a class="dash-soon-row" href="#detail/${r.house.id}">
        <span class="dash-soon-dday${d <= 3 ? ' hot' : ''}">${ddayText(d)}</span>
        <span class="dash-soon-main"><b>${srcBadge(r.house)}${esc(r.house.name)}</b><small>${esc(r.house.region)} · ${esc(r.house.type)}${n > 1 ? ` · 주택형 ${n}개` : ''}${['1순위 가능', '자격 가능'].includes(recStatus(r).label) ? ` · ${recStatus(r).label}` : ''}${r.badges?.length ? ` · ${esc(r.badges[0])}` : ''}</small></span></a>`).join('');
      soonBox = foldBox('soon', '마감 임박한 내 추천 공고', '',
        rows ? `<div class="dash-soon-list">${rows}</div>` : '<p class="dash-soon-empty">지금 접수 마감이 다가오는 추천 공고가 없어요.</p>',
        open.length ? `<button type="button" class="dash-soon-more" data-action="dash-soon-all">${open.length}건 마감순으로 보기 →</button>` : '',
        `7일 안에 마감 ${open.filter((x) => x.d <= 7).length}건`);
    }
    let recsBox;
    if (loading) recsBox = foldBox('recs', '내 기준에 맞는 공고', '', '<p class="dash-soon-empty">추천 공고를 불러오는 중이에요…</p>');
    else {
      const all = rankedRecs();
      const f = hist.dashFilter || 'all';
      const filters = [['all', '전체', all.length], ['first', '1순위·자격 가능', all.filter((r) => ['1순위 가능', '자격 가능'].includes(recStatus(r).label)).length], ['eligible', '자금 충족', all.filter((r) => r.eligible).length]];
      const list = all.filter((r) => f === 'all' || (f === 'first' ? ['1순위 가능', '자격 가능'].includes(recStatus(r).label) : r.eligible));
      const chips = `<div class="dash-mini-chips" role="group" aria-label="공고 보기">${filters.map(([k, label, cnt]) => `<button type="button" class="${f === k ? 'on' : ''}" data-action="dash-filter" data-value="${k}">${label} ${cnt}</button>`).join('')}<span class="dash-mini-note">자금 → 1순위 → 당첨 구간 순</span></div>`;
      const rows = groupByName(list.map((r) => ({ r, d: ddayOf(r.house) }))).slice(0, ROWS).map(({ r, d, n }) => `<a class="dash-soon-row" href="#detail/${r.house.id}">
        <span class="dash-soon-dday fp ${recStatus(r).cls}">${esc(recStatus(r).label)}</span>
        <span class="dash-soon-main"><b>${srcBadge(r.house)}${esc(r.house.name)}</b><small>${esc(r.house.region)} · ${esc(r.house.type)}${n > 1 ? ` · 주택형 ${n}개` : ''} · ${r.eligible ? '자금 충족' : '자금 확인'}${r.badges?.length ? ` · ${esc(r.badges[0])}` : ''}${d != null && d >= 0 ? ` · ${ddayText(d)}` : ''}</small></span></a>`).join('');
      recsBox = foldBox('recs', '내 기준에 맞는 공고', '',
        chips + (rows ? `<div class="dash-soon-list">${rows}</div>` : '<p class="dash-soon-empty">조건에 맞는 공고가 없어요.</p>'),
        list.length ? `<button type="button" class="dash-soon-more" data-action="dash-all">${list.length}건 모두 보기 →</button>` : '',
        `${all.length}건`);
    }
    return `<div class="dash-soon">${soonBox}${recsBox}</div>`;
  }

  /* ── 진단 결과 맨 위 박스: 어느 진단 기록 기준으로 볼지 고르기 ── */
  function bannerPicker() {
    const banner = $('#app .result-banner');
    const recs = hist.records || [];
    if (!banner || recs.length < 2 || banner.querySelector('.rb-pick')) return;
    if (hist.viewId && !recs.some((r) => r.id === hist.viewId)) hist.viewId = null;
    const view = recs.find((r) => r.id === hist.viewId) || recs[0];
    const latest = view.id === recs[0].id;
    const left = banner.firstElementChild, right = banner.lastElementChild;
    if (!latest) {   // 고른 기록의 조건·가점으로 바꿔 보여 준다
      const a = view.answers || {};
      left.querySelector('h2').textContent = '선택한 진단 기록이에요.';
      const p = left.querySelector('p');
      if (p) p.innerHTML = `${esc(a.age || '')} · ${esc(a.marriage || '')} · ${esc(a.ownership || '')} · ${esc(a.region || '')} 거주<br>희망 조건: ${esc(a.wish || '전체')} · ${esc(typeLabel(a.type))}`;
      const score = right.querySelector('.score'); if (score) score.innerHTML = `${view.score}<span> / 84</span>`;
    }
    const options = recs.map((r, i) => `<option value="${r.id}" ${r.id === view.id ? 'selected' : ''}>${when(r.created_at, true)} · ${r.score}점${i === 0 ? ' (최근)' : ''}</option>`).join('');
    right.insertAdjacentHTML('afterbegin', `<label class="rb-pick"><span>기준 진단</span><select data-hist-view aria-label="맨 위 박스에 보여 줄 진단 기록">${options}</select></label>`);
    if (!latest) left.insertAdjacentHTML('beforeend', '<p class="rb-note">이 박스는 고른 기록 기준이에요. 아래 추천 공고는 최근 진단 기준이에요.</p>');
  }


  /* ── 내 공간 오른쪽: "내 조건 요약"에는 조건만, 계정은 따로, 리포트는 진단 카드로, 내 집 기준은 집 찾기 쪽으로 ── */
  function tidyDashAside() {
    // "다음으로 해볼 일"(공고 둘러보기·대출·자금·이웃 경험)은 상단 메뉴와 같은 곳으로 가는 바로가기라 뺀다
    [...document.querySelectorAll('#app .dash-grid .section-head h2')].filter((h) => h.textContent.trim() === '다음으로 해볼 일').forEach((h) => {
      const head = h.closest('.section-head'); const grid = head?.nextElementSibling;
      if (grid?.classList.contains('grid2')) grid.remove();
      head?.remove();
    });
    // 오른쪽 '내 조건 요약'은 청약 현황 카드 안(내 조건 전체 보기)으로, '내 계정'은 상단 톱니바퀴(계정 설정)로 옮겼다
    $('#app .dash-aside')?.remove();
    $('#app .dash-grid')?.classList.add('dash-grid-one');
  }

  /* ── 계정 설정 (#profile): 계정 정보 · 내 데이터 백업 · 회원 탈퇴. 진단 정보 관리는 마이페이지에서 한다 ── */
  function settingsPage() {
    const u = state.user;
    if (!u?.member) return `<div class="wrap page reveal settings-page"><div class="page-title"><h1>계정 설정</h1><p>로그인하면 계정 정보와 내 데이터를 관리할 수 있어요.</p></div><section class="panel"><button type="button" class="btn small" data-action="signup">로그인</button></section></div>`;
    const row = (k, v) => `<div class="kv"><span>${k}</span><strong>${v}</strong></div>`;
    return `<div class="wrap page reveal settings-page"><div class="page-title"><h1>계정 설정</h1><p>계정 정보와 내 데이터를 관리해요. 진단 조건 수정·진단 기록은 <a href="#dashboard" class="text-link">마이페이지</a>에서 할 수 있어요.</p></div>
      <section class="panel"><h3>계정 정보</h3>${row('닉네임', esc(u.name))}${row('이메일', esc(u.email))}
        <p class="settings-note">로그인은 이메일과 닉네임으로 해요. 비밀번호·본인 인증은 아직 없어요.</p></section>
      <section class="panel"><h3>내 데이터 백업</h3>
        <div class="bk-block"><div><b>전체 백업</b><p class="settings-note">서버에 저장된 내 프로필, 모든 진단 기록, 관심 공고, 내가 쓴 글과 댓글을 한 파일(JSON)로 보관해요.</p></div>
          <button type="button" class="btn small" data-action="acct-export" data-value="json">전체 데이터 내려받기 (JSON)</button></div>
        <div class="bk-block bk-pick"><div><b>진단 기록 골라 내려받기</b><p class="settings-note">필요한 날짜의 기록만 골라 엑셀에서 열 수 있는 CSV로 받아요. 조건·가점·추천 수가 함께 들어가요.</p></div>${dlList()}</div>
      </section>
      <section class="panel settings-danger"><h3>회원 탈퇴</h3><p class="settings-note">탈퇴하면 서버에 저장된 <b>프로필 · 진단 기록 · 관심 공고 · 내가 쓴 글과 댓글 · 공감</b>이 모두 지워지고 되돌릴 수 없어요. 필요하면 먼저 위에서 백업해 두세요.</p>
        <div class="settings-actions"><button type="button" class="btn small danger" data-action="acct-delete">회원 탈퇴</button></div></section>
    </div>`;
  }
  hist.dlSel = new Set();   // 계정 설정: 내려받을 진단 기록
  function dlList() {
    const recs = hist.records;
    if (recs === null) return '<p class="settings-note">기록을 불러오는 중이에요…</p>';
    if (!recs.length) return '<p class="settings-note">아직 저장된 진단 기록이 없어요.</p>';
    [...hist.dlSel].forEach((id) => { if (!recs.some((r) => r.id === id)) hist.dlSel.delete(id); });
    const n = hist.dlSel.size, all = n === recs.length;
    const rows = recs.map((r, i) => { const a = r.answers || {}; return `<label class="bk-row${hist.dlSel.has(r.id) ? ' on' : ''}">
        <input type="checkbox" data-dl-pick="${r.id}" ${hist.dlSel.has(r.id) ? 'checked' : ''}>
        <span class="bk-date">${when(r.created_at, true)}${i === 0 ? ' <em>최근</em>' : ''}</span>
        <span class="bk-score">${r.score}점</span>
        <span class="bk-meta">추천 ${r.recommend_count}건 · 자격 충족 ${r.eligible_count}건</span>
        <span class="bk-cond">${esc(a.wish || '전체')} · ${esc(typeLabel(a.type))}</span></label>`; }).join('');
    return `<div class="bk-list"><label class="bk-row bk-head"><input type="checkbox" data-dl-all ${all ? 'checked' : ''}><span>전체 선택</span><small>${recs.length}건 중 ${n}건 선택</small></label><div class="bk-rows">${rows}</div></div>
      <div class="settings-actions"><button type="button" class="btn secondary small" data-action="acct-csv" ${n ? '' : 'disabled'}>${n ? `선택한 ${n}건 내려받기 (CSV · 엑셀)` : '내려받을 기록을 골라 주세요'}</button></div>`;
  }
  function csvOf(records) {
    const cols = [['age', '연령대'], ['marriage', '혼인'], ['head', '세대주'], ['region', '현재 거주'], ['ownership', '주택 소유'], ['firstHome', '과거 주택 소유'], ['years', '무주택 기간(년)'], ['family', '부양가족'], ['children', '미성년 자녀'], ['household', '가구원 수'], ['account', '통장 가입(년)'], ['payments', '납입 회차'], ['deposit', '예치금(만원)'], ['won5', '5년 내 당첨'], ['income', '연 소득'], ['welfare', '수급·차상위'], ['assets', '보유 현금(만원)'], ['wish', '희망 지역'], ['type', '관심 유형']];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['진단 일시', '청약 가점', '추천 공고 수', '자격 충족 수', ...cols.map(([, label]) => label)];
    const body = records.map((r) => [when(r.created_at, true), r.score, r.recommend_count, r.eligible_count, ...cols.map(([k]) => (k === 'type' ? typeLabel(r.answers?.type) : r.answers?.[k]))]);
    return '\ufeff' + [head, ...body].map((row) => row.map(q).join(',')).join('\r\n');   // BOM: 엑셀에서 한글이 깨지지 않게
  }
  function downloadPicked() {
    const recs = (hist.records || []).filter((r) => hist.dlSel.has(r.id)).sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
    if (!recs.length) return;
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    download(`청약돼_진단기록_${recs.length}건_${day}.csv`, csvOf(recs), 'text/csv;charset=utf-8');
    toast(`진단 기록 ${recs.length}건을 내려받았어요.`);
  }
  const confirmBody = () => ({ email: state.user.email, nickname: state.user.name });
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function exportData() {
    try {
      const data = await api(`/users/${state.user.id}/export`, { method: 'POST', body: confirmBody() });
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      download(`청약돼_내데이터_${day}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast('내 데이터를 내려받았어요.');
    } catch (err) { toast(`내려받지 못했어요: ${err.message}`); }
  }
  function deleteDialog() {
    modal(`<div class="eyebrow" style="color:#b3402b">DELETE ACCOUNT</div><h2>정말 탈퇴할까요?</h2><p>프로필, 진단 기록, 관심 공고, 내가 쓴 글·댓글·공감이 모두 지워지고 되돌릴 수 없어요.<br>확인을 위해 닉네임 <b>${esc(state.user.name)}</b>을(를) 입력해 주세요.</p>
      <div class="field"><input id="acct-del-name" placeholder="닉네임 입력" autocomplete="off"></div>
      <div style="display:flex;gap:8px"><button type="button" class="btn secondary" data-action="close" style="flex:1">취소</button><button type="button" class="btn danger" data-action="acct-delete-go" style="flex:1" disabled>탈퇴하기</button></div><p id="acct-del-error" style="margin:12px 0 0;color:#b3402b"></p>`);
    const input = $('#acct-del-name'), go = $('[data-action="acct-delete-go"]');
    input?.addEventListener('input', () => { go.disabled = input.value.trim() !== state.user.name; });
    input?.focus();
  }
  async function deleteAccount() {
    const btn = $('[data-action="acct-delete-go"]'); if (btn) { btn.disabled = true; btn.textContent = '탈퇴하는 중…'; }
    try {
      await api(`/users/${state.user.id}`, { method: 'DELETE', body: confirmBody() });
      closeModal();
      // 로그아웃과 같이 이 브라우저의 정보도 지운다
      state.diagnosis = null; save('diagnosis', null); state.user = null; save('user', null);
      live.recs = null; live.userTried = false; hist.records = null; hist.selected.clear();
      location.hash = 'start'; render(); toast('탈퇴했어요. 그동안 이용해 주셔서 감사해요.');
    } catch (err) {
      const msg = $('#acct-del-error'); if (msg) msg.textContent = `탈퇴하지 못했어요: ${err.message}`;
      if (btn) { btn.disabled = false; btn.textContent = '탈퇴하기'; }
    }
  }

  // 상단 계정 메뉴: 이름 버튼을 누르면 마이페이지 · 계정 설정 · 로그아웃이 아래로 펼쳐진다
  const prevHeader = header;
  header = function (route) {
    prevHeader(route);
    const box = $('#header .nav-account');
    if (!box || !state.user?.member) return;
    const name = esc(state.user.name);
    box.innerHTML = `<div class="acct">
      <button type="button" class="pill acct-btn${['dashboard', 'profile'].includes(route) ? ' active' : ''}" data-action="acct-toggle" aria-haspopup="menu" aria-expanded="false">${name}님<span class="acct-caret" aria-hidden="true"></span></button>
      <div class="acct-menu" role="menu" hidden>
        <div class="acct-who"><b>${name}</b><small>${esc(state.user.email)}</small></div>
        <a role="menuitem" href="#dashboard" class="${route === 'dashboard' ? 'on' : ''}">마이페이지<small>청약 현황 · 추천 공고 · 내 조건 · 진단 기록</small></a>
        <a role="menuitem" href="#profile" class="${route === 'profile' ? 'on' : ''}">계정 설정<small>계정 정보 · 데이터 백업 · 회원 탈퇴</small></a>
        <button type="button" role="menuitem" class="acct-logout" data-action="logout">로그아웃</button>
      </div></div>`;
  };
  function acctMenu(open) {
    const btn = $('#header .acct-btn'), menu = $('#header .acct-menu');
    if (!btn || !menu) return;
    const next = open ?? menu.hidden;
    menu.hidden = !next; btn.setAttribute('aria-expanded', String(next));
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="acct-toggle"]')) { e.stopImmediatePropagation(); acctMenu(); return; }
    if (!e.target.closest('.acct-menu')) acctMenu(false);
    else if (e.target.closest('a[role="menuitem"]')) acctMenu(false);
  }, true);
  document.addEventListener('click', (e) => {   // 가점 '?' 설명: 눌러도 수정 화면으로 가지 않고, 터치 화면에서는 눌러서 열고 닫는다
    const q = e.target.closest('.sc-q');
    document.querySelectorAll('.sc-q.open').forEach((x) => { if (x !== q) x.classList.remove('open'); });
    if (q) { e.preventDefault(); e.stopImmediatePropagation(); q.classList.toggle('open'); }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { acctMenu(false); if (hist.pickOpen) { hist.pickOpen = false; render(); } } });
  document.addEventListener('click', (e) => {   // 진단 기록 고르기 목록: 바깥을 누르면 닫힘
    if (hist.pickOpen && !e.target.closest('.rp')) { hist.pickOpen = false; render(); }
  }, true);

  const prevRender = render;
  render = function () {
    // 다른 화면에서 청약 진단으로 들어오면, 입력하다 만 값 대신 가장 최근 진단 결과로 채우고 1단계부터 보여 준다
    const entering = routeNow();
    if (entering === 'diagnosis' && hist.lastRoute !== 'diagnosis' && state.diagnosis) {
      state.answers = { ...state.answers, ...(hist.records?.[0]?.answers || {}), ...state.diagnosis };   // 이 브라우저의 최근 진단이 가장 최신
      state.step = hist.editStep ?? 0;   // 마이페이지 '이 단계 수정'으로 왔으면 그 단계부터
    }
    hist.editStep = null;
    hist.lastRoute = entering;
    prevRender();
    sync();
    const route = routeNow();
    if (route === 'result' && hist.toMyPage) {
      hist.toMyPage = false;
      location.replace('#dashboard'); window.scrollTo(0, 0);
      toast('진단을 저장했어요. 마이페이지에서 청약 현황을 확인하세요.');
      return;
    }
    if (route === 'result' && state.diagnosis) {
      const anchor = $('#app .grid2');
      if (anchor && !$('#lp-history')) anchor.insertAdjacentHTML('afterend', historySection());
      if (hist.scrollToRecs) { hist.scrollToRecs = false; requestAnimationFrame(() => [...document.querySelectorAll('#app .section')].find((x) => x.querySelector('.grid3'))?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
      if (hist.scrollTo && $('#lp-history')) { hist.scrollTo = false; requestAnimationFrame(() => $('#lp-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
    }
    if (route === 'profile') { const app = $('#app'); if (app) app.innerHTML = settingsPage(); }
    if (route === 'dashboard' && state.diagnosis) {
      const welcome = $('#app .welcome');
      if (welcome && !$('.dash-diag')) welcome.outerHTML = dashboardCard();   // 인사 박스 → 청약 현황 카드(오른쪽에 마감 임박·내 기준 공고)
      tidyDashAside();
      if (state.user?.id && live.recs === null && !live.recsLoading) loadRecs();
      if (live.recs && hist.slide === 1) loadScore();
    }
  };

  document.addEventListener('change', (e) => {
    if (e.target.matches?.('[data-dl-all]')) { hist.dlSel = e.target.checked ? new Set((hist.records || []).map((r) => r.id)) : new Set(); render(); return; }
    if (e.target.dataset?.dlPick) { const id = Number(e.target.dataset.dlPick); if (e.target.checked) hist.dlSel.add(id); else hist.dlSel.delete(id); render(); return; }
    if (e.target.matches?.('[data-hist-view]')) { hist.viewId = Number(e.target.value) || null; render(); return; }
    const id = Number(e.target.dataset?.histPick);
    if (!id) return;
    if (e.target.checked) { if (hist.selected.size < 4) hist.selected.add(id); } else hist.selected.delete(id);
    render();
  });

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const act = b.dataset.action;
    if (act === 'hist-crit') {
      const k = b.dataset.value;
      if (criteria.has(k)) criteria.delete(k); else criteria.add(k);
      save('history-criteria', [...criteria]); render();
    } else if (act === 'hist-more') {
      hist.showAll = !hist.showAll; render();
    } else if (act === 'acct-export') {
      exportData();
    } else if (act === 'acct-csv') {
      downloadPicked();
    } else if (act === 'acct-delete') {
      deleteDialog();
    } else if (act === 'acct-delete-go') {
      deleteAccount();
    } else if (act === 'dash-fold') {
      const k = b.dataset.value; const other = k === 'soon' ? 'recs' : 'soon';   // 항상 하나만 펼침: 누른 상자를 열고 다른 상자는 닫음, 열린 상자를 누르면 서로 바뀜
      const openK = fold[k] === false ? k : other; fold.soon = openK === 'soon'; fold.recs = openK === 'recs'; render();
    } else if (act === 'dash-filter') {
      hist.dashFilter = b.dataset.value; render();
    } else if (act === 'dash-soon-all') {
      live.recsEligibleOnly = false; live.recsKind = null; live.recsSort = 'deadline'; live.recsShowAll = true; hist.scrollToRecs = true; go('result');
    } else if (act === 'dash-all') {
      live.recsSort = null; live.recsEligibleOnly = hist.dashFilter && hist.dashFilter !== 'all' ? hist.dashFilter : false; live.recsShowAll = true; hist.scrollToRecs = true; go('result');
    } else if (act === 'hist-clear') {
      hist.selected.clear(); render();
    } else if (act === 'hist-open') {
      hist.scrollTo = true; go('result');
    } else if (act === 'dash-retry') {
      live.recsError = null; live.recs = null; hist.loadingFor = 0; render(); loadRecs();
    } else if (act === 'ds-go') {
      hist.slide = Number(b.dataset.value) || 0; render(); if (hist.slide === 1) loadScore();
    } else if (act === 'cond-edit') {
      hist.editStep = Number(b.dataset.value) || 0; go('diagnosis'); window.scrollTo(0, 0);
    } else if (act === 'rp-del') {
      hist.pickDel = Number(b.dataset.id); render();
    } else if (act === 'rp-del-no') {
      hist.pickDel = null; render();
    } else if (act === 'rp-del-yes') {
      const id = Number(b.dataset.id); hist.pickDel = null;
      try {
        await api(`/users/${state.user.id}/diagnoses/${id}`, { method: 'DELETE' });
        hist.records = (hist.records || []).filter((r) => r.id !== id); hist.selected.delete(id);
        toast('진단 기록을 삭제했어요.');
      } catch (error) { toast(`삭제하지 못했어요: ${error.message}`); }
      render();
    } else if (act === 'rp-toggle') {
      hist.pickOpen = !hist.pickOpen; render();
    } else if (act === 'hist-apply') {
      e.preventDefault(); applyRecord(Number(b.dataset.id));
    } else if (act === 'hist-del') {
      e.preventDefault();
      const id = Number(b.dataset.id);
      try {
        await api(`/users/${state.user.id}/diagnoses/${id}`, { method: 'DELETE' });
        hist.records = (hist.records || []).filter((r) => r.id !== id); hist.selected.delete(id);
        toast('진단 기록을 삭제했어요.');
      } catch (error) { toast(`삭제하지 못했어요: ${error.message}`); }
      render();
    }
  });

  render();
})();
