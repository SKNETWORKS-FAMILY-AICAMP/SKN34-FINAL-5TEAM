(function (root) {
  function paginate(items, requested = 1, size = 6) {
    const pages = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(pages, Math.max(1, Number(requested) || 1));
    return {
      items: items.slice((page - 1) * size, page * size),
      page,
      pages,
      total: items.length
    };
  }
  function hideChat(state, id) {
    state.hiddenChats ||= [];
    if (!state.hiddenChats.includes(id)) state.hiddenChats.push(id);
    state.unread = state.unread.filter(value => value !== id);
    return state;
  }
  function restoreChat(state, id) {
    state.hiddenChats = (state.hiddenChats || []).filter(value => value !== id);
    return state;
  }
  function removeActivity(state, route, ids) {
    const chosen = new Set(ids);
    if (route === 'saved') state.saved = state.saved.filter(id => !chosen.has(id));
    if (route === 'commented') state.posts.forEach(post => {
      if (chosen.has(post.id)) post.comments = post.comments.filter(comment => comment.author !== 0);
    });
    if (route === 'mine') {
      const removed = new Set(state.posts.filter(post => post.author === 0 && chosen.has(post.id)).map(post => post.id));
      state.posts = state.posts.filter(post => !removed.has(post.id));
      state.saved = state.saved.filter(id => !removed.has(id));
      state.liked = state.liked.filter(id => !removed.has(id));
    }
    return state;
  }
  const api = Object.freeze({
    paginate,
    hideChat,
    restoreChat,
    removeActivity
  });
  root.CheongyakCommunityManagement = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : window);
