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

  async function loadRecords(userId) {
    hist.loadingFor = userId;
    try { hist.records = await api(`/users/${userId}/diagnoses`); }
    catch { hist.records = []; }
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
      hist.records = [rec, ...(hist.records || [])];
      hist.pending = false;
    } catch (error) { toast(`진단 기록을 저장하지 못했어요: ${error.message}`); hist.pending = false; }
    finally { hist.posting = false; render(); }
  }

  // 진단을 마치면 신호가 온다 → 프로필 저장이 끝난(사용자 번호가 있는) 다음 render 에서 기록을 남긴다
  // 내 조건 저장(saveProfile)이 진행 중인지 기억해 둔다 (기록·추천은 저장이 끝난 뒤에)
  const liveSaveProfile = saveProfile;
  saveProfile = function (...args) { const p = liveSaveProfile(...args); hist.saving = p; p.finally(() => { if (hist.saving === p) hist.saving = null; }); return p; };

  window.addEventListener('cy:diagnosis-done', () => { hist.pending = true; live.recsEligibleOnly = false; live.recsShowAll = false; live.recsKind = null; hist.viewId = null; });   // 새 진단이면 결과 목록 보기 방식도 처음으로

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
    const shown = hist.showAll ? recs : recs.filter((r, i) => i < LIST_PAGE || hist.selected.has(r.id));
    const rows = shown.map((r) => `<label class="hist-row${hist.selected.has(r.id) ? ' on' : ''}">
        <input type="checkbox" data-hist-pick="${r.id}" ${hist.selected.has(r.id) ? 'checked' : ''} ${!hist.selected.has(r.id) && hist.selected.size >= 4 ? 'disabled' : ''}>
        <span class="hist-date">${when(r.created_at, true)}${r.id === latestId ? ' <em>최근</em>' : ''}</span>
        <span class="hist-score"><b>${r.score}</b>점</span>
        <span class="hist-meta">추천 ${r.recommend_count}건 · 자격 충족 ${r.eligible_count}건</span>
        <span class="hist-meta">${esc(r.answers.wish || '전체')} · ${esc(typeLabel(r.answers.type))}</span>
        <button type="button" class="hist-del" data-action="hist-del" data-id="${r.id}" aria-label="${when(r.created_at, true)} 기록 삭제">삭제</button>
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
    return `<section class="section" id="lp-history"><div class="section-head"><div><div class="eyebrow">MY DIAGNOSIS HISTORY</div><h2>날짜별 진단 기록 <small>${recs.length}건</small></h2><p>진단을 마칠 때마다 그날의 조건과 가점·추천 결과가 저장돼요.</p></div><button type="button" class="btn secondary small" data-action="redo-diagnosis">새로 진단하기</button></div>
      ${recs.length ? `<div class="hist-list">${rows}</div>${recs.length > LIST_PAGE ? `<button type="button" class="hist-more" data-action="hist-more">${hist.showAll ? '최근 5건만 보기' : `기록 ${recs.length}건 모두 보기`}</button>` : ''}${compare}` : '<div class="empty"><h3>아직 저장된 기록이 없어요</h3><p>진단을 마치면 이곳에 날짜별로 쌓여요.</p></div>'}${guest}</section>`;
  }

  /* ── 내 공간 카드 안: 진단 때 입력한 조건 전체 (예전 '내 조건 요약' 박스를 카드로 옮김) ── */
  function condGrid(a) {
    const yr = (v) => (v === '' || v == null ? '–' : `${v}년`);
    const man = (v) => (v === '' || v == null ? '입력 안 함' : Number(v) >= 10000 ? `${(Number(v) / 10000).toFixed(Number(v) % 10000 ? 1 : 0)}억 원` : `${Number(v).toLocaleString('ko-KR')}만 원`);
    const rows = [
      ['현재 거주', a.region], ['세대주', a.head], ['주택 소유', a.ownership + (a.ownership === '무주택' ? ` · 과거 소유 ${a.firstHome}` : '')],
      ['무주택 기간', yr(a.years)], ['부양가족', `${a.family ?? 0}명`], ['미성년 자녀', a.children],
      ['통장 가입', yr(a.account)], ['납입 회차', `${a.payments ?? 0}회`], ['예치금', man(a.deposit)],
      ['5년 내 당첨', a.won5], ['연 소득', a.income], ['보유 현금', Number(a.assets) ? man(a.assets) : '입력 안 함'],
      ['희망 지역', a.wish], ['관심 유형', typeLabel(a.type)],
    ];
    return `<div class="dash-cond"><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v ?? '–')}</dd></div>`).join('')}</dl>
      <button type="button" class="dash-cond-edit" data-action="redo-diagnosis">조건 수정하기 (다시 진단) →</button></div>`;
  }

  /* ── 내 공간: 최근 진단 카드 ── */
  function dashboardCard() {
    const r = hist.records?.[0];
    const a = state.diagnosis;
    const n = hist.records?.length || 0;
    const mine = live.recs ? myRecs() : null;              // 지금 추천(관심 유형 반영)이 있으면 그 숫자, 없으면 최근 기록 숫자
    const score = live.recs?.[0]?.score ?? r?.score;
    const fact = (label, value, unit) => `<div><small>${label}</small><b>${value ?? '–'}<span>${unit}</span></b></div>`;
    const facts = `<div class="dash-diag-facts">${fact('청약 가점', score, '/84')}${fact('1순위 가능', mine ? mine.filter((x) => x.fp === '1순위 가능').length : null, '건')}${fact('추천 공고', mine ? mine.length : r?.recommend_count, '건')}${fact('자금 충족', mine ? mine.filter((x) => x.eligible).length : r?.eligible_count, '건')}</div>`;
    // 자금: 보유 현금과 계약금 10% 기준 분양가 상한 + 대출·자금 계산 바로가기 (계산기 자체는 금융 정보 화면)
    const assets = Number(a.assets) || 0;
    const eok = (man) => (man >= 10000 ? `${(man / 10000).toFixed(man % 10000 ? 1 : 0)}억 원` : `${man.toLocaleString('ko-KR')}만 원`);
    const moneyRow = `<div class="dash-money"><div><small>주거에 쓸 수 있는 현금</small><b>${assets ? eok(assets) : '아직 입력 전'}</b></div><div><small>계약금 10% 기준 분양가</small><b>${assets ? `${eok(assets * 10)} 이하` : '–'}</b></div>
      <div class="dash-money-actions"><button type="button" data-action="finance-tab" data-value="대출">내 대출 한도·금리 보기 →</button><button type="button" data-action="finance-tab" data-value="자금 계산">자금 계획 계산하기 →</button></div></div>`;
    return `<section class="dash-diag" aria-label="내 진단 결과">
      <div class="dash-diag-left">
        <div class="dash-diag-main"><div class="eyebrow">MY SPACE</div><h3>${state.user?.member ? `${esc(state.user.name)}님의 청약 현황` : '내 청약 현황'}</h3><p class="dash-diag-sub">${r ? `최근 진단 ${when(r.created_at, true)}` : '최근 진단'} · ${esc(a.age)} · ${esc(a.marriage)} · 희망 ${esc(a.wish)} · ${esc(typeLabel(a.type))} <button type="button" class="dash-cond-toggle" data-action="dash-cond" aria-expanded="${!!hist.condOpen}">${hist.condOpen ? '조건 접기' : '내 조건 전체 보기'}<span aria-hidden="true"></span></button></p>${hist.condOpen ? condGrid(a) : ''}${facts}${moneyRow}</div>
        <div class="dash-diag-actions"><a class="btn orange" href="#result">가점 근거·전체 결과 <span>↗</span></a>${n >= 1 ? `<button type="button" class="btn secondary" data-action="hist-open">진단 기록 ${n}건 · 비교</button>` : ''}<a class="dash-diag-report" href="#report">청약 준비 리포트 · PDF 저장 ↗</a></div>
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
    let soonBox;
    if (loading) soonBox = foldBox('soon', '마감 임박한 내 추천 공고', '', '<p class="dash-soon-empty">추천 공고를 불러오는 중이에요…</p>');
    else {
      const open = myRecs().map((r) => ({ r, d: ddayOf(r.house) })).filter((x) => x.d != null && x.d >= 0).sort((x, y) => x.d - y.d);
      const rows = groupByName(open).slice(0, ROWS).map(({ r, d, n }) => `<a class="dash-soon-row" href="#detail/${r.house.id}">
        <span class="dash-soon-dday${d <= 3 ? ' hot' : ''}">${ddayText(d)}</span>
        <span class="dash-soon-main"><b>${esc(r.house.name)}</b><small>${esc(r.house.region)} · ${esc(r.house.type)}${n > 1 ? ` · 주택형 ${n}개` : ''}${r.fp === '1순위 가능' ? ' · 1순위 가능' : ''}</small></span></a>`).join('');
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
      const filters = [['all', '전체', all.length], ['first', '1순위 가능', all.filter((r) => r.fp === '1순위 가능').length], ['eligible', '자금 충족', all.filter((r) => r.eligible).length]];
      const list = all.filter((r) => f === 'all' || (f === 'first' ? r.fp === '1순위 가능' : r.eligible));
      const chips = `<div class="dash-mini-chips" role="group" aria-label="공고 보기">${filters.map(([k, label, cnt]) => `<button type="button" class="${f === k ? 'on' : ''}" data-action="dash-filter" data-value="${k}">${label} ${cnt}</button>`).join('')}<span class="dash-mini-note">자금 → 1순위 → 당첨 구간 순</span></div>`;
      const rows = groupByName(list.map((r) => ({ r, d: ddayOf(r.house) }))).slice(0, ROWS).map(({ r, d, n }) => `<a class="dash-soon-row" href="#detail/${r.house.id}">
        <span class="dash-soon-dday fp ${FP_CLASS[r.fp] || 'fp-etc'}">${esc(r.fp)}</span>
        <span class="dash-soon-main"><b>${esc(r.house.name)}</b><small>${esc(r.house.region)} · ${esc(r.house.type)}${n > 1 ? ` · 주택형 ${n}개` : ''} · ${r.eligible ? '자금 충족' : '자금 확인'}${d != null && d >= 0 ? ` · ${ddayText(d)}` : ''}</small></span></a>`).join('');
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

  /* ── 계정 설정 (#profile): 상단 이름 버튼 옆 톱니바퀴로 들어온다 ── */
  function settingsPage() {
    const u = state.user;
    const a = state.diagnosis;
    const n = hist.records?.length || 0;
    const last = hist.records?.[0];
    const row = (k, v) => `<div class="kv"><span>${k}</span><strong>${v}</strong></div>`;
    return `<div class="wrap page reveal settings-page"><div class="page-title"><h1>계정 설정</h1><p>계정 정보와 저장된 진단 정보를 관리해요. 청약 현황은 <a href="#dashboard" class="text-link">마이페이지</a>에서 볼 수 있어요.</p></div>
      <section class="panel"><h3>계정</h3>${u?.member ? row('닉네임', esc(u.name)) + row('이메일', esc(u.email)) : '<p class="settings-note">로그인하면 진단 기록과 관심 공고를 다른 기기에서도 이어 볼 수 있어요.</p>'}
        <div class="settings-actions">${u?.member ? '<button type="button" class="btn secondary small" data-action="logout">로그아웃</button>' : '<button type="button" class="btn small" data-action="signup">로그인</button>'}</div></section>
      <section class="panel"><h3>진단 정보</h3>${row('진단 상태', a ? '완료' : '아직 없음')}${last ? row('최근 진단', when(last.created_at, true)) : ''}${row('저장된 진단 기록', `${n}건`)}
        <div class="settings-actions">${a ? '<button type="button" class="btn small" data-action="redo-diagnosis">진단 정보 수정 (다시 진단)</button>' : '<a class="btn small" href="#diagnosis">진단 시작하기</a>'}${n ? '<button type="button" class="btn secondary small" data-action="hist-open">진단 기록 보기 · 비교</button>' : ''}</div></section>
      <section class="panel"><h3>이 브라우저의 데이터</h3><p class="settings-note">진단 정보는 추천 계산을 위해 서버(DB)에 저장돼요. 아래 버튼은 이 브라우저에 남은 진단 정보만 지워요. 서버에 저장된 정보를 지우는 기능은 아직 없어요.</p>
        <div class="settings-actions">${a ? '<button type="button" class="btn secondary small" data-action="delete-diagnosis">이 브라우저의 진단 정보 삭제</button>' : ''}</div></section>
    </div>`;
  }

  // 상단: 이름(마이페이지) 버튼 옆에 톱니바퀴 → 계정 설정
  const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  const prevHeader = header;
  header = function (route) {
    prevHeader(route);
    const pill = $('#header .nav-account a.pill');
    if (pill && !$('#header .nav-gear')) pill.insertAdjacentHTML('afterend', `<a class="nav-gear${route === 'profile' ? ' active' : ''}" href="#profile" aria-label="계정 설정" title="계정 설정">${GEAR}</a>`);
  };

  const prevRender = render;
  render = function () {
    prevRender();
    sync();
    const route = routeNow();
    if (route === 'result' && state.diagnosis) bannerPicker();
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
    }
  };

  document.addEventListener('change', (e) => {
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
    } else if (act === 'dash-cond') {
      hist.condOpen = !hist.condOpen; render();
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
