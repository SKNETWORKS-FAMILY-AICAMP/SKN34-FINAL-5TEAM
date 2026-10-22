const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = path.resolve(__dirname, '../public/prototype/community-demo');
const seed = require(path.join(directory, 'seed.js'));
const repository = require(path.join(directory, 'storage.js'));
const sessions = require(path.join(directory, 'session.js'));

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('fixtures and generated IDs stay in the fictional dataset', () => {
  const first = seed.createState();
  const second = seed.createState();
  assert.ok(repository.isDemoState(first));
  assert.equal(first.posts.length, 29);
  assert.ok(first.posts.every(post => post.id.startsWith('demo-') && post.example));
  first.posts[0].title = 'Changed fixture';
  assert.notEqual(first.posts[0].title, second.posts[0].title);
});

test('old service records and prototype storage are never imported', () => {
  const storage = memoryStorage({
    'cydemo-user': JSON.stringify({ id: 903, name: 'Real account' }),
    'cydemo-diagnosis': JSON.stringify({ assets: 100000, age: '30대' }),
    'cydemo-posts': JSON.stringify([{ id: 903, title: 'Real post' }]),
    'cheongyak-community-v2': JSON.stringify({ posts: [{ id: 903 }] }),
  });
  const result = repository.load(storage);
  assert.equal(result.me.name, '새싹');
  assert.ok(result.posts.every(post => post.id !== 903));
  assert.equal(storage.values.size, 4);
});

test('even records in the demo key need a matching source and fake post IDs', () => {
  const storage = memoryStorage();
  const bad = seed.createState();
  bad.posts[0].id = 12;
  assert.throws(() => repository.save(storage, bad), /Only isolated/);
  storage.setItem(repository.KEY, JSON.stringify(bad));
  assert.equal(repository.load(storage).posts[0].id, 'demo-post-1');
  bad.posts[0].id = 'demo-post-1';
  bad.posts[0].dataSource = 'server';
  assert.equal(repository.isDemoState(bad), false);
});

test('demo posts, comments, messages and profile edits persist without changing service data', () => {
  const diagnosis = JSON.stringify({ region: '경기', assets: 9000 });
  const storage = memoryStorage({ 'cydemo-diagnosis': diagnosis });
  const value = seed.createState();
  value.me.name = '시연닉네임';
  value.posts.unshift({ ...value.posts[0], id: 'demo-local-post-test', author: 0, example: false });
  value.posts[0].comments.push({ id: 'test-comment', author: 0, body: '시연 댓글' });
  value.chats[1].push({ mine: true, text: '시연 메시지' });
  repository.save(storage, value);
  const restored = repository.load(storage);
  assert.equal(restored.me.name, '시연닉네임');
  assert.equal(restored.posts[0].comments.at(-1).body, '시연 댓글');
  assert.equal(restored.chats[1].at(-1).text, '시연 메시지');
  assert.equal(storage.getItem('cydemo-diagnosis'), diagnosis);
  assert.deepEqual([...storage.values.keys()].sort(), [repository.KEY, 'cydemo-diagnosis'].sort());
});

test('reset changes only the community demo key and preserves diagnosis and saved listings', () => {
  const storage = memoryStorage({ 'cydemo-diagnosis': 'keep diagnosis', 'cydemo-saved': '[999]' });
  const value = seed.createState();
  value.me.name = 'Changed';
  repository.save(storage, value);
  assert.equal(repository.reset(storage).me.name, '새싹');
  assert.equal(storage.getItem('cydemo-diagnosis'), 'keep diagnosis');
  assert.equal(storage.getItem('cydemo-saved'), '[999]');
});

test('invalid JSON and unavailable browser storage still start with demo fixtures', () => {
  assert.ok(repository.isDemoState(repository.load(memoryStorage({ [repository.KEY]: '{invalid' }))));
  assert.ok(repository.isDemoState(repository.load({ getItem() { throw new Error('Disabled'); } })));
});

test('active service entrypoint does not load the old server-backed community scripts', () => {
  const index = fs.readFileSync(path.join(directory, '../index.html'), 'utf8');
  const live = fs.readFileSync(path.join(directory, '../restored-live.js'), 'utf8');
  assert.doesNotMatch(index, /src="community-v[23]\.js"/);
  assert.match(index, /community-demo\/host\.js/);
  assert.doesNotMatch(live, /communityLoad|\/community\/posts/);
  for (const name of ['app.js', 'seed.js', 'storage.js', 'attachments.js', 'recommendations.js', 'management.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(directory, name), 'utf8'), /\bfetch\s*\(|\bapi\s*\(|XMLHttpRequest|axios/);
  }
});

test('community navigation bridge checks frame, origin, message type and allowed service route', () => {
  const events = {};
  const childEvents = {};
  const navigation = [];
  const headers = [];
  const layout = new Map();
  let serviceRenders = 0;
  let load;
  const child = { location: { hash: '#home' }, addEventListener: (name, fn) => { childEvents[name] = fn; }, removeEventListener() {} };
  const frame = { isConnected: true, remove() {}, contentWindow: child, addEventListener: (name, fn) => { if (name === 'load') load = fn; } };
  const context = {
    state: { user: { id: 7, email: sessions.DEMO_ACCOUNT.email, name: '새싹', member: true } },
    location: { hash: '#community', origin: 'https://app.example' },
    document: {
      addEventListener() {},
      body: { classList: { toggle() {} }, style: { setProperty: (name, value) => layout.set(name, value) } },
      querySelector: selector => ({ getBoundingClientRect: () => ({ height: selector === '#header' ? 83 : 33 }) }),
    },
    $: selector => selector === '#app' ? { innerHTML: '' } : frame,
    render: () => { serviceRenders++; }, go: route => navigation.push(route),
    header: route => headers.push(route),
    window: { CheongyakCommunitySession: sessions, addEventListener: (name, fn) => { events[name] = fn; } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'host.js'), 'utf8'), context);
  assert.match(frame.src, /community-demo\/index\.html#home$/);
  assert.equal(serviceRenders, 0);
  assert.deepEqual(headers, ['community']);
  assert.equal(layout.get('--community-shell-height'), '116px');
  load();
  const event = { source: child, origin: context.location.origin, data: { type: 'cheongyak:community-service-route', route: 'diagnosis' } };
  events.message({ ...event, origin: 'https://untrusted.example' });
  events.message({ ...event, source: {} });
  events.message({ ...event, data: { ...event.data, route: 'https://untrusted.example' } });
  assert.equal(navigation.length, 0);
  events.message(event);
  assert.deepEqual(navigation, ['diagnosis']);
  child.location.hash = '#post/demo-post-1';
  childEvents.hashchange();
  assert.equal(context.location.hash, 'post/demo-post-1');
  context.location.hash = '#diagnosis';
  context.render();
  assert.equal(serviceRenders, 1);
});

test('community reuses the service header and the same palette, font and base controls', () => {
  const serviceIndex = fs.readFileSync(path.join(directory, '../index.html'), 'utf8');
  const communityIndex = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const serviceCSS = fs.readFileSync(path.join(directory, '../styles.css'), 'utf8');
  const communityCSS = fs.readFileSync(path.join(directory, 'styles.css'), 'utf8');
  const shared = fs.readFileSync(path.join(directory, '../design-system.css'), 'utf8');
  const app = fs.readFileSync(path.join(directory, 'app.js'), 'utf8');
  const hostCSS = fs.readFileSync(path.join(directory, 'host.css'), 'utf8');
  assert.match(serviceIndex, /href="design-system\.css"/);
  assert.match(communityIndex, /href="\.\.\/design-system\.css"/);
  assert.doesNotMatch(serviceCSS, /:root\s*\{/);
  assert.doesNotMatch(communityCSS, /:root\s*\{/);
  assert.match(shared, /--green:#163f33/);
  assert.match(shared, /--paper:#f7f8f4/);
  assert.match(shared, /--orange:#ef783e/);
  assert.match(shared, /\.btn,\.primary,\.secondary\s*\{/);
  assert.match(communityCSS, /var\(--font-family\)/);
  assert.doesNotMatch(app, /<header class="site-header">/);
  assert.doesNotMatch(hostCSS, /\.community-demo-active\s*>\s*#header|\.community-demo-active\s*>\s*#modal-root/);
});

test('community subheader matches service background and shows only the profile avatar', () => {
  const app = fs.readFileSync(path.join(directory, 'app.js'), 'utf8');
  const serviceCSS = fs.readFileSync(path.join(directory, '../styles.css'), 'utf8');
  const communityCSS = fs.readFileSync(path.join(directory, 'styles.css'), 'utf8');
  const shared = fs.readFileSync(path.join(directory, '../design-system.css'), 'utf8');
  assert.match(shared, /--header-background:#fffefbf2/);
  assert.match(serviceCSS, /background:var\(--header-background\)/);
  assert.match(communityCSS, /\.community-header\{background:var\(--header-background\)/);
  assert.doesNotMatch(app, /예시 데이터로 체험 중|header-name|demo-badge/);
  assert.match(app, /aria-label="커뮤니티 내 정보"><span id="header-avatar"><\/span><\/button>/);
  assert.match(app, /\$\('#header-avatar'\)\.innerHTML = av\(state\.me, 'small'\)/);
});
