const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = path.resolve(__dirname, '../public/prototype/community-demo');
const sessions = require(path.join(directory, 'session.js'));
const seed = require(path.join(directory, 'seed.js'));
const storage = require(path.join(directory, 'storage.js'));
const attachments = require(path.join(directory, 'attachments.js'));
const demoUser = (id = 7) => ({ id, name: '새싹', email: sessions.DEMO_ACCOUNT.email, member: true });
const otherUser = (id = 8) => ({ id, name: '다른이웃', email: 'neighbor@example.com', member: true });
function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('membership needs a saved account, not just a guest diagnosis ID or nickname', () => {
  for (const user of [null, {}, { id: 7, name: '새싹', email: sessions.DEMO_ACCOUNT.email },
    { ...demoUser(), id: undefined }, { ...demoUser(), id: 0 }, { ...demoUser(), id: '7' },
    { ...demoUser(), email: '' }, { ...demoUser(), member: 'true' }]) {
    assert.equal(sessions.fromUser(user), null);
  }
  assert.equal(sessions.fromUser(demoUser()).demo, true);
  assert.equal(sessions.fromUser({ ...demoUser(), email: ' SAESSAK@EXAMPLE.COM ' }).demo, true);
  assert.equal(sessions.fromUser({ ...otherUser(), name: '새싹' }).demo, false);
  assert.equal(sessions.fromUser({ ...demoUser(), name: '다른이름' }).demo, false);
  assert.deepEqual(Object.keys(sessions.fromUser({ ...demoUser(), assets: 123, diagnosis: {} })).sort(), ['accountId', 'demo', 'name']);
});

test('directly opened or unrelated cross-origin frames do not receive a session', () => {
  const direct = { location: { origin: 'https://app.example' } };
  direct.parent = direct;
  assert.equal(sessions.forFrame(direct), null);
  assert.equal(sessions.forFrame({ location: direct.location, parent: { location: { origin: 'https://other.example' } } }), null);
  const parent = { location: direct.location, CheongyakCommunityHost: { getSession: () => sessions.fromUser(demoUser()) } };
  assert.equal(sessions.forFrame({ location: direct.location, parent }).accountId, 'user-7');
});

test('only the designated demo account gets fixtures; other account state starts empty', () => {
  const local = memoryStorage();
  const demo = storage.forAccount(sessions.fromUser(demoUser())).load(local);
  const other = storage.forAccount(sessions.fromUser(otherUser())).load(local);
  assert.equal(demo.me.name, '새싹');
  assert.equal(demo.posts.length, 29);
  assert.ok(demo.people.some(user => user.friend));
  assert.equal(other.me.name, '다른이웃');
  assert.equal(other.me.region, '');
  assert.equal(other.me.interest, '');
  for (const key of ['posts', 'people', 'saved', 'liked', 'pins', 'unread', 'reports', 'blocked', 'hiddenChats']) assert.deepEqual(other[key], []);
  assert.deepEqual(other.chats, {});
  assert.deepEqual(other.me.interests, []);
  assert.equal(storage.isDemoState(other), true);
  assert.throws(() => storage.forAccount(null), /signed-in/);
});

test('posts, comments, friends, chats, bookmarks and profile changes persist only for their owner', () => {
  const local = memoryStorage({ 'cydemo-diagnosis': 'keep real diagnosis' });
  const demo = storage.forAccount(sessions.fromUser(demoUser()));
  const other = storage.forAccount(sessions.fromUser(otherUser()));
  const data = demo.load(local);
  data.me.bio = '새싹만의 소개';
  data.posts[0].comments.push({ author: 0, body: '새싹만의 댓글' });
  data.chats[1].push({ mine: true, text: '새싹만의 메시지' });
  data.hiddenChats = [1];
  demo.save(local, data);
  const mine = other.load(local);
  mine.me.bio = '다른 계정 소개';
  other.save(local, mine);
  assert.notEqual(demo.KEY, other.KEY);
  assert.equal(other.load(local).posts.length, 0);
  assert.deepEqual(other.load(local).chats, {});
  assert.equal(demo.load(local).me.bio, '새싹만의 소개');
  assert.equal(demo.load(local).chats[1].at(-1).text, '새싹만의 메시지');
  assert.equal(other.load(local).me.bio, '다른 계정 소개');
  assert.equal(local.getItem('cydemo-diagnosis'), 'keep real diagnosis');
});

test('unowned legacy records are preserved but never automatically assigned to a signed-in account', () => {
  const legacy = seed.createState();
  legacy.me.bio = 'Unowned old private data';
  const local = memoryStorage({ [storage.KEY]: JSON.stringify(legacy) });
  const scoped = storage.forAccount(sessions.fromUser(demoUser()));
  assert.notEqual(scoped.load(local).me.bio, legacy.me.bio);
  assert.equal(local.getItem(storage.KEY), JSON.stringify(legacy));
  const another = storage.forAccount(sessions.fromUser(otherUser()));
  const copied = scoped.load(local);
  assert.throws(() => another.save(local, copied), /belong/);
  local.setItem(another.KEY, JSON.stringify(copied));
  assert.equal(another.load(local).posts.length, 0);
});

test('account reset does not reset another account, diagnosis, login or the legacy backup', () => {
  const local = memoryStorage({ [storage.KEY]: 'legacy backup', 'cydemo-user': 'service login', 'cydemo-diagnosis': 'real diagnosis' });
  const demo = storage.forAccount(sessions.fromUser(demoUser()));
  const other = storage.forAccount(sessions.fromUser(otherUser()));
  const data = other.load(local);
  data.me.bio = 'keep neighbor';
  other.save(local, data);
  demo.reset(local);
  assert.equal(other.load(local).me.bio, 'keep neighbor');
  assert.equal(local.getItem('cydemo-user'), 'service login');
  assert.equal(local.getItem('cydemo-diagnosis'), 'real diagnosis');
  assert.equal(local.getItem(storage.KEY), 'legacy backup');
});

function hostContext(user, hash = '#community') {
  const events = {}, documentEvents = {}, modals = [], navigations = [], frames = [];
  const app = { innerHTML: '' };
  const inputs = { '#email': {}, '#nickname': {}, '#login-form': { insertAdjacentHTML() {} } };
  const context = {
    state: { user }, afterLogin: null,
    location: { hash, origin: 'https://app.example' },
    document: {
      body: { classList: { toggle() {} }, style: { setProperty() {} } },
      querySelector: () => ({ getBoundingClientRect: () => ({ height: 50 }) }),
      addEventListener: (name, callback) => { documentEvents[name] = callback; }
    },
    $: selector => {
      if (selector === '#app') return app;
      if (selector !== '.community-demo-frame') return inputs[selector];
      const child = { location: { hash: '#home' }, addEventListener() {}, removeEventListener() {} };
      const frame = { isConnected: true, contentWindow: child, addEventListener() {}, remove() { this.isConnected = false; } };
      frames.push(frame);
      return frame;
    },
    header() {}, render() {}, read: () => null,
    modal: html => modals.push(html), login() { context.logins = (context.logins || 0) + 1; },
    go: route => navigations.push(route),
    window: { CheongyakCommunitySession: sessions, addEventListener: (name, callback) => { events[name] = callback; } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'host.js'), 'utf8'), context);
  return { context, app, events, documentEvents, modals, navigations, frames, inputs };
}

test('guest navigation and all community deep links show a login dialog without mounting any demo', () => {
  for (const hash of ['#community', '#community/friends', '#community/messages', '#post/demo-post-1']) {
    const { context, app, frames, modals } = hostContext(null, hash);
    assert.equal(frames.length, 0);
    assert.match(app.innerHTML, /로그인이 필요합니다/);
    assert.match(modals[0], /로그인하기/);
    context.render();
    assert.equal(modals.length, 1, 'background renders must not reopen a dismissed gate');
  }
});

test('other accounts, including accounts with the same nickname, cannot mount the demo', () => {
  for (const user of [otherUser(), { ...otherUser(), name: '새싹' }, { ...demoUser(), member: false }]) {
    const { frames, app } = hostContext(user);
    assert.equal(frames.length, 0);
    assert.match(app.innerHTML, /새싹/);
  }
  assert.equal(hostContext(demoUser()).frames.length, 1);
});

test('community login pre-fills the designated account and resumes the requested deep link', () => {
  const { context, documentEvents, inputs, navigations } = hostContext(null, '#community/messages');
  documentEvents.click({ target: { closest: () => ({ dataset: { communityAccess: 'login' } }) }, preventDefault() {} });
  assert.equal(context.logins, 1);
  assert.equal(inputs['#email'].value, sessions.DEMO_ACCOUNT.email);
  assert.equal(inputs['#nickname'].value, '새싹');
  context.state.user = demoUser();
  context.afterLogin();
  assert.deepEqual(navigations, ['community/messages']);
});

test('cancelling a community login or leaving the page does not redirect a later unrelated login', () => {
  for (const cancel of ['escape', 'navigate']) {
    const { context, documentEvents } = hostContext(null);
    documentEvents.click({ target: { closest: () => ({ dataset: { communityAccess: 'login' } }) }, preventDefault() {} });
    assert.equal(typeof context.afterLogin, 'function');
    if (cancel === 'escape') documentEvents.keydown({ key: 'Escape' });
    else { context.location.hash = '#homes'; context.render(); }
    assert.equal(context.afterLogin, null);
  }
});

test('logout, same-tab account switching and cross-tab logout immediately remove the old frame', () => {
  for (const user of [null, otherUser(), { ...otherUser(), name: '새싹' }]) {
    const { context, frames, app } = hostContext(demoUser());
    context.state.user = user;
    context.render();
    assert.equal(frames[0].isConnected, false);
    assert.equal(frames.length, 1);
    assert.doesNotMatch(app.innerHTML, /iframe/);
  }
  const { context, frames, events } = hostContext(demoUser());
  context.read = () => null;
  events.storage({ key: 'cydemo-user' });
  assert.equal(context.state.user, null);
  assert.equal(frames[0].isConnected, false);
});

test('a new account session mounts a fresh iframe even when both identities qualify as demo accounts', () => {
  const { context, frames } = hostContext(demoUser(7));
  context.state.user = demoUser(9);
  context.render();
  assert.equal(frames.length, 2);
  assert.equal(frames[0].isConnected, false);
  assert.notEqual(storage.forAccount(sessions.fromUser(demoUser(7))).KEY, storage.forAccount(sessions.fromUser(demoUser(9))).KEY);
});

test('opening the demo asset directly never reads fixtures or stored conversations', () => {
  let reads = 0;
  const context = {
    document: { body: { innerHTML: '' } },
    window: { CheongyakCommunitySession: { forFrame: () => null }, CheongyakCommunityDemoStorage: { load() { reads++; } } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'app.js'), 'utf8'), context);
  assert.equal(reads, 0);
  assert.match(context.document.body.innerHTML, /로그인이 필요합니다/);
});

function memoryIndexedDB() {
  const databases = new Map();
  return {
    databases,
    open(name) {
      const request = {};
      const exists = databases.has(name);
      if (!exists) databases.set(name, new Map());
      const records = databases.get(name);
      queueMicrotask(() => {
        request.result = {
          createObjectStore() {},
          transaction() {
            const tx = { objectStore: () => ({
              put: record => records.set(record.id, record),
              delete: id => records.delete(id), clear: () => records.clear(),
              get: id => {
                const result = {};
                queueMicrotask(() => { result.result = records.get(id); result.onsuccess?.(); });
                return result;
              }
            }), abort() { tx.onabort?.(); } };
            setImmediate(() => tx.oncomplete?.());
            return tx;
          }
        };
        if (!exists) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}

test('attachment reads, deletes and resets operate only in the owning account database', async () => {
  const previous = global.indexedDB;
  const indexedDB = memoryIndexedDB();
  global.indexedDB = indexedDB;
  try {
    const demo = attachments.forAccount(sessions.fromUser(demoUser()));
    const other = attachments.forAccount(sessions.fromUser(otherUser()));
    assert.notEqual(demo.DATABASE, other.DATABASE);
    const [a] = await demo.repository.add([new File(['saessak private'], 'demo.txt')]);
    const [b] = await other.repository.add([new File(['neighbor private'], 'other.txt')]);
    assert.equal(await other.repository.get(a.id), null);
    assert.equal(await demo.repository.get(b.id), null);
    await other.repository.remove([a.id]);
    assert.equal(await (await demo.repository.get(a.id)).text(), 'saessak private');
    await demo.repository.clear();
    assert.equal(await (await other.repository.get(b.id)).text(), 'neighbor private');
    assert.equal(indexedDB.databases.has(attachments.DATABASE), false);
  } finally {
    if (previous === undefined) delete global.indexedDB;
    else global.indexedDB = previous;
  }
});
