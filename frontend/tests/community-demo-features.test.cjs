const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const directory = path.resolve(__dirname, '../public/prototype/community-demo');
const seed = require(path.join(directory, 'seed.js'));
const storage = require(path.join(directory, 'storage.js'));
const attachments = require(path.join(directory, 'attachments.js'));
const recommendations = require(path.join(directory, 'recommendations.js'));
const management = require(path.join(directory, 'management.js'));

function memoryFiles() {
  const records = new Map();
  return { records, putBatch: async values => values.forEach(value => records.set(value.id, value)),
    get: async id => records.get(id), remove: async ids => ids.forEach(id => records.delete(id)),
    clear: async () => records.clear() };
}
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('all file formats are accepted; only passive media gets inline previews', () => {
  assert.equal(attachments.kind({ name: 'photo.PNG', type: '' }), 'image');
  assert.equal(attachments.kind({ name: 'voice.mp3', type: '' }), 'audio');
  assert.equal(attachments.kind({ name: 'clip.mp4', type: '' }), 'video');
  for (const name of ['document.pdf', 'archive.zip', 'design.psd', 'page.html', 'drawing.svg']) {
    assert.equal(attachments.kind({ name, type: '' }), 'file');
  }
});

test('attachment blobs use their own repository while state keeps only metadata', async () => {
  const driver = memoryFiles(), repository = attachments.createRepository(driver);
  const file = new File(['community demo file'], 'demo.txt', { type: 'text/plain' });
  const [metadata] = await repository.add([file]);
  assert.match(metadata.id, /^demo-attachment-/);
  assert.equal(metadata.dataSource, 'community-demo');
  assert.equal('blob' in metadata, false);
  assert.equal(await (await repository.get(metadata.id)).text(), 'community demo file');
  assert.equal(await repository.get('demo-attachment-missing'), null);
  await repository.remove([metadata.id]);
  assert.equal(driver.records.size, 0);
  await repository.add([file]);
  await repository.clear();
  assert.equal(driver.records.size, 0);
});

test('file limits reject the entire batch before writing any part', async () => {
  const driver = memoryFiles(), repository = attachments.createRepository(driver);
  const small = { name: 'tiny.zip', size: 10, type: 'application/zip' };
  await assert.rejects(repository.add([small], 10), /10개/);
  await assert.rejects(repository.add([small, { name: 'huge.bin', size: attachments.MAX_BYTES + 1 }]), /50MB/);
  assert.equal(driver.records.size, 0);
  assert.equal((await repository.add([small], 9)).length, 1);
});

test('changing interests changes ranking and produces explainable non-fixed scores', () => {
  const me = { id: 0, interests: ['청약·주거'], region: '서울', age: '30대', bio: '' };
  const housing = { id: 1, interests: ['청약·주거'], region: '서울', age: '30대', bio: '' };
  const hobby = { id: 2, interests: ['취미·모임'], region: '서울', age: '30대', bio: '' };
  const state = { me, people: [housing, hobby], posts: [], blocked: [] };
  assert.equal(recommendations.recommend(state)[0].user.id, 1);
  assert.equal(recommendations.score(me, housing).score, 85);
  assert.ok(recommendations.score(me, housing).reasons.includes('청약·주거 관심사'));
  me.interests = ['취미·모임'];
  assert.equal(recommendations.recommend(state)[0].user.id, 2);
});

test('recommendations exclude friends, incoming requests and blocked neighbors', () => {
  const state = seed.createState();
  state.blocked.push(4);
  const snapshot = JSON.stringify(state);
  const results = recommendations.recommend(state);
  assert.ok(results.length > 6);
  assert.ok(results.every(result => !result.user.friend && !result.user.incoming && result.user.id !== 4));
  assert.ok(results.every(result => result.score >= 0 && result.score <= 100));
  assert.equal(JSON.stringify(state), snapshot);
});

test('secret post text and unrelated diagnosis fields never affect recommendations', () => {
  const me = { id: 0, interests: [], bio: '', region: '', age: '' };
  const candidate = { ...me, id: 1 };
  const posts = [0, 1].map(author => ({ author, board: 'secret', title: '비공개 개인정보', body: 'same' }));
  assert.equal(recommendations.score(me, candidate, posts).score, 0);
  posts.forEach(post => { post.board = 'free'; });
  const score = recommendations.score(me, candidate, posts).score;
  assert.equal(score, 15);
  me.income = 100000; candidate.income = 100000;
  me.diagnosis = { assets: 30000, address: 'private' };
  assert.equal(recommendations.score(me, candidate, posts).score, score);
});

test('hiding and restoring conversations preserves all messages across reloads', () => {
  const state = seed.createState(), local = memoryStorage();
  const initial = JSON.stringify(state.chats[1]);
  management.hideChat(state, 1);
  management.hideChat(state, 1);
  assert.deepEqual(state.hiddenChats, [1]);
  assert.ok(!state.unread.includes(1));
  storage.save(local, state);
  const restored = storage.load(local);
  assert.equal(JSON.stringify(restored.chats[1]), initial);
  management.restoreChat(restored, 1);
  assert.deepEqual(restored.hiddenChats, []);
  assert.equal(JSON.stringify(restored.chats[1]), initial);
});

test('pagination clamps empty and shortened lists and returns six rows per page', () => {
  const rows = Array.from({ length: 15 }, (_, id) => id);
  assert.deepEqual(management.paginate(rows, 2).items, [6, 7, 8, 9, 10, 11]);
  assert.equal(management.paginate(rows, 10).page, 3);
  assert.equal(management.paginate(rows.slice(0, 4), 3).page, 1);
  assert.deepEqual(management.paginate([], 0), { items: [], page: 1, pages: 1, total: 0 });
  assert.ok(seed.createState().people.filter(user => user.friend).length > 6);
});

test('bulk activity cleanup only removes my own content or bookmarks', () => {
  const state = seed.createState();
  const mine = state.posts.find(post => post.author === 0);
  const others = state.posts.find(post => post.author !== 0);
  others.comments = [{ id: 1, author: 0, body: 'mine' }, { id: 2, author: 1, body: 'keep' }];
  state.saved = [mine.id, others.id];
  state.liked = [mine.id, others.id];
  management.removeActivity(state, 'commented', [others.id]);
  assert.deepEqual(others.comments.map(comment => comment.body), ['keep']);
  management.removeActivity(state, 'saved', [others.id]);
  assert.deepEqual(state.saved, [mine.id]);
  assert.ok(state.posts.includes(others));
  management.removeActivity(state, 'mine', [mine.id, others.id]);
  assert.ok(state.posts.includes(others));
  assert.ok(!state.posts.includes(mine));
  assert.deepEqual(state.saved, []);
  assert.deepEqual(state.liked, [others.id]);
});

test('existing demo records migrate in place without resetting authored posts', () => {
  const state = seed.createState(), local = memoryStorage();
  state.posts[0].title = 'Keep my edited title';
  state.people = state.people.filter(user => user.id < 8);
  for (const id of Object.keys(state.chats)) if (Number(id) >= 8) delete state.chats[id];
  delete state.hiddenChats; delete state.me.interests;
  state.people.forEach(user => { delete user.interests; });
  storage.save(local, state);
  const migrated = storage.load(local);
  assert.equal(migrated.posts[0].title, 'Keep my edited title');
  assert.deepEqual(migrated.hiddenChats, []);
  assert.ok(migrated.me.interests.length);
  assert.ok(migrated.people.some(user => user.id === 19));
});

test('attachment metadata persists on posts, comments and messages, but embedded blobs are rejected', async () => {
  const state = seed.createState(), local = memoryStorage();
  const [file] = await attachments.createRepository(memoryFiles()).add([new File(['sample'], 'demo.txt')]);
  state.posts[0].attachments = [file];
  state.posts[0].comments.push({ author: 0, body: '', attachments: [file] });
  state.chats[1].push({ mine: true, text: '', attachments: [file] });
  storage.save(local, state);
  const result = storage.load(local);
  assert.deepEqual(result.posts[0].attachments, [file]);
  assert.deepEqual(result.chats[1].at(-1).attachments, [file]);
  state.posts[0].attachments[0].blob = {};
  assert.equal(storage.isDemoState(state), false);
});
