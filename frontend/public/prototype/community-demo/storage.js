/* Browser-only demo repository. Never reads cydemo-* or calls a server. */
(function (root) {
  const KEY = 'cheongyak:community-demo:v1:standalone';
  const SOURCE = 'community-demo';
  const ACCOUNT_PREFIX = 'cheongyak:community-demo:v2:account:';
  const sessions = root.CheongyakCommunitySession || (typeof module === 'object' && module.exports ? require('./session.js') : null);
  const seed = () => root.CheongyakCommunityDemoSeed.createState();
  function attachmentsValid(items) {
    return items === undefined || Array.isArray(items) && items.length <= 10 && items.every(item => item.dataSource === SOURCE && typeof item.id === 'string' && item.id.startsWith('demo-attachment-') && typeof item.name === 'string' && typeof item.type === 'string' && Number.isFinite(item.size) && item.size >= 0 && ['image', 'audio', 'video', 'file'].includes(item.kind) && !('blob' in item));
  }
  function isDemoState(value) {
    if (!value || value.dataSource !== SOURCE || value.schemaVersion !== 1) return false;
    if (!value.me || value.me.id !== 0 || typeof value.me.name !== 'string') return false;
    const lists = ['people', 'posts', 'boards', 'saved', 'liked', 'pins', 'unread', 'reports', 'blocked'];
    if (!lists.every(key => Array.isArray(value[key])) || !value.chats || typeof value.chats !== 'object') return false;
    const users = new Set([0, ...value.people.map(user => user.id)]);
    const boards = new Set(value.boards.map(board => board.id));
    return value.people.every(user => user.dataSource === SOURCE && typeof user.name === 'string') && value.posts.every(post => post.dataSource === SOURCE && typeof post.id === 'string' && post.id.startsWith('demo-') && users.has(post.author) && boards.has(post.board) && typeof post.title === 'string' && typeof post.body === 'string' && attachmentsValid(post.attachments) && Array.isArray(post.comments) && post.comments.every(comment => users.has(comment.author) && typeof comment.body === 'string' && attachmentsValid(comment.attachments))) && [...value.saved, ...value.liked].every(id => typeof id === 'string' && id.startsWith('demo-')) && Object.entries(value.chats).every(([id, messages]) => users.has(Number(id)) && Array.isArray(messages) && messages.every(message => typeof message.text === 'string' && attachmentsValid(message.attachments))) && (value.hiddenChats === undefined || Array.isArray(value.hiddenChats) && value.hiddenChats.every(id => users.has(id)));
  }
  function load(storage) {
    try {
      const value = JSON.parse(storage.getItem(KEY));
      if (isDemoState(value)) {
        const initial = seed();
        value.hiddenChats ||= [];
        value.me.interests ||= initial.me.interests;
        value.people.forEach(user => {
          user.interests ||= initial.people.find(item => item.id === user.id)?.interests || [];
        });
        for (const user of initial.people) if (!value.people.some(item => item.id === user.id)) value.people.push(user);
        for (const [id, messages] of Object.entries(initial.chats)) value.chats[id] ??= messages;
        return value;
      }
    } catch {/* Missing, unavailable, or incompatible demo storage starts fresh. */}
    return seed();
  }
  function save(storage, value) {
    if (!isDemoState(value)) throw new Error('Only isolated community-demo records can be saved.');
    storage.setItem(KEY, JSON.stringify(value));
  }
  function reset(storage) {
    const value = seed();
    save(storage, value);
    return value;
  }
  function forAccount(account) {
    if (!sessions.isSession(account)) throw new Error('A signed-in community account is required.');
    // Capture immutable identity: a later login must never redirect an old write to a new account.
    const { accountId, name, demo } = account;
    const key = ACCOUNT_PREFIX + accountId;
    function initialState() {
      const value = seed();
      if (!demo) {
        Object.assign(value, {
          me: { id: 0, name, email: '', region: '', age: '', interest: '', bio: '', color: '#dfeada', interests: [] },
          people: [], posts: [], saved: [], liked: [], pins: [], chats: {},
          unread: [], reports: [], blocked: [], hiddenChats: []
        });
      }
      value.ownerId = accountId;
      value.fixtureSet = demo ? 'saessak' : 'empty';
      return value;
    }
    function valid(value) {
      return isDemoState(value) && value.ownerId === accountId && value.fixtureSet === (demo ? 'saessak' : 'empty');
    }
    function loadAccount(storage) {
      try {
        const value = JSON.parse(storage.getItem(key));
        if (valid(value)) return value;
      } catch {/* Never import an unowned legacy record or another account's state. */}
      return initialState();
    }
    function saveAccount(storage, value) {
      if (!valid(value)) throw new Error('Community records must belong to the current account.');
      storage.setItem(key, JSON.stringify(value));
    }
    return Object.freeze({
      KEY: key,
      load: loadAccount,
      save: saveAccount,
      reset(storage) {
        const value = initialState();
        saveAccount(storage, value);
        return value;
      }
    });
  }
  const repository = Object.freeze({
    KEY,
    SOURCE,
    isDemoState,
    load,
    save,
    reset,
    forAccount
  });
  root.CheongyakCommunityDemoStorage = repository;
  if (typeof module === 'object' && module.exports) module.exports = repository;
})(typeof globalThis === 'object' ? globalThis : window);
