const test = require('node:test');
const assert = require('node:assert/strict');
const sessions = require('../public/prototype/community-demo/session.js');
global.CheongyakCommunityDemoSeed = require('../public/prototype/community-demo/seed.js');
const storage = require('../public/prototype/community-demo/storage.js');
const shared = require('../public/prototype/community-demo/shared.js');
function local() { const values = new Map(); return { values, getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) }; }
const account = (id, demo = false) => sessions.fromUser({ id, member:true, name:demo ? '새싹' : '관리자', email:demo ? 'saessak@example.com' : 'admin@example.com' });
const repo = (id, demo) => storage.forAccount(account(id,demo));
function post(id, title) { return {...global.CheongyakCommunityDemoSeed.createState().posts[0], id, author:0, title, comments:[]}; }

test('public posts and comments retain authors across account changes; personal lists do not', () => {
  const db = local(), a=repo(2,true), b=repo(1,false), sa=a.load(db);
  sa.posts.unshift(post('demo-local-shared','새싹 공개 글')); sa.saved.push('demo-local-shared');
  a.save(db,sa);
  const admin=b.load(db), p=admin.posts.find(p=>p.id==='demo-local-shared');
  assert.notEqual(p.author,0); assert.equal(admin.people.find(n=>n.id===p.author).name,'새싹');
  assert.equal(admin.people.filter(n=>n.friend).length,0); assert.deepEqual(admin.chats,{}); assert.deepEqual(admin.saved,[]);
  p.comments.push({id:11,author:0,body:'관리자 댓글'}); admin.posts.unshift(post('demo-local-admin','관리자 공개 글'));
  b.save(db,admin);
  const again=a.load(db); assert.equal(again.posts.find(p=>p.id==='demo-local-shared').author,0);
  const c=again.posts.find(p=>p.id==='demo-local-shared').comments[0];
  assert.notEqual(c.author,0); assert.equal(again.people.find(n=>n.id===c.author).name,'관리자');
  assert.ok(again.people.some(n=>n.friend)); assert.ok(again.chats[1]);
  assert.equal(b.load(db).posts.filter(p=>p.author===0).length,1);
  assert.doesNotMatch(db.getItem(shared.KEY), /saessak@example.com|"chats"|"friend"|"saved"/);
});

test('stale views preserve other users comments, posts and reaction deltas', () => {
  const db=local(), a=repo(2,true), b=repo(1,false), sa=a.load(db), admin=b.load(db);
  const id=sa.posts[0].id, likes=sa.posts[0].likes;
  sa.posts[0].comments.push({id:99,author:0,body:'동시 댓글 A'}); sa.posts[0].likes++; a.save(db,sa);
  admin.posts[0].comments.push({id:99,author:0,body:'동시 댓글 B'}); admin.posts[0].likes++; b.save(db,admin);
  const p=a.load(db).posts.find(p=>p.id===id);
  assert.ok(p.comments.some(c=>c.body==='동시 댓글 A')); assert.ok(p.comments.some(c=>c.body==='동시 댓글 B'));
  assert.equal(p.likes,likes+2);
  admin.posts=[]; b.save(db,admin); assert.ok(a.load(db).posts.some(p=>p.id===id));
});

test('administrator-first migration preserves old Saessak data and does not reimport deleted posts', () => {
  const db=local(), old=global.CheongyakCommunityDemoSeed.createState();
  Object.assign(old,{ownerId:'user-2',fixtureSet:'saessak'}); old.posts.unshift(post('demo-local-legacy','기존 글'));
  old.chats[1].push({mine:true,text:'비공개 메시지'});
  const original=JSON.stringify(old); db.setItem(storage.forAccount(account(2,true)).KEY,original);
  assert.ok(repo(1).load(db).posts.some(p=>p.id==='demo-local-legacy'));
  assert.equal(db.getItem(repo(2,true).KEY),original,'migration keeps old private record intact');
  const a=repo(2,true), mine=a.load(db); assert.equal(mine.chats[1].at(-1).text,'비공개 메시지');
  mine.posts=mine.posts.filter(p=>p.id!=='demo-local-legacy'); a.save(db,mine);
  assert.ok(!repo(1).load(db).posts.some(p=>p.id==='demo-local-legacy'));
  a.reset(db); assert.ok(repo(1).load(db).posts.length>0);
});

test('unchanged public loads do not emit repeated storage writes', () => {
  const db=local(), a=repo(2,true); a.load(db); const before=db.getItem(shared.KEY);
  a.load(db); assert.equal(db.getItem(shared.KEY),before);
  let writes=0; const set=db.setItem; db.setItem=(k,v)=>{ if(k===shared.KEY) writes++; set(k,v); };
  a.load(db); assert.equal(writes,0);
});
