/* 진단 기록 — 진단을 마칠 때마다 서버에 한 건씩 저장하고(가점·추천 수는 서버 계산),
   · 진단 결과 화면: 날짜별 기록 목록 + 2건 이상 골라 "필요한 기준만" 나란히 비교
   · 내 공간: 맨 위에 최근 진단 카드(눈에 띄게) — 결과 보기 / 기록 비교로 바로 이동
   index.html 에서 landing.js 다음에 불러온다 (render 를 한 번 더 감싼다). */
(function () {
  const hist = { records: null, loadingFor: 0, pending: false, posting: false, selected: new Set(), scrollTo: false };

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
    children: ['미성년 자녀', (r) => r.answers.children],
    region: ['현재 거주', (r) => r.answers.region],
    wish: ['희망 지역', (r) => r.answers.wish],
    type: ['관심 유형', (r) => r.answers.type],
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
      const rec = await api(`/users/${state.user.id}/diagnoses`, { method: 'POST', body: { answers: state.diagnosis } });
      hist.records = [rec, ...(hist.records || [])];
      hist.pending = false;
    } catch (error) { toast(`진단 기록을 저장하지 못했어요: ${error.message}`); hist.pending = false; }
    finally { hist.posting = false; render(); }
  }

  // 진단을 마치면 신호가 온다 → 프로필 저장이 끝난(사용자 번호가 있는) 다음 render 에서 기록을 남긴다
  window.addEventListener('cy:diagnosis-done', () => { hist.pending = true; });

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
    const rows = recs.map((r) => `<label class="hist-row${hist.selected.has(r.id) ? ' on' : ''}">
        <input type="checkbox" data-hist-pick="${r.id}" ${hist.selected.has(r.id) ? 'checked' : ''} ${!hist.selected.has(r.id) && hist.selected.size >= 4 ? 'disabled' : ''}>
        <span class="hist-date">${when(r.created_at, true)}${r.id === latestId ? ' <em>최근</em>' : ''}</span>
        <span class="hist-score"><b>${r.score}</b>점</span>
        <span class="hist-meta">추천 ${r.recommend_count}건 · 자격 충족 ${r.eligible_count}건</span>
        <span class="hist-meta">${esc(r.answers.wish || '전체')} · ${esc(r.answers.type || '전체')}</span>
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
      ${recs.length ? `<div class="hist-list">${rows}</div>${compare}` : '<div class="empty"><h3>아직 저장된 기록이 없어요</h3><p>진단을 마치면 이곳에 날짜별로 쌓여요.</p></div>'}${guest}</section>`;
  }

  /* ── 내 공간: 최근 진단 카드 ── */
  function dashboardCard() {
    const r = hist.records?.[0];
    const a = state.diagnosis;
    const n = hist.records?.length || 0;
    const facts = r
      ? `<div class="dash-diag-facts"><div><small>청약 가점</small><b>${r.score}<span>/84</span></b></div><div><small>추천 공고</small><b>${r.recommend_count}<span>건</span></b></div><div><small>신청 자격 충족</small><b>${r.eligible_count}<span>건</span></b></div></div>`
      : `<p class="dash-diag-sub">${esc(a.age)} · ${esc(a.marriage)} · 희망 ${esc(a.wish)} · ${esc(a.type)}</p>`;
    return `<section class="dash-diag" aria-label="내 진단 결과">
      <div class="dash-diag-main"><div class="eyebrow">MY DIAGNOSIS</div><h3>내 진단 결과</h3><p class="dash-diag-sub">${r ? `최근 진단 ${when(r.created_at, true)}` : '최근 진단 결과'}</p>${facts}</div>
      <div class="dash-diag-actions"><a class="btn orange" href="#result">진단 결과 보기 <span>↗</span></a>${n >= 1 ? `<button type="button" class="btn secondary" data-action="hist-open">진단 기록 ${n}건 · 비교하기</button>` : ''}</div>
    </section>`;
  }

  const prevRender = render;
  render = function () {
    prevRender();
    sync();
    const route = routeNow();
    if (route === 'result' && state.diagnosis) {
      const anchor = $('#app .grid2');
      if (anchor && !$('#lp-history')) anchor.insertAdjacentHTML('afterend', historySection());
      if (hist.scrollTo && $('#lp-history')) { hist.scrollTo = false; requestAnimationFrame(() => $('#lp-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
    }
    if (route === 'dashboard' && state.diagnosis) {
      const welcome = $('#app .welcome');
      if (welcome && !$('.dash-diag')) {
        welcome.querySelector('a[href="#result"]')?.remove();   // 작은 "진단 결과" 버튼 → 아래 큰 카드로
        welcome.insertAdjacentHTML('afterend', dashboardCard());
      }
    }
  };

  document.addEventListener('change', (e) => {
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
