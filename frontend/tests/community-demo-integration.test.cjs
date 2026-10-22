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
    assert.equal(doc.querySelector('#email').value, demoUser.email);
    assert.equal(doc.querySelector('#nickname').value, demoUser.name);
    doc.querySelector('[data-action="login-submit"]').click();
    await waitFor(() => doc.querySelector('.community-demo-frame'));
    assert.equal(dom.window.CheongyakCommunityHost.getSession().accountId, 'user-7');
    assert.ok(calls.some(call => call.pathname === '/users/login'));
    assert.ok(calls.every(call => !call.pathname.startsWith('/community')));
    assert.deepEqual(errors, []);
  } finally { await tick(); dom.window.close(); }
});

test('real service scripts reject a same-nickname account without reading its community data', async () => {
  const { dom, errors } = service({ ...demoUser, id: 8, email: 'other@example.com' }, '#post/demo-post-1');
  try {
    await tick();
    assert.equal(dom.window.document.querySelector('.community-demo-frame'), null);
    assert.match(dom.window.document.querySelector('#app').textContent, /새싹 시연 계정 전용/);
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
