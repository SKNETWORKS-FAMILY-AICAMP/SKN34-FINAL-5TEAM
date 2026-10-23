const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const directory = path.resolve(__dirname, '../public/prototype');
const demoUser = { id: 7, name: '새싹', email: 'saessak@example.com', member: true };
const tick = () => new Promise(resolve => setTimeout(resolve, 15));
async function waitFor(check) {
  for (let i = 0; i < 30; i++) { if (check()) return; await tick(); }
  assert.ok(check(), 'Expected UI state was not reached');
}

function createDOM(filename, hash) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(directory, filename), 'utf8'), {
    url: `http://localhost:3000/prototype/${filename}${hash}`,
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console
  });
  dom.window.scrollTo = () => {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.CSS = { escape: value => String(value) };
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  return { dom, errors };
}

function runScripts(dom, folder = directory) {
  const context = dom.getInternalVMContext();
  for (const script of dom.window.document.querySelectorAll('script[src]')) {
    const filename = path.join(folder, script.getAttribute('src'));
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
}

function service(user, hash = '#community') {
  const { dom, errors } = createDOM('index.html', hash);
  const calls = [];
  dom.window.localStorage.setItem('cydemo-live-v1', 'true');
  if (user) dom.window.localStorage.setItem('cydemo-user', JSON.stringify(user));
  dom.window.fetch = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    calls.push({ pathname, method: options.method });
    let data = {};
    if (pathname === '/users/login') data = { id: 7, email: demoUser.email, nickname: demoUser.name };
    else if (pathname.endsWith('/diagnoses')) data = [];
    else if (pathname.endsWith('/saved')) data = { listing_ids: [] };
    else if (pathname.startsWith('/listings')) data = { items: [], total: 0 };
    else if (pathname.startsWith('/recommendations/')) data = { items: [] };
    return { ok: true, json: async () => data };
  };
  runScripts(dom);
  return { dom, errors, calls };
}

test('actual board UI shares posts and comments without inheriting Saessak personal activity', async () => {
  const hostA = service(demoUser), hostB = service({id:8,name:'관리자',email:'admin@example.com',member:true});
  const a = createDOM('community-demo/index.html', '#home'), b = createDOM('community-demo/index.html', '#home');
  try {
    const local = hostA.dom.window.localStorage;
    for (const [child,host] of [[a,hostA],[b,hostB]]) {
      Object.defineProperty(child.dom.window,'parent',{value:host.dom.window});
      Object.defineProperty(child.dom.window,'localStorage',{value:local});
    }
    runScripts(a.dom,path.join(directory,'community-demo'));
    const docA=a.dom.window.document;
    docA.querySelector('[data-action="write"]').click();
    const form=docA.querySelector('#write-form'); form.elements.title.value='새싹이 공유한 테스트 이야기'; form.elements.body.value='모든 계정에 보이는 게시판 내용';
    form.dispatchEvent(new a.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    const saved=JSON.parse(local.getItem('cheongyak:community-demo:v2:account:user-7'));
    const post=saved.posts.find(p=>p.title==='새싹이 공유한 테스트 이야기'); assert.ok(post);
    runScripts(b.dom,path.join(directory,'community-demo'));
    const docB=b.dom.window.document;
    assert.equal(docB.querySelector('#friend-count').textContent,'0');
    assert.equal(docB.querySelector('#message-count').textContent,'');
    assert.match(docB.querySelector('#sidebar').textContent,/내가 쓴 글0/);
    docB.querySelector(`[data-post="${post.id}"]`).click();
    assert.match(docB.querySelector('.post-detail .post-meta').textContent,/새싹/);
    docB.querySelector('#comment-form').elements.body.value='관리자가 작성한 댓글';
    docB.querySelector('#comment-form').dispatchEvent(new b.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    a.dom.window.dispatchEvent(new a.dom.window.StorageEvent('storage',{key:'cheongyak:community-demo:v3:public'}));
    assert.match(docA.querySelector('.comments').textContent,/관리자.*관리자가 작성한 댓글/s);
    assert.equal(docA.querySelector('#friend-count').textContent,'10');
    assert.deepEqual(a.errors,[]); assert.deepEqual(b.errors,[]);
  } finally { await tick(); for(const c of [a,b,hostA,hostB]) c.dom.window.close(); }
});

test('real service script order blocks anonymous browsing and login resumes the requested community screen', async () => {
  const { dom, errors, calls } = service(null, '#home');
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector('.community-preview .mini-post'), null);
    doc.querySelector('#header a[href="#community"]').click();
    await waitFor(() => doc.querySelector('#community-access-title'));
    assert.equal(doc.querySelector('.community-demo-frame'), null);
    assert.match(doc.querySelector('[role="dialog"]').textContent, /로그인이 필요합니다/);
    doc.querySelector('.modal [data-community-access="login"]').click();
    doc.querySelector('#email').value = demoUser.email;
    doc.querySelector('#nickname').value = demoUser.name;
    doc.querySelector('[data-action="login-submit"]').click();
    await waitFor(() => doc.querySelector('.community-demo-frame'));
    assert.equal(dom.window.CheongyakCommunityHost.getSession().accountId, 'user-7');
    assert.ok(calls.some(call => call.pathname === '/users/login'));
    assert.ok(calls.every(call => !call.pathname.startsWith('/community')));
    assert.deepEqual(errors, []);
  } finally { await tick(); dom.window.close(); }
});

test('real service scripts allow another account to enter shared community', async () => {
  const { dom, errors } = service({ ...demoUser, id: 8, email: 'other@example.com' }, '#post/demo-post-1');
  try {
    await tick();
    assert.ok(dom.window.document.querySelector('.community-demo-frame'));
    assert.equal(dom.window.CheongyakCommunityHost.getSession().accountId, 'user-8');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('actual community message UI persists by owner and a stale view cannot write after logout', async () => {
  const host = service(demoUser, '#community/messages');
  const child = createDOM('community-demo/index.html', '#messages');
  try {
    Object.defineProperty(child.dom.window, 'parent', { value: host.dom.window });
    Object.defineProperty(child.dom.window, 'localStorage', { value: host.dom.window.localStorage });
    runScripts(child.dom, path.join(directory, 'community-demo'));
    const doc = child.dom.window.document;
    assert.ok(doc.querySelector('#sidebar').textContent.includes('새싹'));
    const form = doc.querySelector('#message-form');
    form.elements.message.value = '계정별로 보관하는 테스트 메시지';
    form.dispatchEvent(new child.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    const key = 'cheongyak:community-demo:v2:account:user-7';
    const value = JSON.parse(host.dom.window.localStorage.getItem(key));
    assert.equal(value.ownerId, 'user-7');
    assert.equal(value.chats[1].at(-1).text, '계정별로 보관하는 테스트 메시지');
    assert.equal(host.dom.window.localStorage.getItem('cheongyak:community-demo:v1:standalone'), null);
    const beforeLogout = host.dom.window.localStorage.getItem(key);
    host.dom.window.document.querySelector('[data-action="logout"]').click();
    assert.equal(host.dom.window.document.querySelector('.community-demo-frame'), null);
    const oldForm = doc.querySelector('#message-form');
    oldForm.elements.message.value = '로그아웃 이후에는 저장하면 안 되는 메시지';
    oldForm.dispatchEvent(new child.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(host.dom.window.localStorage.getItem(key), beforeLogout);
    assert.match(doc.body.textContent, /로그인이 필요합니다/);
    assert.ok(doc.querySelector('[data-community-login]'));
    assert.deepEqual(child.errors, []);
    assert.deepEqual(host.errors, []);
  } finally { await tick(); child.dom.window.close(); host.dom.window.close(); }
});
