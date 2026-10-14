// restored.js에서 되살린 화면을 live.js(서버 공고·이메일 로그인) 화면과 이어 붙인다. live.js 다음에 불러와야 한다.

// 1) 공고 카드: 하트(관심 공고 저장) + 관심 공고 화면에서는 비교 체크박스
const liveHouseCard = houseCard;
houseCard = function (h, compare = false) {
  const saved = state.saved.includes(h.id);
  const heart = `<button class="heart ${saved ? 'saved' : ''}" data-action="save-house" data-id="${h.id}" aria-label="${esc(h.name)} ${saved ? '저장 취소' : '관심 공고 저장'}">${saved ? '♥' : '♡'}</button>`;
  const check = compare ? `<label class="choice-check" style="margin-top:16px"><input type="checkbox" data-action="compare" data-id="${h.id}" ${state.compare.includes(h.id) ? 'checked' : ''}> 비교 후보에 담기</label>` : '';
  return liveHouseCard(h)
    .replace('</span></div><div class="house-body">', `</span>${heart}</div><div class="house-body">`)
    .replace(/<\/div><\/article>$/, `${check}</div></article>`);
};

// 2) 금융 정보: 서버 대출 계산(대출·자금 계산) 옆에 예적금(금감원 파인 데이터)·보험 안내(설명 글)를 되살린다. 카드는 공개 API가 없어 뺐다.
FINANCE_TABS.splice(0, FINANCE_TABS.length, '대출', '예적금', '보험 안내', '자금 계산');
Object.assign(state, { savingsKind: '예금', savingsGroup: '은행' });
const savings = { data: {}, loading: '' };
async function loadSavings() {
  const key = `${state.savingsKind}|${state.savingsGroup}`;
  if (savings.data[key] || savings.loading === key) return;
  savings.loading = key;
  try { savings.data[key] = { items: (await api('/savings/', { params: { kind: state.savingsKind, fin_group: state.savingsGroup, limit: 30 } })).items }; }
  catch (error) { savings.data[key] = { error: error.message }; }
  savings.loading = '';
  render();
}
const pct = (v) => (v == null ? '-' : `${Number(v).toFixed(2)}%`);
function savingsCard(p) {
  const rows = p.options.slice(0, 8).map((o) => `<tr><td>${o.save_months ?? '-'}개월${o.reserve_type ? ' · ' + esc(o.reserve_type) : ''}</td><td>${esc(o.rate_type || '')}</td><td>${pct(o.rate)}</td><td><b>${pct(o.rate_best)}</b></td></tr>`).join('');
  return `<article class="product-card"><div class="product-top"><div class="product-logo">${esc((p.company_name || '?')[0])}</div><div><h3>${esc(p.company_name || '')}</h3><small>${esc(p.fin_group || '')} · ${esc(p.kind)}</small></div></div><span class="badge gray">${esc(p.name)}</span><div class="product-number" style="font-size:27px">최고 연 ${pct(p.rate_max)}<small> (기본 ${pct(p.rate_min)}~)</small></div><div class="table-wrap"><table><thead><tr><th>기간</th><th>방식</th><th>기본</th><th>최고</th></tr></thead><tbody>${rows}</tbody></table></div><p style="margin:12px 0 0;font-size:12px">${p.join_member ? '가입 대상: ' + esc(p.join_member) + ' · ' : ''}${p.join_way ? '가입 방법: ' + esc(p.join_way) : ''}</p>${p.special_condition ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;color:var(--green)">우대 조건 보기</summary><p style="white-space:pre-line;font-size:12px;margin:8px 0 0">${esc(p.special_condition)}</p></details>` : ''}</article>`;
}
function savingsPanel() {
  const key = `${state.savingsKind}|${state.savingsGroup}`, d = savings.data[key];
  const chips = (list, cur, action) => `<div class="subnav" style="margin:10px 0">${list.map((t) => `<button class="chip ${t === cur ? 'active' : ''}" data-action="${action}" data-value="${t}">${t}</button>`).join('')}</div>`;
  const body = !d ? '<div class="empty"><h3>상품을 불러오는 중이에요…</h3></div>' : d.error ? noteBox(`불러오지 못했어요: ${d.error}`) : !d.items.length ? '<div class="callout">조건에 맞는 상품이 없어요.</div>' : `<div class="grid2">${d.items.map(savingsCard).join('')}</div>`;
  return `<div class="section-head"><div><h2>저축 계획을 비교해 보세요</h2><p>금융감독원 금융상품 한눈에(파인) 공시를 우대 포함 최고금리 순으로 보여 드려요. 실제 가입은 각 금융회사에서 해야 해요.</p></div></div>${chips(['예금', '적금'], state.savingsKind, 'savings-kind')}${chips(['은행', '저축은행'], state.savingsGroup, 'savings-group')}${body}`;
}
const liveFinance = finance;
finance = function (sub, id) {
  const html = liveFinance(sub, id);
  const tab = state.finance;
  if (!['예적금', '보험 안내'].includes(tab)) return html;
  const hero = html.slice(0, html.indexOf('<div class="subnav">'));
  const subnav = `<div class="subnav">${FINANCE_TABS.map((t) => `<button class="chip ${tab === t ? 'active' : ''}" data-action="finance-tab" data-value="${t}">${t}</button>`).join('')}</div>`;
  if (tab === '예적금') loadSavings();
  const note = tab === '예적금' ? '예적금 금리는 금융감독원 공시 기준이며 가입 시점에 달라질 수 있어요. 개인별 우대 적용 여부는 금융회사에서 확인하세요.' : '보험 안내는 기본 개념 설명이며 개별 보험 가입 권유나 보장 분석을 하지 않아요.';
  return `${hero}${subnav}${tab === '예적금' ? savingsPanel() : insurance()}<div class="callout">${note}</div></div>`;
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action="savings-kind"],[data-action="savings-group"]');
  if (!b) return;
  state[b.dataset.action === 'savings-kind' ? 'savingsKind' : 'savingsGroup'] = b.dataset.value;
  render();
});

// 3) 내 공간: 관심 공고·내 집 기준·관심 금융 정보 바로가기
const liveDashboard = dashboard;
dashboard = function () {
  let html = liveDashboard();
  if (!html.includes('class="dash-grid"')) return html;
  const saved = state.saved.map(houseById).filter(Boolean).slice(0, 2);
  state.saved.slice(0, 2).forEach((id) => ensureHouse(id));
  const savedBox = `<div class="section-head"><h2>관심 공고 <small>${state.saved.length}건</small></h2><a href="#saved" class="text-link">전체 보기 ↗</a></div>${state.saved.length ? `<div class="list-grid">${saved.map((h) => houseCard(h)).join('')}</div>` : '<div class="empty"><h3>첫 관심 공고를 저장해 보세요</h3><p>공고 카드의 하트를 누르면 이곳에 모입니다. (로그인 필요)</p><a class="btn soft" href="#homes">집 찾기</a></div>'}<div class="section" style="padding-top:30px">`;
  html = html.replace('<div class="dash-grid"><div><div class="section-head"><h2>다음으로 해볼 일</h2></div>', `<div class="dash-grid"><div>${savedBox}<div class="section-head"><h2>다음으로 해볼 일</h2></div>`);
  html = html.replace(`${icon('money')}</a></div></div><aside`, `${icon('money')}</a><a class="feature-panel" href="#community"><div><h3>이웃의 경험 읽기</h3><p>비슷한 고민 함께 나누기 ↗</p></div>${icon('chat', true)}</a></div></div></div><aside`);
  html = html.replace('</section></aside>', `<a href="#preferences" class="dash-action">내 집 기준 설정 <span>→</span></a></section></aside>`);
  return html;
};

// 4) 집 찾기 필터 아래에 내 집 기준 설정 링크
// 5) 로그인 상태가 바뀌면 관심 공고(내 것)와 커뮤니티 글(내 공감 표시)을 서버에서 다시 받는다
const sync = { saved: null, community: null };
async function loadSaved(userId) {
  // 로그인 직후 하트를 눌러 이미 저장한 것이 있을 수 있어서, 덮어쓰지 않고 합친다
  try { state.saved = [...new Set([...state.saved, ...(await api(`/users/${userId}/saved`)).listing_ids])]; } catch { /* 못 받으면 지금 목록 그대로 */ }
  render();
}
async function communityLoad() {
  try {
    const { items } = await api('/community/posts', { params: { user_id: state.user?.member ? state.user.id : null } });
    state.posts.splice(0, state.posts.length, ...items);
  } catch { /* 못 받으면 빈 게시판으로 둔다 */ }
  render();
}
const livePrefsRender = render;
render = function () {
  livePrefsRender();
  const member = state.user?.member ? state.user.id : 0;
  if (sync.saved !== member) { sync.saved = member; if (member) loadSaved(member); else state.saved = []; }
  if (sync.community !== member) { sync.community = member; communityLoad(); }
  const route = (location.hash.slice(1) || 'home').split('/')[0];
  const panel = route === 'homes' && $('.filter-panel');
  if (panel && !panel.querySelector('[href="#preferences"]')) panel.insertAdjacentHTML('beforeend', '<a href="#preferences" class="text-link" style="display:block;margin-top:20px">내 집 기준 설정 ↗</a>');
};
render();
