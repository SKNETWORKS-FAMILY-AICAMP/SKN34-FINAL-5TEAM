/* Minimal account boundary only; never pass diagnosis or financial data to the demo. */
(function (root) {
  const DEMO_ACCOUNT = Object.freeze({ email: 'saessak@example.com', nickname: '새싹' });

  function fromUser(user) {
    if (user?.member !== true || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
    if (typeof user.email !== 'string' || !user.email.trim() || typeof user.name !== 'string' || !user.name.trim()) return null;
    return Object.freeze({
      accountId: `user-${user.id}`,
      name: user.name.trim(),
      demo: user.email.trim().toLowerCase() === DEMO_ACCOUNT.email && user.name.trim() === DEMO_ACCOUNT.nickname
    });
  }

  function isSession(value) {
    return Boolean(value && /^user-[1-9]\d*$/.test(value.accountId) &&
      typeof value.name === 'string' && value.name.trim() && typeof value.demo === 'boolean');
  }

  function forFrame(target) {
    try {
      if (target.parent === target || target.parent.location.origin !== target.location.origin) return null;
      const value = target.parent.CheongyakCommunityHost?.getSession();
      return isSession(value) ? value : null;
    } catch {
      return null;
    }
  }

  const api = Object.freeze({ DEMO_ACCOUNT, fromUser, isSession, forFrame });
  root.CheongyakCommunitySession = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : window);
