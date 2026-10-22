/* 첫 페이지(#start) — 기능 소개 + 진단 시작 버튼
   · 주소에 화면 지정이 없으면 항상 #start 로 연다. 진단을 마치면 기존 메인(#home)으로 간다.
   · 왼쪽 "1분 청약 진단 시작하기"를 누르면 오른쪽 사이드바가 사이드바가 화면 전체로 펼쳐지고,
     그 안에서 팀의 6단계 진단 화면(app.js diagnosis())을 그대로 쓴다. 답변·단계 이동은 기존 버튼 처리를 그대로 탄다.
   · 펼친 진단에서 마지막 "진단 결과 보기"를 누르면 답변을 저장하고(로그인했으면 서버에도) 메인(#home)으로 돌아간다.
   이 파일은 index.html 에서 가장 마지막에 불러와야 한다(앞선 render 감싸기들을 다시 감싼다). */
(function () {
  const landing = { open: false };

  function landingHtml() {
    return `<div class="landing${landing.open ? ' open' : ''}">
  <section class="landing-intro" aria-label="서비스 소개">
    <span class="landing-chip">청약홈 · LH · SH 공고와 대출 상품을 매일 갱신해요</span>
    <h1>내 집을 찾는 일,<br><span class="o">내 조건부터</span><br><span class="g">시작해요</span></h1>
    <p>흩어진 청약 공고부터 주거 자금까지. 내 조건을 기준으로 지금 신청할 수 있는 집과 필요한 대출을 정리해 드려요.</p>
    <div class="landing-cta">
      <button type="button" class="lp-main" data-action="landing-open">1분 청약 진단 시작하기 <span aria-hidden="true">↗</span></button>
      <a class="lp-sub" href="#homes">공고 먼저 둘러보기</a>
    </div>
    <div class="landing-note">✓ 가입 없이 결과 확인 · ✓ 원할 때만 로그인</div>
    <div class="landing-sources"><small>공식 데이터로 계산해요</small>
      <div><span>청약홈</span><span>LH 한국토지주택공사</span><span>SH 서울주택도시공사</span><span>금융감독원 파인</span><span>한국부동산원</span></div>
    </div>
  </section>
  <aside class="landing-panel" aria-label="청약 진단">
    <div class="landing-side" ${landing.open ? 'aria-hidden="true"' : ''}>
      <div class="lp-window" aria-hidden="true">
      <div class="lp-window-bar"><i></i><i></i><i></i><span>진단 화면 미리보기</span></div>
      <div class="lp-mini">
        <div class="lp-eyebrow">GET TO KNOW YOUR CONDITIONS</div>
        <div class="lp-title">내 집 찾기, 내 조건부터.</div>
        <ol class="lp-steps" aria-hidden="true">
          ${['기본 정보','주택 소유','가족 구성','청약통장','소득·자산','희망 조건'].map((t, i) => `<li class="${i === 0 ? 'on' : ''}"><span>${i + 1}</span>${t}</li>`).join('')}
        </ol>
        <div class="lp-progress"><div></div></div>
        <div class="lp-card">
          <div class="lp-count">STEP 01 / 06</div>
          <b class="lp-q">기본 정보</b>
          <div class="lp-l">연령대</div>
          <div class="lp-opts"><span>20대</span><span class="on">30대</span><span>40대 이상</span></div>
          <div class="lp-l">혼인 상태</div>
          <div class="lp-opts"><span>미혼</span><span class="on">신혼</span><span>기혼</span></div>
          <div class="lp-actions"><span class="lp-prev">이전</span><span class="lp-next">다음 →</span></div>
        </div>
        <div class="lp-flow">
          <b>이렇게 이어져요</b>
          <div><span>01 내 조건 입력</span><em>지금</em></div>
          <div><span>02 결과 미리보기</span><em>가입 없이</em></div>
          <div><span>03 추천 공고 확인</span><em>서버 계산</em></div>
        </div>
      </div>
      </div>
      <p class="lp-caption">왼쪽 <b>1분 청약 진단 시작하기</b>를 누르면<br>이 화면이 펼쳐져요</p>
    </div>
    <div class="landing-diag" ${landing.open ? '' : 'aria-hidden="true"'}>
      <div class="landing-diag-top">
        <button type="button" class="lp-close" data-action="landing-close">← 첫 화면으로</button>
        <small>가입 없이 결과 확인</small>
      </div>
      ${landing.open ? diagnosis() : ''}
    </div>
  </aside>
</div>`;
  }

  const routeNow = () => (location.hash.slice(1) || 'home').split('/')[0];

  const isMember = () => Boolean(state.user?.member);

  // 상단 메뉴: "내 공간"은 계정 이름(○○님) 버튼과 같은 화면이라 메뉴에서 뺀다.
  // 로그인 전에는 로고가 첫 페이지(#start)로, 로그인 뒤에는 메인(#home)으로 간다.
  const prevHeader = header;
  header = function (route) {
    prevHeader(route);
    $('#header .nav-links a[href="#dashboard"]')?.remove();
    const brand = $('#header .brand');
    if (brand) brand.setAttribute('href', isMember() ? '#home' : '#start');
  };

  // 메인(#home): 상단 카테고리 메뉴(청약 진단·집 찾기·금융 정보·커뮤니티)와 같은 곳으로 가는 버튼은 정리한다
  function tidyHome() {
    $('#app .feature-strip')?.remove();                            // 자금 계획(= 금융 정보)·이용 흐름(= 상단 안내) 박스: 다른 곳과 겹침
    $('#app .community-preview')?.remove();                         // 커뮤니티 미리보기 = 상단 "커뮤니티" 카테고리와 겹침 (메인에는 메인에서만 쓰는 기능만)
    $('.quick-bar')?.remove();                                   // 집 찾기·금융 정보·우리 이야기 바로가기 카드 = 상단 메뉴와 같음
    document.querySelectorAll('#app .section-head a[href="#homes"], #app .section-head a[href="#community"], #app a.text-link[href="#homes"], #app a.text-link[href="#community"]').forEach((a) => a.remove());   // "공고 전체 보기"·"커뮤니티 둘러보기" = 상단 메뉴
    // 히어로 버튼: 진단 안 한 사람 → "진단 하러 가기", 진단한 사람 → "내 진단 결과 보기" + "진단 다시 하기"
    const actions = $('.hero-actions');
    if (actions) {
      actions.innerHTML = state.diagnosis
        ? `<a class="btn orange" href="${isMember() ? '#dashboard' : '#result'}">내 진단 결과 보기 <span>↗</span></a><button type="button" class="hero-link lp-redo" data-action="redo-diagnosis">진단 다시 하기</button>`
        : '<a class="btn orange" href="#diagnosis" data-action="redo-diagnosis">진단 하러 가기 <span>↗</span></a>';
    }
    // 아래 "시작 가이드" 칸의 진단 링크도 겹치므로 이용 흐름 안내로 바꾼다
    const guideLink = $('.feature-panel a[href="#diagnosis"]');
    if (guideLink) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.dataset.action = 'guide'; btn.className = 'lp-guide-link';
      btn.textContent = '이용 흐름 알아보기 ↗';
      guideLink.replaceWith(btn);
    }
    if (isMember()) $('.hero-help')?.remove();
    heroSummary();
    homeListings();
  }

  const DAY = 86400000;
  function daysLeft(h) {
    const e = h?.raw?.receipt_end; if (!e) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(e); end.setHours(0, 0, 0, 0);
    return Math.round((end - today) / DAY);
  }

  // 히어로 요약: 진단한 사람에게는 일반 소개 문구 대신 "내 현황" 숫자 3개를 보여 준다 (한눈에 읽히도록)
  function heroSummary() {
    const body = $('#app .hero-body');
    if (!body || !state.diagnosis || !live.recs) return;
    const mine = myRecs();                                       // 진단 결과 목록과 같은 기준 (관심 유형·비주택 제외)
    const houses = mine.map((r) => r.house);
    const eligible = mine.filter((r) => r.eligible).length;
    const soon = houses.filter((h) => { const d = daysLeft(h); return d != null && d >= 0 && d <= 7; }).length;
    const who = isMember() ? `${esc(state.user.name)}님의 청약 현황` : '내 청약 현황';
    const eyebrow = body.querySelector('.eyebrow'); if (eyebrow) { eyebrow.innerHTML = `<span class="dot"></span> ${who}`; eyebrow.classList.add('lp-eyebrow-ko'); }
    const p = body.querySelector('p');
    const stats = `<div class="lp-stats" aria-label="내 청약 현황">
      <div><b>${houses.length}<small>건</small></b><span>내 조건 추천 공고</span></div>
      <div><b>${eligible}<small>건</small></b><span>신청 자격 충족</span></div>
      <div><b>${soon}<small>건</small></b><span>7일 안에 접수 마감</span></div>
    </div>`;
    if (p) p.outerHTML = stats; else body.querySelector('.hero-actions')?.insertAdjacentHTML('beforebegin', stats);
  }

  // 메인 "다음 시작을 기다리는 집"
  // · 진단 기록이 없으면: 추천할 근거가 없으니 공고 대신 "진단 하러 가기" 안내
  // · 진단 기록이 있으면: 내 조건 추천 공고(서버 계산, 모자라면 접수 중 공고로 채움)를 전광판처럼 계속 흘려 보낸다
  let marquee = null;
  function homeListings() {
    if (marquee) { cancelAnimationFrame(marquee.raf); marquee = null; }
    const grid = $('#app .section .grid3');
    if (!grid) return;
    const head = grid.closest('.section')?.querySelector('.section-head p');
    if (!state.diagnosis) {
      if (head) head.textContent = '내 조건을 알려 주시면, 지금 신청할 수 있는 공고를 골라 드려요.';
      grid.outerHTML = `<div class="lp-reco-empty"><div><b>아직 추천할 공고가 없어요</b><p>6단계 진단을 마치면 내 조건에 맞는 공고를 여기에서 보여 드려요.</p></div><button type="button" class="btn orange" data-action="redo-diagnosis">진단 하러 가기 <span>↗</span></button></div>`;
      return;
    }
    if (state.user?.id && live.recs === null && !live.recsLoading) loadRecs();
    const recs = [...myRecs()].sort((x, y) => (y.eligible ? 1 : 0) - (x.eligible ? 1 : 0)).map((r) => r.house).filter(Boolean);   // 신청 자격 충족 공고를 앞에
    const seen = new Set(recs.map((h) => h.id));
    const eligibleIds = new Set(myRecs().filter((r) => r.eligible).map((r) => r.house.id));
    const dd = (h) => { const d = daysLeft(h); return d == null || d < 0 ? 9999 : d; };
    const houses = (recs.length ? recs : featuredHouses().filter((h) => !seen.has(h.id))).slice(0, 12)   // 추천이 있으면 추천만 (접수 중 공고를 섞지 않는다)
      .sort((x, y) => dd(x) - dd(y) || (eligibleIds.has(y.id) ? 1 : 0) - (eligibleIds.has(x.id) ? 1 : 0));   // 마감이 가까운 순서(D-day 오름차순)
    if (head) head.textContent = (recs.length ? '내 진단 조건으로 고른 공고예요.' : '지금 접수 중인 공고예요.') + ' 접수 마감이 가까운 순서로 흘러가요. 마우스를 올리면 잠시 멈춰요.';
    grid.closest('.section')?.setAttribute('id', 'lp-reco');
    const h2 = grid.closest('.section')?.querySelector('.section-head h2'); if (h2 && recs.length) h2.textContent = '내 조건에 맞는 공고';
    if (houses.length < 4) return;                                // 공고가 적으면 원래 3칸 그대로
    grid.outerHTML = `<div class="lp-marquee" aria-label="추천 공고 (자동으로 넘어가요)"><div class="lp-track">${houses.map((h) => houseCard(h)).join('')}</div></div>`;
    document.querySelectorAll('.lp-track .house-card').forEach((card) => {   // 카드마다 D-day 표시
      const h = houseById(Number(card.querySelector('[data-hid]')?.dataset.hid));
      const d = daysLeft(h);
      if (d == null || d < 0) return;
      card.querySelector('.house-body .tags')?.insertAdjacentHTML('beforeend', `<span class="lp-dday${d <= 2 ? ' hot' : ''}">${d === 0 ? '오늘 마감' : `마감 D-${d}`}</span>`);
    });
    if (typeof cardMedia === 'function') cardMedia();            // 카드 사진(로드뷰) 다시 붙이기
    startMarquee();
  }

  function startMarquee() {
    const box = $('.lp-marquee'), track = $('.lp-track');
    if (!box || !track || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const m = { raf: 0, offset: 0, last: 0, paused: false };
    marquee = m;
    box.addEventListener('mouseenter', () => { m.paused = true; });
    box.addEventListener('mouseleave', () => { m.paused = false; });
    box.addEventListener('focusin', () => { m.paused = true; });
    box.addEventListener('focusout', () => { m.paused = false; });
    const SPEED = 26;                                             // px / 초
    const step = (t) => {
      if (marquee !== m || !track.isConnected) return;
      const dt = m.last ? Math.min(64, t - m.last) / 1000 : 0; m.last = t;
      if (!m.paused) m.offset += SPEED * dt;
      const first = track.firstElementChild;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      if (first && m.offset >= first.offsetWidth + gap) {         // 맨 앞 카드가 다 지나가면 맨 뒤로 옮겨 끝없이 이어지게
        m.offset -= first.offsetWidth + gap;
        track.appendChild(first);
      }
      track.style.transform = `translateX(${-m.offset}px)`;
      m.raf = requestAnimationFrame(step);
    };
    m.raf = requestAnimationFrame(step);
  }

  // 진단 단계의 "나중에 입력하기"는 diagnosis-flow.js 가 단계마다 직접 그린다 (누르면 그 단계를 건너뛸 수 있게 '다음'이 나타남)
  function addLaterButton() {}

  const prevRender = render;
  render = function () {
    // 첫 페이지는 로그인하지 않았을 때만 — 로그인한 사람이 #start 로 오면 메인으로 보낸다
    if (routeNow() === 'start' && isMember()) { landing.open = false; location.replace('#home'); return; }
    const active = routeNow() === 'start';
    document.body.classList.toggle('landing-active', active);
    document.body.classList.toggle('lp-home', routeNow() === 'home');
    if (!active) { landing.open = false; prevRender(); if (routeNow() === 'home') tidyHome(); addLaterButton(); return; }
    header('start');
    const scroller = $('.landing-diag');
    const top = scroller ? scroller.scrollTop : 0;
    $('#app').innerHTML = landingHtml();
    const next = $('.landing-diag');
    if (next) next.scrollTop = top;
    addLaterButton();
  };

  function openPanel() {
    if (landing.open) return;
    // 닫힌 상태로 한 번 그린 뒤 다음 프레임에 open 을 붙여야 너비가 34% → 100% 로 미끄러지듯 펼쳐진다
    state.step = 0;
    landing.open = true;
    const root = $('.landing');
    $('.landing-diag').insertAdjacentHTML('beforeend', diagnosis());
    addLaterButton();
    root.offsetWidth; // 강제 레이아웃: 전환 시작점 확정
    root.classList.add('open');
    $('.landing-side').setAttribute('aria-hidden', 'true');
    $('.landing-diag').removeAttribute('aria-hidden');
    setTimeout(() => $('.landing-diag .step-count')?.closest('section')?.querySelector('button')?.focus({ preventScroll: true }), 650);
  }

  function closePanel() {
    if (!landing.open) return;
    landing.open = false;
    const root = $('.landing');
    root.classList.remove('open');
    setTimeout(() => { if (!landing.open && routeNow() === 'start') render(); }, 620);
  }

  async function finishDiagnosis() {
    state.diagnosis = { ...state.answers }; save('diagnosis', state.diagnosis);
    if (typeof live !== 'undefined') { live.recs = null; live.userTried = false; live.userError = null; }
    landing.open = false;
    if (state.user?.id && typeof saveProfile === 'function') {
      try { await saveProfile(); } catch (error) { toast(error.message); }
    }
    go('home');
    window.scrollTo(0, 0);
    toast('진단을 저장했어요. 내 조건에 맞춘 메인 화면으로 이동했어요.');
  }

  // window 캡처 단계에서 먼저 받아서, #start 에서의 마지막 단계만 결과 화면 대신 메인으로 보낸다
  window.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const act = b.dataset.action;
    if (act === 'next' && state.step === 5) window.dispatchEvent(new CustomEvent('cy:diagnosis-done'));   // 진단 기록 저장용 신호 (diagnosis-history.js)
    if (act === 'landing-open') { e.preventDefault(); openPanel(); return; }
    if (act === 'landing-close') { e.preventDefault(); closePanel(); return; }
    if (act === 'redo-diagnosis') { e.preventDefault(); state.step = 0; if (state.diagnosis) state.answers = { ...state.answers, ...state.diagnosis }; go('diagnosis'); window.scrollTo(0, 0); return; }
    if (act === 'logout') { setTimeout(() => { if (!isMember()) go('start'); }, 0); return; }   // 로그아웃하면 첫 페이지로
    if (routeNow() === 'start' && act === 'next' && state.step === 5) {
      e.preventDefault(); e.stopImmediatePropagation();
      finishDiagnosis();
    }
  }, true);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && landing.open && !$('#modal-root').innerHTML.trim()) closePanel(); });

  // 주소에 화면 지정이 없으면: 로그인 전에는 첫 페이지, 로그인 뒤에는 메인
  if (!location.hash) history.replaceState(null, '', isMember() ? '#home' : '#start');
  render();
})();
