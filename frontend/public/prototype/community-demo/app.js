'use strict';

(() => {
  const $ = s => document.querySelector(s),
    esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H15v-7H9v7H3Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    message: '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 1 1 19 0Z"/><path d="M7 10h10M7 14h6"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
    pen: '<path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15Z"/>',
    star: '<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    heart: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 3 11 8 15 5-4 13-10 8-15Z"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    arrow: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    pin: '<path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  const I = n => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n] || paths.grid}</svg>`;
  const B = (text, attrs = '', cls = 'secondary') => `<button class="${cls}" ${attrs}>${text}</button>`;
  let state = window.CheongyakCommunityDemoStorage.load(localStorage);
  const files = window.CheongyakCommunityAttachments.repository;
  const recommendations = window.CheongyakCommunityRecommendations;
  const management = window.CheongyakCommunityManagement;
  const drafts = new Map(),
    pendingFiles = new Set(),
    uploading = new Set(),
    uploadTokens = new Map(),
    fileURLs = new Map();
  const chosen = new Set();
  let friendPage = 1,
    recommendPage = 1,
    requestPage = 1,
    conversationPage = 1,
    friendSearch = '',
    conversationQuery = '';
  let route = 'home',
    selected = 'free',
    scope = '지역',
    region = state.me.region,
    age = state.me.age,
    query = '',
    page = 1,
    sort = 'latest',
    period = 'month',
    chatId = 1,
    postId = null,
    lastRoute = 'home';
  const person = id => id === 0 ? state.me : state.people.find(p => p.id === id) || state.me,
    board = id => state.boards.find(b => b.id === id) || state.boards[0];
  const av = (p, size = '') => `<span class="avatar ${size}" style="background:${esc(p.color)}">${esc(p.name[0])}</span>`;
  const when = p => {
    const m = Math.max(0, Math.floor((Date.now() - p.created) / 60000));
    return m < 1 ? '방금 전' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
  };
  function save() {
    try {
      window.CheongyakCommunityDemoStorage.save(localStorage, state);
    } catch {
      toast('저장 공간이 부족해 이번 화면에서만 유지됩니다.');
    }
  }
  function toast(t) {
    $('#toast').textContent = t;
    $('#toast').classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2600);
  }
  document.body.innerHTML = `<div class="community-header"><div class="community-header-inner"><nav class="section-nav" aria-label="커뮤니티 메뉴"><button data-go="home">커뮤니티 홈</button><button data-go="boards">게시판 찾기</button><button data-go="friends">친구 <span id="friend-count"></span></button><button data-go="messages">메시지 <span id="message-count"></span></button></nav><div class="community-tools"><div class="header-actions"><button data-go="messages" class="icon-button" aria-label="메시지함">${I('message')}<i id="header-unread"></i></button><button data-go="settings" class="header-profile" aria-label="커뮤니티 내 정보"><span id="header-avatar"></span></button></div></div></div></div><div class="workspace"><aside id="sidebar" class="sidebar"></aside><main id="content" tabindex="-1"></main><aside id="rightbar" class="rightbar"></aside></div><footer class="site-footer"><strong>청약돼?!</strong><span>내 집을 찾는 일, 함께 살아가는 이야기.</span><span>커뮤니티 디자인 시안 · 작성 내용은 이 브라우저에만 저장됩니다.</span></footer><dialog id="modal" aria-label="커뮤니티 대화상자"></dialog><div id="toast" role="status" aria-live="polite"></div>`;
  function routeHash() {
    return route === 'post' ? 'post/' + postId : route === 'board' ? 'board/' + selected : route;
  }
  function notifyRoute() {
    const next = '#' + routeHash();
    if (location.hash !== next) {
      history.replaceState(null, '', next);
      window.dispatchEvent(new Event('hashchange'));
    }
  }
  function go(n) {
    if (route !== 'post') lastRoute = route;
    if (route !== n) chosen.clear();
    route = n;
    postId = null;
    query = '';
    page = 1;
    $('#modal').close();
    notifyRoute();
    render();
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }
  const allowed = p => !state.blocked.includes(p.author),
    scoped = p => allowed(p) && (scope === '지역' ? board(p.board).scope === '지역' && p.region === region : scope === '전국' ? board(p.board).scope === '전국' : board(p.board).scope === '또래' && p.age === age);
  function scopeBar() {
    return `<div class="scope-bar"><div class="scope-tabs">${['지역', '전국', '또래'].map(s => B(s === '지역' ? '내 지역' : s === '전국' ? '전국 연합' : '또래 이야기', `data-scope="${s}" aria-pressed="${scope === s}"`, scope === s ? 'active' : '')).join('')}</div>${scope === '지역' ? `<label class="region-picker">${I('pin')}<select id="region" aria-label="지역 선택">${['서울', '경기', '인천', '부산', '대전', '대구', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'].map(r => `<option ${r === region ? 'selected' : ''}>${r}</option>`).join('')}</select></label>` : scope === '또래' ? `<select id="age" aria-label="연령대 선택">${['20대', '30대', '40대', '50대 이상'].map(a => `<option ${age === a ? 'selected' : ''}>${a}</option>`).join('')}</select>` : '<span class="scope-caption">사는 곳이 달라도, 함께 나누는 이야기</span>'}</div>`;
  }
  function search(ph = '전체 게시판의 이야기를 검색해 보세요', id = 'search-form') {
    return `<form id="${id}" class="search">${I('search')}<input name="query" aria-label="${id === 'board-search-form' ? '게시판 이름 검색' : '게시글 검색'}" value="${esc(query)}" placeholder="${ph}" maxlength="100"><button>검색</button></form>`;
  }
  function pager(result, key = 'activity') {
    if (result.pages <= 1) return '';
    const start = Math.max(1, Math.min(result.page - 2, result.pages - 4));
    const numbers = Array.from({
      length: Math.min(5, result.pages)
    }, (_, i) => start + i);
    return '<nav class="pagination" aria-label="' + key + ' 페이지">' + B('이전', `data-list-page="${key}" data-target-page="${result.page - 1}" ${result.page === 1 ? 'disabled' : ''}`) + numbers.map(n => B(n, `data-list-page="${key}" data-target-page="${n}" aria-current="${n === result.page ? 'page' : 'false'}"`, n === result.page ? 'active' : '')).join('') + B('다음', `data-list-page="${key}" data-target-page="${result.page + 1}" ${result.page === result.pages ? 'disabled' : ''}`) + '<small>' + result.page + ' / ' + result.pages + '</small></nav>';
  }
  function attachmentMarkup(items = [], owner = '') {
    return '<div class="attachments">' + items.map(file => `<article class="attachment" data-file-id="${esc(file.id)}">
      ${file.kind !== 'file' ? `<div class="attachment-preview" data-attachment-preview="${esc(file.id)}" data-kind="${file.kind}" aria-label="${esc(file.name)} 미리보기"></div>` : ''}
      <div class="attachment-info"><span class="file-kind">${file.kind === 'image' ? '사진' : file.kind === 'audio' ? '음성' : file.kind === 'video' ? '영상' : '파일'}</span><strong>${esc(file.name)}</strong><small>${(file.size / 1024 / 1024).toFixed(2)} MB</small>
      <a class="text-button" data-attachment-download="${esc(file.id)}" download="${esc(file.name)}" aria-disabled="true">파일 불러오는 중…</a>
      ${owner ? B('×', `type="button" data-remove-attachment="${esc(file.id)}" data-owner="${esc(owner)}" aria-label="${esc(file.name)} 첨부 제거"`, 'file-remove') : ''}</div></article>`).join('') + '</div>';
  }
  function composer(owner) {
    return `<div class="attachment-composer"><label class="attach-button">＋ 파일 첨부<input type="file" multiple data-upload-owner="${esc(owner)}" aria-label="첨부파일 선택"></label><small>모든 형식 · 최대 10개 · 파일당 50MB</small><span class="upload-status" role="status" data-upload-status="${esc(owner)}"></span><div data-draft-owner="${esc(owner)}">${attachmentMarkup(drafts.get(owner) || [], owner)}</div></div>`;
  }
  async function fileURL(id) {
    if (fileURLs.has(id)) return fileURLs.get(id);
    const blob = await files.get(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    fileURLs.set(id, url);
    return url;
  }
  function hydrateAttachments() {
    document.querySelectorAll('[data-attachment-download]').forEach(async link => {
      if(link.dataset.hydrated)return;
      link.dataset.hydrated='true';
      try{
        const url=await fileURL(link.dataset.attachmentDownload);
        if(!link.isConnected)return;
        if(url){link.href=url;link.textContent='다운로드';link.removeAttribute('aria-disabled');}
        else link.textContent='이 브라우저에 파일 없음';
      }catch{if(link.isConnected)link.textContent='파일을 불러오지 못했어요';}
    });
    document.querySelectorAll('[data-attachment-preview]').forEach(async element => {
      if (element.dataset.hydrated) return;
      element.dataset.hydrated = 'true';
      try {
        const url = await fileURL(element.dataset.attachmentPreview);
        if (!element.isConnected) return;
        if (!url) {
          element.textContent = '이 브라우저에 파일이 없어요.';
          return;
        }
        const kind = element.dataset.kind,
          media = document.createElement(kind === 'image' ? 'img' : kind === 'audio' ? 'audio' : 'video');
        if (kind === 'image') {
          media.alt = element.getAttribute('aria-label');
          media.loading = 'lazy';
        } else {
          media.controls = true;
          media.preload = 'metadata';
        }
        media.src = url;
        element.appendChild(media);
      } catch {
        if (element.isConnected) element.textContent = '미리보기를 불러오지 못했어요. 다운로드로 확인해 주세요.';
      }
    });
  }
  function updateDraft(owner) {
    const box = document.querySelector('[data-draft-owner="' + CSS.escape(owner) + '"]');
    if (box) box.innerHTML = attachmentMarkup(drafts.get(owner) || [], owner);
    hydrateAttachments();
  }
  function takeDraft(owner) {
    const items = drafts.get(owner) || [];
    items.forEach(file => pendingFiles.delete(file.id));
    drafts.delete(owner);
    return items;
  }
  async function discardDraft(owner) {
    uploadTokens.set(owner, (uploadTokens.get(owner) || 0) + 1);
    const ids = (drafts.get(owner) || []).map(file => file.id).filter(id => pendingFiles.has(id));
    ids.forEach(id => pendingFiles.delete(id));
    drafts.delete(owner);
    if (ids.length) await files.remove(ids).catch(() => {});
  }
  async function upload(input) {
    const owner = input.dataset.uploadOwner,
      token = (uploadTokens.get(owner) || 0) + 1;
    uploadTokens.set(owner, token);
    uploading.add(owner);
    input.disabled = true;
    const status = document.querySelector('[data-upload-status="' + CSS.escape(owner) + '"]');
    if (status) status.textContent = '파일 저장 중…';
    try {
      const added = await files.add(input.files, (drafts.get(owner) || []).length);
      if (uploadTokens.get(owner) !== token) {
        await files.remove(added.map(file => file.id));
        return;
      }
      added.forEach(file => pendingFiles.add(file.id));
      drafts.set(owner, [...(drafts.get(owner) || []), ...added]);
      updateDraft(owner);
      if (status) status.textContent = added.length + '개 첨부됨';
    } catch (error) {
      toast(error.message || '파일을 저장하지 못했어요.');
      if (status) status.textContent = '첨부 실패';
    } finally {
      uploading.delete(owner);
      input.disabled = false;
      input.value = '';
    }
  }
  function allAttachmentIDs() {
    return new Set(state.posts.flatMap(post => [...(post.attachments || []), ...post.comments.flatMap(comment => comment.attachments || [])]).concat(Object.values(state.chats).flatMap(messages => messages.flatMap(message => message.attachments || []))).map(file => file.id));
  }
  function pruneFiles(before) {
    const used = allAttachmentIDs();
    for (const draft of drafts.values()) draft.forEach(file => used.add(file.id));
    const unused = [...before].filter(id => !used.has(id));
    if (unused.length) files.remove(unused).catch(() => {});
  }
  function activityTools(items) {
    if (!['mine', 'commented', 'saved'].includes(route)) return '';
    const label = route === 'saved' ? '스크랩 해제' : route === 'commented' ? '내 댓글 삭제' : '선택 글 삭제';
    return `<div class="management-toolbar"><label><input type="checkbox" data-select-all ${items.length && items.every(post => chosen.has(post.id)) ? 'checked' : ''}> 현재 페이지 선택</label><span>${chosen.size}개 선택</span>${B(label, 'data-action="bulk-activity" ' + (!chosen.size ? 'disabled' : ''))}<small>댓글 단 글에서는 내 댓글만 삭제합니다.</small></div>`;
  }
  function recommendationReason(result) {
    return `<div class="similarity"><strong>관심 유사도 ${result.score}%</strong><p>${result.reasons.map(esc).join(' · ')}</p></div>`;
  }
  function heading(t, d, a = '') {
    return `<div class="page-heading"><div><p class="eyebrow">OUR LITTLE NEIGHBORHOOD</p><h1>${t}</h1><p class="subtitle">${d}</p></div>${a}</div>`;
  }
  const author = p => p.board === 'secret' ? '<span class="anonymous">익명 이웃</span>' : `<button class="author" data-person="${p.author}">${av(person(p.author), 'tiny')}${esc(person(p.author).name)}</button>`;
  function row(p, mini = false) {
    return mini ? `<button class="mini-row" data-post="${p.id}"><span>${esc(p.title)} ${p.comments.length ? `<b>${p.comments.length}</b>` : ''}</span><time>${when(p)}</time></button>` : `<article class="post-row"><div class="post-labels"><button data-board="${p.board}" class="tag">${esc(board(p.board).name)}</button><span>${board(p.board).scope === '전국' ? '전국' : board(p.board).scope === '또래' ? p.age : p.region}</span>${p.example ? '<span class="sample">예시</span>' : ''}</div><button class="post-title" data-post="${p.id}">${esc(p.title)}</button><p class="post-excerpt">${esc(p.body.split('\n')[0])}</p>${p.attachments?.length ? '<span class="attachment-count">첨부 ' + p.attachments.length + '개</span>' : ''}<div class="post-meta">${author(p)}<span>${when(p)}</span><span class="view-count">조회 ${p.views}</span><div class="metrics"><span>${I('heart')} ${p.likes}</span><span>${I('message')} ${p.comments.length}</span></div></div></article>`;
  }
  const empty = (t, d = '') => `<div class="empty-state">${I('message')}<h3>${t}</h3><p>${d}</p></div>`;
  function sidebar() {
    return `<section class="member-card"><div class="member-top">${av(state.me)}<div><strong>${esc(state.me.name)}</strong><span>${state.me.region} · ${state.me.age}</span></div></div><p>오늘은 어떤 이야기인가요?</p><button class="member-link" data-go="settings">내 정보 ${I('chevron')}</button></section><nav class="side-menu" aria-label="내 활동">${[['mine', 'pen', '내가 쓴 글'], ['commented', 'message', '댓글 단 글'], ['saved', 'star', '내 스크랩']].map(([id, i, n]) => `<button data-go="${id}">${I(i)}${n}<span>${id === 'mine' ? state.posts.filter(p => p.author === 0).length : id === 'commented' ? state.posts.filter(p => p.comments.some(c => c.author === 0)).length : state.saved.length}</span></button>`).join('')}</nav><div class="side-heading"><h3>즐겨찾는 게시판</h3><button data-action="manage" aria-label="즐겨찾는 게시판 관리">${I('more')}</button></div><nav class="pin-list">${state.pins.map(id => `<button data-board="${id}" class="${route === 'board' && selected === id ? 'selected' : ''}"><span class="pin-dot"></span>${esc(board(id).name)}</button>`).join('') || '<p class="muted">☆을 눌러 게시판을 담아요.</p>'}</nav><button class="find-boards" data-go="boards">${I('grid')} 게시판 더 찾아보기 ${I('chevron')}</button><div class="side-note"><span class="online-dot"></span> 서로의 경험이, 내일의 도움이 돼요.<button data-info="rules">커뮤니티 이용규칙 ↗</button></div>`;
  }
  function rail() {
    const list = state.posts.filter(p => allowed(p) && p.board !== 'news').sort((a, b) => b.likes - a.likes);
    return `<section class="rail-card"><div class="rail-title"><h2><i class="live-dot"></i> 지금 인기 있는 글</h2><button data-go="hot" aria-label="인기글 더 보기">${I('chevron')}</button></div>${list.slice(0, 3).map((p, i) => `<button class="trending" data-post="${p.id}"><span class="rank">${i + 1}</span><span><strong>${esc(p.title)}</strong><small>${board(p.board).name}<span>♡ ${p.likes}</span></small></span></button>`).join('')}</section><section class="rail-card"><div class="rail-title"><h2>HOT 게시물</h2><button data-go="hot">더 보기</button></div>${list.slice(3, 7).map(p => `<button class="hot-row" data-post="${p.id}"><span>${esc(p.title)}</span><small>${when(p)}</small></button>`).join('')}<button class="best-link" data-go="best">기간별 BEST 이야기 ${I('chevron')}</button></section><section class="rail-card"><div class="rail-title"><h2>새로운 이웃 만나기</h2><button data-go="friends">모두 보기</button></div>${recommendations.recommend(state, 2).map(result => {
      const p = result.user;
      return `<div class="neighbor">${av(p, 'small')}<button data-person="${p.id}"><strong>${p.name}</strong><small>${p.region} · ${p.age}</small></button><button class="add-neighbor" data-request="${p.id}" aria-label="${p.name} 친구 추가">${p.requested ? '✓' : '+'}</button><div class="neighbor-similarity">${result.score}% · ${esc(result.reasons[0])}</div></div>`;
    }).join('')}<button class="best-link" data-action="recommendation-info">관심 유사도는 어떻게 계산하나요? ↗</button></section><div class="rail-help"><strong>함께 쓰는 공간의 약속</strong><p>일상은 편하게, 서로에게는 따뜻하게.<br>경험을 나누고 다른 생각을 존중해요.</p><button data-info="rules">이용규칙 읽어보기 ↗</button></div>`;
  }
  function home() {
    const bs = state.boards.filter(b => b.scope === scope && b.id !== 'news'),
      ps = state.posts.filter(scoped);
    return heading('우리 동네부터, 모두의 이야기까지.', '집을 구하는 순간부터, 이 동네가 익숙해질 때까지.', B(`${I('pen')} 이야기 쓰기`, 'data-action="write"', 'primary')) + scopeBar() + search() + `<button class="notice-line" data-info="notice"><span>공지</span><strong>반가워요! 새로운 이웃과 이야기를 나눠보세요.</strong>${I('chevron')}</button><div class="home-toolbar"><h2>${scope === '지역' ? `${region} 이웃의 게시판` : scope === '전국' ? '전국 이웃의 게시판' : `${age}의 이야기`}</h2><button data-go="boards">게시판 전체 보기 ${I('chevron')}</button></div><div class="board-grid">${bs.map(b => `<section class="board-card"><div class="board-card-heading"><button data-board="${b.id}"><h3>${esc(b.name)}</h3>${I('chevron')}</button><button class="favorite ${state.pins.includes(b.id) ? 'on' : ''}" data-pin="${b.id}" aria-label="${esc(b.name)} 즐겨찾기">${state.pins.includes(b.id) ? '★' : '☆'}</button></div><p>${esc(b.desc)}</p><div class="board-preview">${ps.filter(p => p.board === b.id).slice(0, 3).map(p => row(p, true)).join('') || '<div class="mini-empty">첫 이야기를 기다리고 있어요.</div>'}</div><button class="board-write" data-write-board="${b.id}">＋ 이 게시판에 글쓰기</button></section>`).join('')}</div><div class="home-toolbar latest-heading"><h2>새로 올라온 이야기 <span>${ps.length}</span></h2><button data-go="all">전체 보기 ${I('chevron')}</button></div><div class="feed">${ps.slice(0, 3).map(p => row(p)).join('') || empty('아직 이 지역의 이야기가 없어요.', '전국 연합이나 다른 지역도 둘러보세요.')}</div>`;
  }
  function listing() {
    const names = {
      mine: ['내가 쓴 글', '내가 남긴 경험과 질문을 모았어요.'],
      commented: ['댓글 단 글', '대화를 나누었던 이야기를 다시 찾아보세요.'],
      saved: ['내 스크랩', '다시 읽고 싶은 글을 한곳에 담았어요.'],
      hot: ['HOT 게시판', '최근 7일, 이웃들이 많이 공감한 이야기.'],
      best: ['BEST 게시판', '오래 기억하고 싶은 좋은 이야기를 모았어요.'],
      search: ['검색 결과', `“${esc(query)}” · 모든 게시판에서 찾았어요.`],
      all: ['전체 이야기', '이웃의 새로운 이야기를 만나보세요.']
    };
    const [t, d] = names[route] || [board(selected).name, board(selected).desc];
    let ps = state.posts.filter(allowed).filter(p => route === 'mine' ? p.author === 0 : route === 'commented' ? p.comments.some(c => c.author === 0) : route === 'saved' ? state.saved.includes(p.id) : route === 'hot' ? p.likes >= 10 && Date.now() - p.created < 604800000 : route === 'best' ? p.likes >= 30 && Date.now() - p.created < {
      month: 2592000000,
      half: 15552000000,
      all: Infinity
    }[period] : route === 'search' ? true : route === 'board' ? p.board === selected && (board(p.board).scope !== '지역' || p.region === region) && (board(p.board).scope !== '또래' || p.age === age) : scoped(p));
    if (query) ps = ps.filter(p => (p.title + ' ' + p.body).toLowerCase().includes(query.toLowerCase()));
    ps.sort(route === 'hot' || route === 'best' || sort === 'likes' ? (a, b) => b.likes - a.likes : sort === 'comments' ? (a, b) => b.comments.length - a.comments.length : (a, b) => b.created - a.created);
    const result = management.paginate(ps, page, 6);
    page = result.page;
    const activity = ['mine', 'commented', 'saved'].includes(route);
    return B(`${I('arrow')} 커뮤니티 홈`, 'data-go="home"', 'back-link') + heading(t, d, B(`${I('pen')} 글쓰기`, 'data-action="write"', 'primary')) + (['board', 'all'].includes(route) ? scopeBar() : '') + (route === 'board' ? `<div class="board-description">${I('grid')}<span>${esc(board(selected).desc)}</span><button data-pin="${selected}" class="favorite ${state.pins.includes(selected) ? 'on' : ''}">${state.pins.includes(selected) ? '★ 즐겨찾기됨' : '☆ 즐겨찾기'}</button></div>` : '') + (route === 'best' ? `<div class="filter-chips">${[['month', '이번 달'], ['half', '최근 반기'], ['all', '전체 기간']].map(([p, n]) => B(n, `data-period="${p}"`, period === p ? 'active' : '')).join('')}</div>` : '') + search(route === 'search' ? '전체 게시판 검색' : `${t}에서 검색`) + `<div class="list-toolbar"><strong>이야기 ${ps.length}<span>개</span></strong><select id="sort" aria-label="정렬 기준"><option value="latest" ${sort === 'latest' ? 'selected' : ''}>최신순</option><option value="likes" ${sort === 'likes' ? 'selected' : ''}>공감순</option><option value="comments" ${sort === 'comments' ? 'selected' : ''}>댓글순</option></select></div>${activityTools(result.items)}<div class="feed">${result.items.map(p => activity ? `<div class="activity-item"><label class="activity-checkbox"><input type="checkbox" data-select-post="${p.id}" ${chosen.has(p.id) ? 'checked' : ''} aria-label="${esc(p.title)} 선택"></label>${row(p)}</div>` : row(p)).join('') || empty('아직 모아둔 이야기가 없어요.', route === 'saved' ? '게시글의 스크랩 버튼으로 담아보세요.' : '글이나 댓글로 이웃과 이야기를 나눠보세요.')}</div>${pager(result)}`;
  }
  function directory() {
    return heading('나에게 맞는 게시판 찾기', '관심 있는 이야기를 찾고, 자주 보는 게시판은 즐겨찾기에 담아요.', B('＋ 게시판 만들기', 'data-action="new-board"')) + search('게시판 이름이나 관심사를 검색하세요', 'board-search-form') + ['지역', '전국', '또래'].map(s => `<section class="directory-section"><h2>${s === '지역' ? '우리 동네' : s === '전국' ? '전국 연합' : '비슷한 나이, 비슷한 고민'}<span>${s === '지역' ? '지역별로 나누는 이야기' : s === '전국' ? '지역에 관계없이 누구나' : '또래 이웃과 함께'}</span></h2><div class="directory-grid">${state.boards.filter(b => b.scope === s && `${b.name} ${b.desc}`.includes(query)).map(b => `<article><button data-board="${b.id}"><span class="board-symbol">${I(b.id === 'housing' ? 'home' : b.id === 'hobby' ? 'heart' : 'grid')}</span><strong>${esc(b.name)}</strong><p>${esc(b.desc)}</p><small>이야기 ${state.posts.filter(p => p.board === b.id).length}개</small></button><button class="favorite ${state.pins.includes(b.id) ? 'on' : ''}" data-pin="${b.id}" aria-label="${esc(b.name)} 즐겨찾기">${state.pins.includes(b.id) ? '★' : '☆'}</button></article>`).join('') || '<p class="muted">검색한 게시판이 없어요.</p>'}</div></section>`).join('');
  }
  function detail() {
    const p = state.posts.find(p => p.id === postId);
    if (!p) return empty('게시글을 찾을 수 없어요.');
    return B(`${I('arrow')} 목록으로 돌아가기`, 'data-action="back-post"', 'back-link') + `<article class="post-detail"><div class="post-labels"><button class="tag" data-board="${p.board}">${board(p.board).name}</button><span>${p.region}</span>${p.example ? '<span class="sample">예시 게시글</span>' : ''}</div><h1>${esc(p.title)}</h1><div class="post-meta">${author(p)}<span>${when(p)}</span><span>조회 ${p.views}</span><button class="text-button post-menu" data-action="post-menu">${I('more')} 더 보기</button></div><div class="post-body">${esc(p.body)}</div>${attachmentMarkup(p.attachments)}<div class="post-actions">${B(`${I('heart')} ${state.liked.includes(p.id) ? '공감 취소' : '공감'} ${p.likes}`, `data-like="${p.id}"`, state.liked.includes(p.id) ? 'primary' : 'secondary')}${B(`${I('star')} ${state.saved.includes(p.id) ? '스크랩됨' : '스크랩'}`, `data-save="${p.id}"`)}</div><section class="comments"><h2>댓글 <span>${p.comments.length}</span></h2>${p.comments.map(c => `<article class="comment"><div>${p.board === 'secret' ? '<strong>익명 이웃</strong>' : `<button class="author" data-person="${c.author}">${av(person(c.author), 'small')}${esc(person(c.author).name)}</button>`}${c.author === p.author ? '<span class="author-tag">글쓴이</span>' : ''}${c.author === 0 ? B('삭제', `data-delete-comment="${c.id}"`, 'text-button delete-comment') : ''}</div><p>${esc(c.body)}</p>${attachmentMarkup(c.attachments)}<small>이웃의 댓글</small></article>`).join('') || '<p class="muted first-comment">첫 댓글로 이야기를 시작해 보세요.</p>'}<form id="comment-form"><label for="comment-body">${esc(state.me.name)}님의 한마디</label><textarea id="comment-body" name="body" rows="3" maxlength="1000" placeholder="서로의 경험을 존중하며 이야기해요."></textarea>${composer("comment-" + p.id)}<div><small>작성한 댓글은 ‘댓글 단 글’에서 다시 볼 수 있어요.</small><button class="primary">댓글 등록</button></div></form></section></article>`;
  }
  function friends() {
    const list = state.people.filter(p => !state.blocked.includes(p.id)),
      req = management.paginate(list.filter(p => p.incoming), requestPage, 6);
    const filtered = list.filter(p => p.friend && (p.name + ' ' + p.bio).includes(friendSearch));
    const mine = management.paginate(filtered, friendPage, 6),
      rec = management.paginate(recommendations.recommend(state), recommendPage, 6);
    friendPage = mine.page;
    recommendPage = rec.page;
    requestPage = req.page;
    const card = (p, result) => `<article class="friend-card"><button data-person="${p.id}">${av(p)}<h3>${esc(p.name)}</h3></button><small>${p.region} · ${p.age}</small><p>${esc(p.bio)}</p><div class="interest-tags">${(p.interests || []).map(tag => '<span>' + esc(tag) + '</span>').join('')}</div>${result ? recommendationReason(result) : ''}${p.friend ? B(I('message') + ' 메시지 보내기', `data-message="${p.id}"`) + B('친구 해제', `data-remove-friend="${p.id}"`, 'text-button remove-friend') : B(p.requested ? '✓ 요청 중 · 취소' : '＋ 친구 추가', `data-request="${p.id}"`, p.requested ? 'secondary' : 'primary')}</article>`;
    return heading('친구와 더 가까이', '관심사와 일상이 비슷한 이웃을 만나보세요.', B('내 관심사 설정', 'data-action="profile"')) + `<h2 class="section-title">받은 친구 요청 <span>${req.total}</span></h2><div class="request-list">${req.items.map(p => `<article class="friend-request">${av(p)}<div><button data-person="${p.id}"><strong>${esc(p.name)}</strong></button><p>${p.region} · ${p.age} · ${esc(p.bio)}</p></div>${B('수락', `data-accept="${p.id}"`, 'primary')}${B('거절', `data-decline="${p.id}"`)}</article>`).join('') || '<p class="muted">새 친구 요청이 없어요.</p>'}</div>${pager(req, 'requests')}
      <h2 class="section-title">내 친구 <span>${filtered.length}</span></h2><form id="friend-search-form" class="search">${I('search')}<input name="query" aria-label="친구 검색" placeholder="이름이나 소개로 친구 찾기" value="${esc(friendSearch)}"><button>검색</button></form><div class="friend-grid">${mine.items.map(p => card(p)).join('') || empty('찾는 친구가 없어요.')}</div>${pager(mine, 'friends')}
      <div class="section-heading"><h2 class="section-title">새로운 이웃 만나기 <span>${rec.total}</span></h2><button data-action="recommendation-info" class="text-button">추천 기준 ↗</button></div><div class="friend-grid">${rec.items.map(result => card(result.user, result)).join('') || empty('새로운 이웃을 모두 만났어요.')}</div>${pager(rec, 'recommendations')}`;
  }
  function messages() {
    const ids = Object.keys(state.chats).map(Number).filter(id => !state.blocked.includes(id) && !state.hiddenChats.includes(id));
    const filtered = ids.filter(id => (person(id).name + ' ' + state.chats[id].map(message => message.text).join(' ')).includes(conversationQuery));
    const list = management.paginate(filtered, conversationPage, 6);
    conversationPage = list.page;
    if (!ids.includes(chatId)) chatId = ids[0] || null;
    if (chatId) {
      state.unread = state.unread.filter(id => id !== chatId);
      save();
    }
    const p = person(chatId),
      hidden = state.hiddenChats.filter(id => !state.blocked.includes(id));
    return heading('메시지', '×로 대화를 숨겨도 내용과 첨부파일은 그대로 보존돼요.', B('숨긴 대화 ' + hidden.length, 'data-action="hidden-chats"')) + `<div class="message-layout"><nav class="conversation-list" aria-label="대화 목록"><h2>받은 메시지</h2><form class="conversation-search" id="conversation-search-form"><input name="query" aria-label="대화 검색" placeholder="이름·대화 검색" value="${esc(conversationQuery)}"><button aria-label="대화 검색 실행">${I('search')}</button></form>${list.items.map(id => {
      const user = person(id),
        last = state.chats[id].at(-1);
      return `<div class="conversation-row ${id === chatId ? 'active' : ''}"><button class="conversation" data-message="${id}">${av(user, 'small')}<span><strong>${esc(user.name)} ${state.unread.includes(id) ? '<i class="live-dot"></i>' : ''}</strong><small>${esc(last?.text || (last?.attachments?.length ? '첨부파일 ' + last.attachments.length + '개' : '첫 인사를 건네보세요.'))}</small></span></button><button class="conversation-hide" data-hide-chat="${id}" aria-label="${esc(user.name)} 대화 숨기기">×</button></div>`;
    }).join('') || '<p class="muted conversation-empty">표시할 대화가 없어요.</p>'}${pager(list, 'conversations')}</nav>
      <section class="chat">${chatId ? `<div class="chat-heading"><button class="author" data-person="${p.id}">${av(p, 'small')}<span>${esc(p.name)}<small>${p.region} · ${p.age}</small></span></button><div class="chat-heading-actions"><button class="text-button" data-block="${p.id}">차단</button><button data-hide-chat="${p.id}" class="chat-close" aria-label="현재 대화 숨기기">×</button></div></div><div class="chat-body"><div class="chat-day">예시 유저와 나누는 대화</div>${state.chats[chatId].map(message => `<div class="chat-message ${message.mine ? 'mine' : ''}">${message.text ? '<p>' + esc(message.text) + '</p>' : ''}${attachmentMarkup(message.attachments)}<small>${message.mine ? '보냄' : '받음'}</small></div>`).join('') || empty('반가운 첫 인사를 건네보세요.')}<div class="chat-demo-note">실제 사용자에게 전송되지 않는 시연용 메시지입니다.</div></div><form id="message-form"><div class="message-compose-row"><input name="message" aria-label="메시지 내용" maxlength="1000" placeholder="메시지를 입력하세요"><button class="primary">전송</button></div>${composer('message-' + chatId)}</form>` : empty('표시할 대화가 없어요.', '숨긴 대화에서 복원하거나 친구에게 새 메시지를 보내보세요.')}</section></div>`;
  }
  const infos = {
    rules: ['커뮤니티 이용규칙', '서로의 경험과 다른 생각을 존중해요.\n\n개인정보, 비방과 혐오 표현, 사기성 광고는 남기지 마세요. 청약·금융 경험은 개인의 사례이므로 실제 조건은 공식 공고에서 확인해 주세요.\n\n문제가 있는 글은 게시글의 ‘더 보기 → 신고’로 접수할 수 있어요. 이 시안의 신고는 현재 브라우저에만 기록됩니다.'],
    notice: ['공지사항', '새로운 커뮤니티 시안에 오신 것을 환영합니다.\n\n지역·전국·또래 게시판을 둘러보고, 댓글·공감·스크랩으로 이야기를 나눠보세요.\n\n친구와 메시지, 내 활동, 게시판 찾기, 내 정보 설정을 체험할 수 있습니다.'],
    restrictions: ['이용 제한 내역', '현재 이용 제한 내역이 없습니다.'],
    terms: ['서비스 이용약관', '시연용 안내\n\n디자인과 동작을 확인하기 위한 독립 시안입니다. 실제 회원가입, 계약, 거래는 이루어지지 않습니다. 정식 서비스 이용약관은 실제 서비스 적용 전에 마련할 예정입니다.'],
    privacy: ['개인정보 처리방침', '시연용 데이터 안내\n\n프로필·게시글·댓글·메시지는 현재 브라우저에만 저장됩니다. 실제 개인정보나 비밀번호를 입력하지 마세요.\n\n브라우저 데이터를 삭제하면 체험 중 작성한 내용도 사라질 수 있습니다.'],
    youth: ['청소년 보호 정책', '시연용 안내\n\n유해 정보와 개인정보 노출을 삼가고 문제가 있는 글은 신고 기능을 이용해 주세요. 정식 서비스 정책은 실제 운영 전에 마련할 예정입니다.']
  };
  function settings() {
    const groups = [['계정', [['내 프로필', 'profile', '닉네임·소개'], ['이메일 설정', 'email', '체험용 주소'], ['비밀번호 변경', 'password', '체험 화면']]], ['커뮤니티', [['닉네임·지역·연령대 설정', 'profile', ''], ['이용 제한 내역', 'restrictions', '없음'], ['게시판 관리', 'manage', `${state.pins.length}개 즐겨찾기`], ['차단한 사용자', 'blocked', `${state.blocked.length}명`], ['커뮤니티 이용규칙', 'rules', '']]], ['이용 안내', [['문의하기', 'contact', ''], ['공지사항', 'notice', ''], ['서비스 이용약관', 'terms', ''], ['개인정보 처리방침', 'privacy', ''], ['청소년 보호 정책', 'youth', '']]], ['기타', [['알림·정보 수신 설정', 'notifications', state.notifications ? '켜짐' : '꺼짐'], ['체험 데이터 초기화', 'reset', '초기 상태로']]]];
    return heading('내 정보', '나의 활동과 커뮤니티 설정을 한곳에서 관리해요.') + `<section class="settings-profile">${av(state.me, 'large')}<div><h2>${esc(state.me.name)}</h2><p>${state.me.region} · ${state.me.age} · 관심 지역 ${esc(state.me.interest)}</p><small>${esc(state.me.bio)}</small></div>${B('프로필 수정', 'data-action="profile"')}</section><div class="activity-stats">${[['mine', '내가 쓴 글', state.posts.filter(p => p.author === 0).length], ['commented', '댓글 단 글', state.posts.filter(p => p.comments.some(c => c.author === 0)).length], ['saved', '스크랩', state.saved.length]].map(([id, n, c]) => `<button data-go="${id}"><strong>${c}</strong><span>${n}</span></button>`).join('')}</div><div class="settings-groups">${groups.map(([t, rs]) => `<section class="settings-group"><h2>${t}</h2>${rs.map(([label, id, v]) => `<button data-action="${id}"><span>${label}</span><small>${v}</small>${I('chevron')}</button>`).join('')}</section>`).join('')}</div>`;
  }
  function render() {
    $('#sidebar').innerHTML = sidebar();
    $('#rightbar').innerHTML = rail();
    $('#content').innerHTML = route === 'home' ? home() : route === 'boards' ? directory() : route === 'friends' ? friends() : route === 'messages' ? messages() : route === 'settings' ? settings() : route === 'post' ? detail() : listing();
    if (['home', 'all', 'hot', 'best'].includes(route)) {
      const links = `<nav class="reading-nav" aria-label="이야기 모아보기">${[['home', '게시판 홈'], ['all', '최신 이야기'], ['hot', 'HOT'], ['best', 'BEST']].map(([id, n]) => B(n, `data-go="${id}" aria-current="${route === id ? 'page' : 'false'}"`, route === id ? 'active' : '')).join('')}</nav>`;
      $('#content .page-heading').insertAdjacentHTML('afterend', links);
    }
    document.querySelectorAll('[data-go]').forEach(b => b.classList.toggle('selected', b.dataset.go === route));
    $('#header-avatar').innerHTML = av(state.me, 'small');
    $('#friend-count').textContent = state.people.filter(p => p.friend).length;
    $('#message-count').textContent = state.notifications && state.unread.length ? state.unread.length : '';
    $('#header-unread').hidden = !state.notifications || !state.unread.length;
    if (route === 'messages' && $('.chat-body')) $('.chat-body').scrollTop = $('.chat-body').scrollHeight;
    hydrateAttachments();
    document.title = (route === 'settings' ? '내 정보' : route === 'friends' ? '친구' : route === 'messages' ? '메시지' : '커뮤니티') + ' · 청약돼?!';
  }
  function modal(t, html) {
    const d = $('#modal');
    d.innerHTML = `<div class="modal-heading"><h2>${t}</h2><button data-action="close" aria-label="닫기">×</button></div>${html}`;
    if (!d.open) d.showModal();
  }
  function info(id) {
    const [t, d] = infos[id] || infos.rules;
    modal(t, `<div class="info-body">${esc(d)}</div>${B('확인', 'data-action="close"', 'primary full')}`);
  }
  function profile(id) {
    const p = person(id);
    modal(id === 0 ? '내 프로필' : '이웃 프로필', `<div class="profile-modal">${av(p, 'large')}<h3>${esc(p.name)}</h3><p>${p.region} · ${p.age}</p><p>${esc(p.bio)}</p><div class="interest-tags">${(p.interests || []).map(tag => '<span>' + esc(tag) + '</span>').join('')}</div>${id !== 0 ? recommendationReason(recommendations.score(state.me, p, state.posts)) : ''}${id === 0 ? B('내 정보 수정', 'data-action="profile"', 'primary') : `<div class="dialog-actions">${B(p.friend ? '✓ 친구' : p.requested ? '요청 취소' : '＋ 친구 추가', `data-request="${id}"`, p.friend ? 'secondary' : 'primary')}${B(`${I('message')} 메시지`, `data-message="${id}"`)}</div>`}</div>`);
  }
  function manage() {
    modal('즐겨찾는 게시판 관리', `<p class="muted">자주 보는 게시판을 선택하면 왼쪽 메뉴에 표시돼요.</p><div class="manage-list">${state.boards.map(b => `<button data-pin="${b.id}"><span>${esc(b.name)}<small>${b.scope}</small></span><span class="favorite ${state.pins.includes(b.id) ? 'on' : ''}">${state.pins.includes(b.id) ? '★' : '☆'}</span></button>`).join('')}</div>${B('완료', 'data-action="close"', 'primary full')}`);
  }
  function editProfile() {
    modal('내 프로필 설정', `<form id="profile-form" class="form"><label>닉네임<input name="name" value="${esc(state.me.name)}" required maxlength="12"></label><div class="form-row"><label>내 지역<select name="region">${['서울', '경기', '인천', '부산', '대전', '대구', '광주', '제주'].map(r => `<option ${r === state.me.region ? 'selected' : ''}>${r}</option>`).join('')}</select></label><label>연령대<select name="age">${['20대', '30대', '40대', '50대 이상'].map(a => `<option ${a === state.me.age ? 'selected' : ''}>${a}</option>`).join('')}</select></label></div><label>관심 지역<input name="interest" value="${esc(state.me.interest)}" maxlength="20"></label><fieldset class="interest-picker"><legend>관심사 · 추천에 반영돼요</legend>${recommendations.INTERESTS.map(tag => `<label><input type="checkbox" name="interests" value="${tag}" ${(state.me.interests || []).includes(tag) ? 'checked' : ''}>${tag}</label>`).join('')}</fieldset><label>한 줄 소개<textarea name="bio" rows="2" maxlength="100">${esc(state.me.bio)}</textarea></label><button class="primary">설정 저장</button></form>`);
  }
  function write(id = null) {
    const p = id ? state.posts.find(p => p.id === id) : null;
    discardDraft('post');
    drafts.set('post', [...(p?.attachments || [])]);
    modal(p ? '이야기 수정' : '이야기 쓰기', `<form id="write-form" class="form" data-edit="${p?.id || ''}"><div class="form-row"><label>게시판<select name="board">${state.boards.filter(b => b.id !== 'news').map(b => `<option value="${b.id}" ${(p?.board || selected) === b.id ? 'selected' : ''}>${esc(b.name)} · ${b.scope}</option>`).join('')}</select></label><label>작성 방식<select name="anonymous"><option value="no">닉네임으로 작성</option><option value="yes" ${p?.board === 'secret' ? 'selected' : ''}>익명 고민으로 작성</option></select></label></div><label>제목<input name="title" value="${esc(p?.title || '')}" required maxlength="100" placeholder="어떤 이야기를 나누고 싶나요?"></label><label>내용<textarea name="body" rows="7" maxlength="5000" placeholder="경험과 궁금한 점을 편하게 남겨주세요.">${esc(p?.body || '')}</textarea></label>${composer("post")}<small class="muted">${esc(state.me.name)} · ${state.me.region}으로 작성해요. 개인정보는 남기지 마세요.</small><button class="primary">${p ? '수정 완료' : '이야기 등록'}</button></form>`);
  }
  function openPost(id) {
    if (route !== 'post') lastRoute = route;
    postId = id;
    route = 'post';
    const p = state.posts.find(p => p.id === id);
    if (p) {
      p.views++;
      save();
    }
    notifyRoute();
    render();
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }
  function openBoard(id) {
    selected = id;
    scope = board(id).scope;
    go('board');
  }
  function action(a) {
    if (a === 'recommendation-info') return modal('관심 유사도 추천', '<div class="info-body">시연용 프로필의 공통 관심사, 공개 작성글 제목·소개, 지역·연령대를 비교해 추천합니다. 관심사와 글은 코사인 유사도로 계산하며, 이유와 점수는 입력에 따라 달라집니다.\n\n외부 AI나 실제 청약진단 정보를 사용하지 않는 로컬 유사도 추천입니다. 비공개·익명 고민 글은 비교하지 않습니다.</div>' + B('내 관심사 수정', 'data-action="profile"', 'primary full'));
    if (a === 'hidden-chats') return modal('숨긴 대화', '<p class="muted">메시지와 파일은 삭제되지 않았어요. 복원하면 기존 대화를 이어갈 수 있어요.</p><div class="manage-list">' + state.hiddenChats.filter(id => !state.blocked.includes(id)).map(id => '<div><span>' + esc(person(id).name) + '</span>' + B('복원', `data-restore-chat="${id}"`) + '</div>').join('') + '</div>');
    if (a === 'bulk-activity') {
      const label = route === 'saved' ? '선택한 스크랩을 해제할까요?' : route === 'commented' ? '선택한 글에 남긴 내 댓글을 삭제할까요?' : '선택한 내 글을 삭제할까요?';
      return modal(label, '<p class="info-body">' + chosen.size + '개 항목에 적용합니다. 다른 사람의 글과 댓글은 삭제하지 않습니다.</p><div class="dialog-actions">' + B('취소', 'data-action="close"') + B('적용', 'data-action="bulk-confirm"', 'primary') + '</div>');
    }
    if (a === 'bulk-confirm') {
      const before = allAttachmentIDs();
      management.removeActivity(state, route, [...chosen]);
      chosen.clear();
      save();
      pruneFiles(before);
      $('#modal').close();
      render();
      return toast('선택 항목을 정리했어요.');
    }
    if (a === 'close') return $('#modal').close();
    if (a === 'write') return write();
    if (a === 'back-post') {
      route = lastRoute;
      postId = null;
      notifyRoute();
      return render();
    }
    if (a === 'profile') return editProfile();
    if (a === 'manage') return manage();
    if (infos[a]) return info(a);
    if (a === 'notifications') return modal('알림·정보 수신 설정', `<form id="notifications-form" class="form"><label class="checkbox-label"><input type="checkbox" name="enabled" ${state.notifications ? 'checked' : ''}> 친구 요청·새 메시지 알림 표시</label><p class="muted">이 시안 안의 알림 표시만 변경합니다.</p><button class="primary">저장</button></form>`);
    if (a === 'email') return modal('이메일 설정', `<form id="email-form" class="form"><p class="muted">체험용 주소입니다. 인증 메일은 발송되지 않아요.</p><label>체험용 이메일<input type="email" name="email" required value="${esc(state.me.email)}"></label><button class="primary">설정 저장</button></form>`);
    if (a === 'password') return modal('비밀번호 변경 체험', `<form id="password-form" class="form"><p class="muted">실제 계정과 연결되지 않는 체험 화면입니다. 실제 사용하는 비밀번호는 입력하지 마세요.</p><label>체험용 새 비밀번호<input type="password" name="password" required minlength="8" autocomplete="off"></label><label>한 번 더 입력<input type="password" name="confirm" required minlength="8" autocomplete="off"></label><button class="primary">변경 체험</button></form>`);
    if (a === 'blocked') return modal('차단한 사용자', `<div class="manage-list">${state.blocked.map(id => `<div>${person(id).name}${B('차단 해제', `data-unblock="${id}"`)}</div>`).join('') || '<p class="muted">차단한 사용자가 없습니다.</p>'}</div>`);
    if (a === 'contact') return modal('문의하기', `<form id="contact-form" class="form"><p class="muted">시연용 문의입니다. 운영자에게 실제 전송되지 않습니다.</p><label>문의 유형<select name="type"><option>이용 문의</option><option>오류 제보</option><option>개선 제안</option></select></label><label>내용<textarea name="body" required rows="4" maxlength="1000"></textarea></label><button class="primary">문의 접수 체험</button></form>`);
    if (a === 'new-board') return modal('새 게시판 만들기', `<form id="new-board-form" class="form"><label>게시판 이름<input name="name" required maxlength="20" placeholder="예: 동네 러닝 모임"></label><label>소개<input name="desc" required maxlength="80"></label><label>범위<select name="scope"><option>지역</option><option>전국</option></select></label><button class="primary">게시판 만들기</button></form>`);
    if (a === 'post-menu') {
      const p = state.posts.find(p => p.id === postId);
      return modal('게시글 메뉴', `<div class="menu-options">${p.author === 0 ? B('글 수정', `data-edit-post="${p.id}"`) + B('글 삭제', `data-confirm-delete="${p.id}"`) : B('게시글 신고', 'data-action="report"') + B('작성자 차단', `data-block="${p.author}"`)}</div>`);
    }
    if (a === 'report') return modal('게시글 신고', `<form id="report-form" class="form"><label>신고 사유<select name="reason"><option>개인정보 노출</option><option>비방·혐오 표현</option><option>광고·사기 의심</option><option>기타</option></select></label><label>추가 설명<textarea name="body" rows="3" maxlength="500"></textarea></label><small class="muted">신고 내역은 현재 브라우저에만 기록됩니다.</small><button class="primary">신고 접수</button></form>`);
    if (a === 'reset') return modal('체험 데이터를 초기화할까요?', `<p class="info-body">이 시안에서 작성한 글·댓글·메시지와 설정을 예시 데이터의 초기 상태로 되돌립니다.</p><div class="dialog-actions">${B('취소', 'data-action="close"')}${B('초기화', 'data-action="reset-confirm"', 'primary')}</div>`);
    if (a === 'reset-confirm') {
      if (uploading.size) return toast('파일 저장이 끝난 후 초기화해 주세요.');
      for (const owner of uploadTokens.keys()) uploadTokens.set(owner, uploadTokens.get(owner) + 1);
      files.clear().catch(() => toast('첨부파일 초기화에 실패했어요.'));
      drafts.clear();
      pendingFiles.clear();
      fileURLs.forEach(url => URL.revokeObjectURL(url));
      fileURLs.clear();
      state = window.CheongyakCommunityDemoStorage.reset(localStorage);
      region = state.me.region;
      scope = '지역';
      return go('home');
    }
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('button');
    if (!el) return;
    const d = el.dataset;
    if (d.removeAttachment) {
      const owner = d.owner;
      drafts.set(owner, (drafts.get(owner) || []).filter(file => file.id !== d.removeAttachment));
      if (pendingFiles.delete(d.removeAttachment)) files.remove([d.removeAttachment]).catch(() => {});
      updateDraft(owner);
      return;
    }
    if (d.hideChat) {
      management.hideChat(state, Number(d.hideChat));
      save();
      render();
      return toast('대화를 숨겼어요. 숨긴 대화에서 복원할 수 있어요.');
    }
    if (d.restoreChat) {
      management.restoreChat(state, Number(d.restoreChat));
      save();
      render();
      return action('hidden-chats');
    }
    if (d.removeFriend) return modal('친구를 해제할까요?', '<p class="info-body">대화와 메시지는 그대로 보존됩니다.</p><div class="dialog-actions">' + B('취소', 'data-action="close"') + B('친구 해제', `data-confirm-unfriend="${d.removeFriend}"`, 'primary') + '</div>');
    if (d.confirmUnfriend) {
      person(Number(d.confirmUnfriend)).friend = false;
      save();
      $('#modal').close();
      render();
      return toast('친구를 해제했어요.');
    }
    if (d.listPage) {
      const n = Number(d.targetPage);
      if (d.listPage === 'friends') friendPage = n;else if (d.listPage === 'recommendations') recommendPage = n;else if (d.listPage === 'requests') requestPage = n;else if (d.listPage === 'conversations') conversationPage = n;else page = n;
      render();
      return;
    }
    if (d.go) return go(d.go);
    if (d.action) return action(d.action);
    if (d.info) return info(d.info);
    if (d.scope) {
      scope = d.scope;
      query = '';
      page = 1;
      if (route === 'board') route = 'home';
      return render();
    }
    if (d.board) return openBoard(d.board);
    if (d.post) return openPost(d.post);
    if (d.person !== undefined) return profile(Number(d.person));
    if (d.writeBoard) {
      selected = d.writeBoard;
      return write();
    }
    if (d.pin) {
      const had = state.pins.includes(d.pin);
      state.pins = had ? state.pins.filter(x => x !== d.pin) : [...state.pins, d.pin];
      save();
      render();
      if ($('#modal').open) manage();
      return toast(had ? '즐겨찾기를 해제했어요.' : '즐겨찾는 게시판에 담았어요.');
    }
    if (d.period) {
      period = d.period;
      page = 1;
      return render();
    }
    if (d.page) {
      page = Number(d.page);
      render();
      return window.scrollTo({
        top: 150,
        behavior: 'smooth'
      });
    }
    if (d.like) {
      const p = state.posts.find(p => p.id === d.like);
      if (state.liked.includes(p.id)) {
        state.liked = state.liked.filter(id => id !== p.id);
        p.likes--;
      } else {
        state.liked.push(p.id);
        p.likes++;
      }
      save();
      return render();
    }
    if (d.save) {
      const id = d.save,
        had = state.saved.includes(id);
      state.saved = had ? state.saved.filter(x => x !== id) : [...state.saved, id];
      save();
      render();
      return toast(had ? '스크랩을 해제했어요.' : '내 스크랩에 담았어요.');
    }
    if (d.request) {
      const p = person(Number(d.request));
      if (p.friend) return toast('이미 친구인 이웃이에요.');
      p.requested = !p.requested;
      save();
      render();
      if ($('#modal').open) profile(p.id);
      return toast(p.requested ? '친구 요청을 보냈어요.' : '친구 요청을 취소했어요.');
    }
    if (d.accept) {
      const p = person(Number(d.accept));
      p.friend = true;
      p.incoming = false;
      save();
      render();
      return toast(`${p.name}님과 친구가 되었어요.`);
    }
    if (d.decline) {
      person(Number(d.decline)).incoming = false;
      save();
      return render();
    }
    if (d.message) {
      chatId = Number(d.message);
      management.restoreChat(state, chatId);
      state.chats[chatId] ??= [];
      save();
      return go('messages');
    }
    if (d.block) return modal('이 이웃을 차단할까요?', `<p class="info-body">${esc(person(Number(d.block)).name)}님의 게시글과 대화가 숨겨집니다. 내 정보에서 해제할 수 있어요.</p><div class="dialog-actions">${B('취소', 'data-action="close"')}${B('차단', `data-confirm-block="${d.block}"`, 'primary')}</div>`);
    if (d.confirmBlock) {
      state.blocked.push(Number(d.confirmBlock));
      save();
      return go('home');
    }
    if (d.unblock) {
      state.blocked = state.blocked.filter(id => id !== Number(d.unblock));
      save();
      render();
      return action('blocked');
    }
    if (d.editPost) return write(d.editPost);
    if (d.confirmDelete) return modal('글을 삭제할까요?', `<p class="info-body">현재 브라우저에 저장된 글을 삭제합니다.</p><div class="dialog-actions">${B('취소', 'data-action="close"')}${B('삭제', `data-delete-post="${d.confirmDelete}"`, 'primary')}</div>`);
    if (d.deletePost) {
      const before = allAttachmentIDs();
      management.removeActivity(state, 'mine', [d.deletePost]);
      save();
      pruneFiles(before);
      return go('mine');
    }
    if (d.deleteComment) {
      const before = allAttachmentIDs();
      const p = state.posts.find(p => p.id === postId);
      p.comments = p.comments.filter(c => c.author !== 0 || c.id !== Number(d.deleteComment));
      save();
      pruneFiles(before);
      return render();
    }
  });
  document.addEventListener('change', e => {
    if (e.target.dataset.uploadOwner) {
      upload(e.target);
      return;
    }
    if (e.target.dataset.selectPost) {
      const id = e.target.dataset.selectPost;
      e.target.checked ? chosen.add(id) : chosen.delete(id);
      render();
      return;
    }
    if (e.target.hasAttribute('data-select-all')) {
      document.querySelectorAll('[data-select-post]').forEach(input => {
        input.checked = e.target.checked;
        e.target.checked ? chosen.add(input.dataset.selectPost) : chosen.delete(input.dataset.selectPost);
      });
      render();
      return;
    }
    if (e.target.id === 'region') {
      region = e.target.value;
      page = 1;
      render();
    }
    if (e.target.id === 'age') {
      age = e.target.value;
      page = 1;
      render();
    }
    if (e.target.id === 'sort') {
      sort = e.target.value;
      page = 1;
      render();
    }
  });
  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target,
      data = new FormData(f),
      v = n => String(data.get(n) || '').trim();
    if (f.id === 'friend-search-form') {
      friendSearch = v('query');
      friendPage = 1;
      return render();
    }
    if (f.id === 'conversation-search-form') {
      conversationQuery = v('query');
      conversationPage = 1;
      return render();
    }
    if (f.id === 'search-form') {
      chosen.clear();
      query = v('query');
      if (route === 'home') route = 'search';
      page = 1;
      return render();
    }
    if (f.id === 'board-search-form') {
      query = v('query');
      return render();
    }
    if (f.id === 'profile-form') {
      if (!v('name')) return;
      Object.assign(state.me, {
        name: v('name'),
        region: v('region'),
        age: v('age'),
        interest: v('interest'),
        bio: v('bio'),
        interests: data.getAll('interests')
      });
      region = state.me.region;
      age = state.me.age;
      save();
      $('#modal').close();
      render();
      return toast('프로필을 저장했어요.');
    }
    if (f.id === 'write-form') {
      if (uploading.has('post')) return toast('파일 저장이 끝난 후 등록해 주세요.');
      if (!v('title') || !v('body') && !(drafts.get('post') || []).length) return toast('내용이나 첨부파일을 입력해 주세요.');
      const before = allAttachmentIDs();
      const edit = f.dataset.edit,
        p = edit ? state.posts.find(p => p.id === edit) : {
          id: 'demo-local-post-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
          dataSource: 'community-demo',
          author: 0,
          likes: 0,
          views: 0,
          comments: [],
          example: false,
          created: Date.now(),
          region: state.me.region,
          age: state.me.age
        };
      Object.assign(p, {
        title: v('title'),
        body: v('body'),
        board: v('anonymous') === 'yes' ? 'secret' : v('board'),
        attachments: takeDraft('post')
      });
      if (!edit) state.posts.unshift(p);
      save();
      pruneFiles(before);
      $('#modal').close();
      openPost(p.id);
      return toast(edit ? '글을 수정했어요.' : '이야기를 등록했어요.');
    }
    if (f.id === 'comment-form') {
      const owner = 'comment-' + postId;
      if (uploading.has(owner)) return toast('파일 저장이 끝난 후 등록해 주세요.');
      if (!v('body') && !(drafts.get(owner) || []).length) return;
      state.posts.find(p => p.id === postId).comments.push({
        id: Date.now(),
        author: 0,
        body: v('body'),
        attachments: takeDraft(owner)
      });
      save();
      render();
      return toast('댓글을 남겼어요.');
    }
    if (f.id === 'message-form') {
      const owner = 'message-' + chatId;
      if (uploading.has(owner)) return toast('파일 저장이 끝난 후 전송해 주세요.');
      if (!v('message') && !(drafts.get(owner) || []).length) return;
      state.chats[chatId].push({
        mine: true,
        text: v('message'),
        attachments: takeDraft(owner)
      });
      save();
      return render();
    }
    if (f.id === 'new-board-form') {
      if (!v('name') || !v('desc')) return;
      const id = 'custom-' + Date.now();
      state.boards.push({
        id,
        name: v('name'),
        desc: v('desc'),
        scope: v('scope')
      });
      state.pins.push(id);
      save();
      return openBoard(id);
    }
    if (f.id === 'password-form') {
      if (v('password') !== v('confirm')) return toast('두 비밀번호가 일치하지 않아요.');
      $('#modal').close();
      return toast('변경 화면을 체험했어요. 실제 계정은 변경되지 않습니다.');
    }
    if (f.id === 'email-form') {
      state.me.email = v('email');
      save();
      $('#modal').close();
      return toast('체험용 이메일을 저장했어요.');
    }
    if (f.id === 'notifications-form') {
      state.notifications = data.has('enabled');
      save();
      $('#modal').close();
      return render();
    }
    if (f.id === 'report-form') {
      state.reports.push({
        postId,
        reason: v('reason'),
        body: v('body')
      });
      save();
      $('#modal').close();
      return toast('시연용 신고 내역을 기록했어요.');
    }
    if (f.id === 'contact-form') {
      $('#modal').close();
      return toast('문의 접수 화면을 체험했어요. 실제 전송은 없습니다.');
    }
  });
  $('#modal').addEventListener('close', () => discardDraft('post'));
  window.addEventListener('pagehide', () => {
    fileURLs.forEach(url => URL.revokeObjectURL(url));
  });
  $('#modal').addEventListener('click', e => {
    if (e.target === $('#modal')) {
      const r = e.target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
    }
  });
  function restoreRoute() {
    const [next, id] = location.hash.slice(1).split('/');
    if (next === 'post' && id) {
      const target = state.posts.find(p => p.id === id || p.id === 'demo-post-' + id);
      postId = target?.id || id;
      route = 'post';
    } else if (next === 'board' && state.boards.some(b => b.id === id)) {
      selected = id;
      scope = board(id).scope;
      route = 'board';
    } else if (['home', 'boards', 'friends', 'messages', 'settings', 'mine', 'commented', 'saved', 'hot', 'best', 'all', 'search'].includes(next)) {
      route = next;
      postId = null;
    } else route = 'home';
    render();
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-service-route]');
    if (!link) return;
    event.preventDefault();
    const route = link.dataset.serviceRoute;
    if (window.parent !== window) window.parent.postMessage({
      type: 'cheongyak:community-service-route',
      route
    }, location.origin);else location.assign('../index.html#' + route);
  });
  window.addEventListener('hashchange', restoreRoute);
  restoreRoute();
})();
