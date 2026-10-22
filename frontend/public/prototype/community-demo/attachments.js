/* Files stay in a dedicated IndexedDB, never the service API or localStorage JSON. */
(function (root) {
  const DATABASE = 'cheongyak-community-demo-attachments-v1';
  const MAX_BYTES = 50 * 1024 * 1024;
  const MAX_FILES = 10;
  function kind(file) {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|avif|bmp)$/.test(name) || /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(type)) return 'image';
    if (type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/.test(name)) return 'audio';
    if (type.startsWith('video/') || /\.(mp4|mov|m4v)$/.test(name)) return 'video';
    return 'file';
  }
  function createRepository(driver) {
    return {
      async add(files, existing = 0) {
        const list = Array.from(files);
        if (list.length + existing > MAX_FILES) throw new Error('첨부는 한 번에 최대 10개까지 가능해요.');
        for (const file of list) if (file.size > MAX_BYTES) throw new Error(`${file.name}: 파일 하나당 50MB까지 첨부할 수 있어요.`);
        const records = list.map(file => ({
          id: 'demo-attachment-' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)),
          dataSource: 'community-demo',
          name: file.name || '첨부파일',
          type: file.type || 'application/octet-stream',
          size: file.size,
          kind: kind(file),
          created: Date.now(),
          blob: file
        }));
        await driver.putBatch(records);
        return records.map(({
          blob,
          ...metadata
        }) => metadata);
      },
      async get(id) {
        return (await driver.get(id))?.blob || null;
      },
      remove(ids) {
        return driver.remove(ids);
      },
      clear() {
        return driver.clear();
      }
    };
  }
  function indexedDBDriver(database = DATABASE) {
    let opening;
    function open() {
      if (!root.indexedDB) return Promise.reject(new Error('이 브라우저에서는 파일 저장을 사용할 수 없어요.'));
      return opening ||= new Promise((resolve, reject) => {
        const request = root.indexedDB.open(database, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('files', {
          keyPath: 'id'
        });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          opening = null;
          reject(request.error);
        };
      });
    }
    async function transaction(mode, work) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('files', mode);
        let result;
        const setResult = value => {
          result = value;
        };
        try {
          work(tx.objectStore('files'), setResult);
        } catch (error) {
          tx.abort();
          reject(error);
          return;
        }
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(new Error('파일을 저장하지 못했어요. 브라우저의 남은 저장 공간을 확인해 주세요.'));
      });
    }
    return {
      putBatch: records => transaction('readwrite', store => records.forEach(record => store.put(record))),
      get: id => transaction('readonly', (store, done) => {
        const request = store.get(id);
        request.onsuccess = () => done(request.result);
      }),
      remove: ids => transaction('readwrite', store => ids.forEach(id => store.delete(id))),
      clear: () => transaction('readwrite', store => store.clear())
    };
  }
  const api = {
    DATABASE,
    MAX_BYTES,
    MAX_FILES,
    kind,
    createRepository,
    forAccount(account) {
      const sessions = root.CheongyakCommunitySession || (typeof module === 'object' && module.exports ? require('./session.js') : null);
      if (!sessions.isSession(account)) throw new Error('A signed-in community account is required.');
      const database = DATABASE + ':' + account.accountId;
      return Object.freeze({ DATABASE: database, repository: createRepository(indexedDBDriver(database)) });
    },
    repository: createRepository(indexedDBDriver())
  };
  root.CheongyakCommunityAttachments = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : window);
