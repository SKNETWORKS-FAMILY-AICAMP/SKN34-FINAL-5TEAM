/* Explainable, local content similarity. No external AI, service profiles, or fabricated scores. */
(function (root) {
  const INTERESTS = ['청약·주거', '자취·살림', '돈·금융', '동네생활', '취미·모임', '일·커리어'];
  const terms = text => (text || '').toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || [];
  function vector(values) {
    const result = new Map();
    values.forEach(value => result.set(value, (result.get(value) || 0) + 1));
    return result;
  }
  function cosine(a, b) {
    let dot = 0,
      aa = 0,
      bb = 0;
    for (const [key, value] of a) {
      dot += value * (b.get(key) || 0);
      aa += value * value;
    }
    for (const value of b.values()) bb += value * value;
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
  }
  function textVector(user, posts) {
    return vector(terms(user.bio).concat(posts.filter(post => post.author === user.id && post.board !== 'secret').flatMap(post => terms(post.title))));
  }
  function score(me, candidate, posts = []) {
    const shared = (me.interests || []).filter(tag => (candidate.interests || []).includes(tag));
    const interests = cosine(vector(me.interests || []), vector(candidate.interests || []));
    const text = cosine(textVector(me, posts), textVector(candidate, posts));
    const sameRegion = !!me.region && me.region === candidate.region;
    const sameAge = !!me.age && me.age === candidate.age;
    const value = Math.round(100 * (interests * .60 + text * .15 + Number(sameRegion) * .15 + Number(sameAge) * .10));
    const reasons = [...shared.slice(0, 2).map(tag => `${tag} 관심사`), ...(sameRegion ? [`같은 ${me.region} 지역`] : []), ...(sameAge ? [`같은 ${me.age}`] : [])];
    if (!reasons.length) reasons.push(text > 0 ? '작성글의 주제가 비슷해요' : '새로운 관심사를 만나보세요');
    return {
      score: Math.max(0, Math.min(100, value)),
      reasons,
      shared
    };
  }
  function recommend(state, limit = Infinity) {
    return state.people.filter(user => !user.friend && !user.incoming && !state.blocked.includes(user.id)).map(user => ({
      user,
      ...score(state.me, user, state.posts)
    })).sort((a, b) => b.score - a.score || a.user.id - b.user.id).slice(0, limit);
  }
  const api = Object.freeze({
    INTERESTS,
    cosine,
    score,
    recommend
  });
  root.CheongyakCommunityRecommendations = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : window);
