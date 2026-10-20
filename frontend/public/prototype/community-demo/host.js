/* Reuse the service header; only navigation/layout crosses the demo-data boundary. */
(() => {
  const serviceRoutes = new Set(['home', 'diagnosis', 'homes', 'finance', 'dashboard']);
  const renderService = render;
  let frame = null;
  let frameReady = false;
  let detach = () => {};

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
    const raw = frame.contentWindow.location.hash.slice(1) || 'home';
    const next = raw === 'home' ? 'community' : raw.startsWith('post/') ? raw : `community/${raw}`;
    if (location.hash !== `#${next}`) location.hash = next;
  }

  render = function () {
    const route = (location.hash.slice(1) || 'home').split('/')[0];
    const active = route === 'community' || route === 'post';
    document.body.classList.toggle('community-demo-active', active);
    if (!active) {
      detach(); frame = null; frameReady = false;
      renderService();
      return;
    }

    // Same logo, menu, active underline and login controls as every service page.
    // No account or diagnosis object is passed into the demo frame.
    header('community');

    if (!frame || !frame.isConnected) {
      frameReady = false;
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
    const data = event.data;
    if (data?.type === 'cheongyak:community-service-route' && serviceRoutes.has(data.route)) go(data.route);
  });
  render();
})();
