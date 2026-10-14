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

// 2) 금융 정보: 서버 대출 계산(대출·자금 계산) 옆에 예적금·카드·보험 안내(예시 상품)를 되살린다
FINANCE_TABS.splice(0, FINANCE_TABS.length, '대출', '예적금', '카드', '보험 안내', '자금 계산');
const liveFinance = finance;
finance = function (sub, id) {
  const html = liveFinance(sub, id);
  const tab = state.finance;
  if (!['예적금', '카드', '보험 안내'].includes(tab)) return html;
  const subnav = `<div class="subnav">${FINANCE_TABS.map((t) => `<button class="chip ${tab === t ? 'active' : ''}" data-action="finance-tab" data-value="${t}">${t}</button>`).join('')}</div>`;
  const hero = html.slice(0, html.indexOf('<div class="subnav">'));
  const body = tab === '보험 안내' ? insurance() : `<div class="section-head"><div><h2>${tab === '카드' ? '주로 어디에 소비하시나요?' : '저축 계획을 비교해 보세요'}</h2><p>가상의 기관과 상품으로 화면 구성을 설명합니다. 실제 추천·신청은 진행하지 않아요.</p></div></div>${tab === '카드' ? '<div class="subnav">' + ['전체', '대중교통', '마트', '온라인'].map((t) => `<button class="chip ${t === '전체' ? 'active' : ''}" data-action="card-filter" data-value="${t}">${t}</button>`).join('') + '</div>' : ''}<div class="grid3" id="product-grid">${productCards(tab)}</div>`;
  return `${hero}${subnav}${body}<div class="callout">예적금·카드·보험 안내의 상품명·금리·혜택은 예시입니다. 대출 탭만 서버가 내 조건으로 계산한 결과예요.</div></div>`;
};

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
  html = html.replace('</section></aside>', `<a href="#preferences" class="dash-action">내 집 기준 설정 <span>→</span></a></section><section class="panel"><h3>관심 금융 정보</h3><p class="demo-note">저장한 상품 ${state.products.length}건</p><a href="#finance" class="dash-action">금융 정보 살펴보기 <span>→</span></a></section></aside>`);
  return html;
};

// 4) 집 찾기 필터 아래에 내 집 기준 설정 링크
const livePrefsRender = render;
render = function () {
  livePrefsRender();
  const route = (location.hash.slice(1) || 'home').split('/')[0];
  const panel = route === 'homes' && $('.filter-panel');
  if (panel && !panel.querySelector('[href="#preferences"]')) panel.insertAdjacentHTML('beforeend', '<a href="#preferences" class="text-link" style="display:block;margin-top:20px">내 집 기준 설정 ↗</a>');
};
render();
