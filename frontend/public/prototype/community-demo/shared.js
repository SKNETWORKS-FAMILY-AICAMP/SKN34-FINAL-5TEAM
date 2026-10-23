/* Shared fictional board content, private account activity. No service DB access. */
(function (root) {
  const KEY = 'cheongyak:community-demo:v3:public';
  const PREFIX = 'cheongyak:community-demo:v2:account:';
  const seed = () => (root.CheongyakCommunityDemoSeed || require('./seed.js')).createState();
  const clone = value => JSON.parse(JSON.stringify(value));
  const publicPerson = p => Object.fromEntries(['id', 'name', 'region', 'age', 'bio', 'color', 'interests', 'dataSource'].map(k => [k, p[k]]));
  function forAccount(account, options) {
    let baseline;
    function read(storage) {
      const raw = storage.getItem(KEY);
      if (raw) {
        const value = JSON.parse(raw);
        if (value.version !== 3 || !Array.isArray(value.posts) || !Array.isArray(value.people)) throw new Error('Invalid shared community data');
        return value;
      }
      const initial = seed();
      const shared = { version: 3, boards: initial.boards, people: initial.people.map(publicPerson), posts: [], migrated: [], members: {} };
      shared.people.push({ ...publicPerson(initial.me), id: 50000, dataSource: 'community-demo' });
      shared.posts = initial.posts.map(p => canonical(p, 50000));
      return shared;
    }
    function identity(shared, owner, me, demo) {
      let id = shared.members[owner];
      if (!id) {
        id = demo ? 50000 : Math.max(50000, ...shared.people.map(p => p.id)) + 1;
        shared.members[owner] = id;
      }
      const profile = { ...publicPerson(me), id, dataSource: 'community-demo' };
      const index = shared.people.findIndex(p => p.id === id);
      if (index < 0) shared.people.push(profile); else shared.people[index] = profile;
      return id;
    }
    function canonical(post, id) {
      return { ...clone(post), author: post.author === 0 ? id : post.author,
        comments: post.comments.map((c, i) => ({ ...clone(c), id: c.id ?? `legacy-${post.id}-${i}`, author: c.author === 0 ? id : c.author })) };
    }
    function migrate(shared, old) {
      if (!old || shared.migrated.includes(old.ownerId)) return;
      const id = identity(shared, old.ownerId, old.me, old.fixtureSet === 'saessak');
      for (const b of old.boards) if (!shared.boards.some(n => n.id === b.id)) shared.boards.push(clone(b));
      if (old.fixtureSet === 'saessak') {
        const seedIds = new Set(seed().posts.map(p => p.id));
        shared.posts = shared.posts.filter(p => !seedIds.has(p.id) || old.posts.some(n => n.id === p.id));
      }
      for (const p of old.posts) {
        const incoming = canonical(p, id), existing = shared.posts.find(p => p.id === incoming.id);
        if (!existing) shared.posts.push(incoming);
        else {
          // Old fixtures may include edits, removals and new comments: import once, not on every login.
          Object.assign(existing, incoming);
        }
      }
      shared.migrated.push(old.ownerId);
    }
    function load(storage) {
      const shared = read(storage);
      // Import owned v2 records even when the administrator visits before Saessak.
      const keys = typeof storage.key === 'function' ? Array.from({length: storage.length}, (_, i) => storage.key(i)) : [...(storage.values?.keys() || [])];
      for (const key of keys.filter(k => k?.startsWith(PREFIX))) {
        let old;
        try { old = JSON.parse(storage.getItem(key)); } catch { continue; }
        if (old?.ownerId && key === PREFIX + old.ownerId && options.isState(old)) migrate(shared, old);
      }
      let privateState;
      try { const old = JSON.parse(storage.getItem(options.key)); if (options.valid(old)) privateState = old; } catch { /* missing account */ }
      privateState ||= options.initialState();
      const id = identity(shared, account.accountId, privateState.me, account.demo);
      if (!shared.migrated.includes(account.accountId)) shared.migrated.push(account.accountId);
      const relationships = new Map(privateState.people.map(p => [p.id, p]));
      privateState.boards = clone(shared.boards);
      privateState.people = shared.people.filter(p => p.id !== id).map(p => ({ ...clone(p),
        friend: !!relationships.get(p.id)?.friend, incoming: !!relationships.get(p.id)?.incoming, requested: !!relationships.get(p.id)?.requested }));
      privateState.posts = shared.posts.map(p => ({ ...clone(p), author: p.author === id ? 0 : p.author,
        comments: p.comments.map(c => ({ ...clone(c), author: c.author === id ? 0 : c.author })) })).sort((a,b) => b.created - a.created);
      const serialized = JSON.stringify(shared);
      if (storage.getItem(KEY) !== serialized) storage.setItem(KEY, serialized);
      baseline = clone(privateState);
      return privateState;
    }
    function save(storage, value) {
      if (!options.valid(value)) throw new Error('Community records must belong to the current account.');
      if (!baseline) throw new Error('Load account before saving.');
      const shared = read(storage), id = identity(shared, account.accountId, value.me, account.demo);
      for (const b of value.boards) if (!shared.boards.some(n => n.id === b.id)) shared.boards.push(clone(b));
      const before = new Map(baseline.posts.map(p => [p.id, canonical(p, id)]));
      const next = new Map(value.posts.map(p => [p.id, canonical(p, id)]));
      shared.posts = shared.posts.filter(p => !(p.author === id && before.has(p.id) && !next.has(p.id)));
      for (const [key, incoming] of next) {
        const old = before.get(key), current = shared.posts.find(p => p.id === key);
        if (!current) { if (!old && incoming.author === id) shared.posts.push(incoming); continue; }
        if (!old || JSON.stringify(old) === JSON.stringify(incoming)) continue;
        if (current.author === id) for (const field of ['title','body','board','region','age','attachments']) if (JSON.stringify(old[field]) !== JSON.stringify(incoming[field])) current[field] = incoming[field];
        for (const field of ['likes','views']) current[field] += (incoming[field] || 0) - (old[field] || 0);
        const own = c => c.author === id;
        current.comments = current.comments.filter(c => !(own(c) && old.comments.some(b => own(b) && b.id === c.id) && !incoming.comments.some(n => own(n) && n.id === c.id)));
        for (const c of incoming.comments.filter(own)) if (!current.comments.some(n => n.author === id && n.id === c.id)) current.comments.push(c);
      }
      storage.setItem(KEY, JSON.stringify(shared));
      storage.setItem(options.key, JSON.stringify(value));
      baseline = clone(value);
    }
    return { load, save, reset(storage) {
      // Reset personal activity only. Published contributions belong to the shared board.
      const value = load(storage), fresh = options.initialState();
      for (const key of ['me','saved','liked','pins','chats','unread','reports','blocked','hiddenChats','notifications']) value[key] = fresh[key];
      value.people.forEach(p => { const initial = fresh.people.find(n => n.id === p.id); for (const k of ['friend','incoming','requested']) p[k] = !!initial?.[k]; });
      save(storage, value);
      return value;
    } };
  }
  const api = { KEY, forAccount };
  root.CheongyakCommunityShared = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : window);
