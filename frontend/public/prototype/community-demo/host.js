/* Reuse the service login/header; only a minimal account scope crosses the demo boundary. */
(() => {
  const sessions = window.CheongyakCommunitySession;
  const serviceRoutes = new Set(['home', 'diagnosis', 'homes', 'finance', 'dashboard']);
  const renderService = render;
  let frame = null;
  let frameReady = false;
  let detach = () => {};
  let frameAccount = null;
  let promptedFor = null;
  let resumeCommunity = null;

  const currentSession = () => sessions.fromUser(state.user);
  window.CheongyakCommunityHost = Object.freeze({ getSession: currentSession });

  function releaseFrame() {
    detach();
    detach = () => {};
    frame?.remove();
    frame = null;
    frameReady = false;
    frameAccount = null;
  }

  function gate(account) {
    const title = '로그인이 필요합니다';
    const description = '커뮤니티는 로그인 후 이용할 수 있어요. 게시판은 함께 보고 개인 활동은 계정별로 보관해요.';
    const controls = '<div class="community-access-actions"><button class="btn" data-community-access="login">' +
      '로그인하기' +
      '</button><button class="btn secondary" data-community-access="leave">다른 기능 둘러보기</button></div>';
    $('#app').innerHTML = `<div class="wrap page"><section class="panel community-access" aria-labelledby="community-access-title"><div class="eyebrow">COMMUNITY</div><h1 id="community-access-title">${title}</h1><p>${description}</p>${controls}</section></div>`;
    const key = `${location.hash}:${account?.accountId || 'guest'}`;
    if (promptedFor !== key) {
      promptedFor = key;
      modal(`<h2>${title}</h2><p>${description}</p>${controls}`);
    }
  }

  function sizeFrame() {
    if (!frame || !frame.isConnected) return;
    const shellHeight = ['.demo-banner', '#header'].reduce((total, selector) =>
      total + (document.querySelector(selector)?.getBoundingClientRect().height || 0), 0);
    document.body.style.setProperty('--community-shell-height', Math.ceil(shellHeight) + 'px');
  }
  const shellObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(sizeFrame) : null;
  for (const selector of ['.demo-banner', '#header']) {
    const element = document.querySelector(selector);
    if (element) shellObserver?.observe(element);
  }
  window.addEventListener('resize', sizeFrame);

  function childRoute() {
    const raw = location.hash.slice(1) || 'home';
    if (raw === 'community') return 'home';
    if (raw.startsWith('community/')) return raw.slice('community/'.length);
    return raw; // post/demo-post-* stays within the community demo.
  }

  function syncAddress() {
    if (!frameReady || !frame) return;
    const account = currentSession();
    if (!account || account.accountId !== frameAccount) { render(); return; }
    const raw = frame.contentWindow.location.hash.slice(1) || 'home';
    const next = raw === 'home' ? 'community' : raw.startsWith('post/') ? raw : `community/${raw}`;
    if (location.hash !== `#${next}`) location.hash = next;
  }

  render = function () {
    const route = (location.hash.slice(1) || 'home').split('/')[0];
    const active = route === 'community' || route === 'post';
    const account = currentSession();
    const allowed = active && !!account;
    document.body.classList.toggle('community-demo-active', allowed);
    if (!active) {
      if (resumeCommunity && afterLogin === resumeCommunity) afterLogin = null;
      resumeCommunity = null;
      promptedFor = null;
      releaseFrame();
      renderService();
      const preview = document.querySelector('#app .community-preview > div:last-child');
      if (preview && !account) preview.innerHTML = '<p>로그인 후 이웃들의 이야기를 만나보세요.</p><a class="btn soft" href="#community">커뮤니티 로그인 안내 →</a>';
      return;
    }

    // Same logo, menu, active underline and login controls as every service page.
    // Only accountId/name/demo are exposed; no service profile or diagnosis is passed.
    header('community');
    if (!allowed) {
      releaseFrame();
      gate(account);
      return;
    }
    promptedFor = null;
    if (frameAccount !== account.accountId) releaseFrame();

    if (!frame || !frame.isConnected) {
      frameReady = false;
      frameAccount = account.accountId;
      $('#app').innerHTML = '<iframe class="community-demo-frame" title="커뮤니티 · 시연 전용 가짜 데이터"></iframe>';
      frame = $('.community-demo-frame');
      const mountedFrame = frame;
      frame.addEventListener('load', () => {
        if (frame !== mountedFrame || !mountedFrame.isConnected) return;
        detach();
        frameReady = true;
        const child = frame.contentWindow;
        child.addEventListener('hashchange', syncAddress);
        detach = () => child.removeEventListener('hashchange', syncAddress);
        if (child.location.hash !== `#${childRoute()}`) child.location.hash = childRoute();
      });
      frame.src = `community-demo/index.html#${childRoute()}`;
    } else if (frameReady && frame.contentWindow.location.hash !== `#${childRoute()}`) {
      frame.contentWindow.location.hash = childRoute();
    }
    sizeFrame();
  };

  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    const account = currentSession();
    if (!account || account.accountId !== frameAccount) return;
    const data = event.data;
    if (data?.type === 'cheongyak:community-service-route' && serviceRoutes.has(data.route)) go(data.route);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-community-access]');
    if (!button) return;
    event.preventDefault();
    if (button.dataset.communityAccess === 'leave') {
      afterLogin = null;
      go('home');
      return;
    }
    const destination = location.hash.slice(1) || 'community';
    resumeCommunity = () => { resumeCommunity = null; go(destination); };
    afterLogin = resumeCommunity;
    login();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && resumeCommunity && afterLogin === resumeCommunity) {
      afterLogin = null;
      resumeCommunity = null;
    }
  });
  window.addEventListener('storage', event => {
    if (event.key !== null && event.key !== 'cydemo-user') return;
    state.user = read('user', null);
    render();
  });
  render();
})();
