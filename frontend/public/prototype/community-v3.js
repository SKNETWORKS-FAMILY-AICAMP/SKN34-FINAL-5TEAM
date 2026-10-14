// Community prototype: all member preferences and contributions stay in this browser.
(() => {
  const ages = ['20대', '30대', '40대', '50대 이상'];
  const localBoards = ['자유', '청약·집 구하기', '금융', '입주 새내기', '동네 생활정보', '자취생', '장터', '친구 만들기', '비밀의 화원'];
  const unionBoards = ['자유', '청약·집 구하기', '금융', '생활정보·꿀팁', '재테크', '취업·커리어', '음식·맛집', '만화·애니', '연극·뮤지컬', '음악', '스포츠', '게임', '홍보·동아리'];
  const symbols = { '자유':'chat', '청약·집 구하기':'home', '금융':'money', '입주 새내기':'leaf', '동네 생활정보':'pin', '자취생':'home', '장터':'card', '재테크':'money', '취업·커리어':'check' };
  const defaults = {scope:'지역', region:state.user?.region || '서울', view:'home', board:'자유', age:state.user?.age || '20대', search:'', sort:'최신순', period:'this-month', limit:12};
  const ui = {...defaults};
  const now = Date.now();
  const safeAge = value => ages.includes(value) ? value : value === '40대 이상' ? '40대' : value?.startsWith('6') || value === '50대' ? '50대 이상' : '20대';
  let posts = read('posts-v3', null);
  if (!posts) {
    posts = state.posts.map(p => ({...p, age:p.example ? safeAge(p.age) : p.age}));
    let n = 30000;
    const seeds = [
      ['청약·집 구하기','공고문, 이 다섯 군데부터 읽으니까 훨씬 쉽네요','공급 대상 → 신청 일정 → 자격 기준 → 제출 서류 → 공식 접수처 순서로 메모했어요. 처음 준비하는 분들께 제 정리 방법을 공유합니다.',128,'checklist'],
      ['동네 생활정보','퇴근길에 발견한, 조용히 걷기 좋은 산책 코스','이어폰 잠깐 빼고 걸었는데 생각이 정리되더라고요. 여러분 동네에도 좋아하는 산책길이 있나요?',36,'walk'],
      ['금융','보증금만 모으면 끝인 줄 알았던 이사 예산','이사비, 중개보수, 가전 설치비까지 적으니 계획이 달라졌어요. 비용 항목을 먼저 적는 게 도움이 됐습니다.',104,'budget'],
      ['입주 새내기','처음 독립한 날, 가장 먼저 산 물건이 뭐였어요?','큰 가구보다 작은 생활용품이 먼저 필요하더라고요. 첫 자취 준비 목록을 같이 만들어 봐요.',23,'room'],
      ['자유','집 크기와 출퇴근 30분, 하나만 고른다면?','매일 오가는 시간과 주말에 보내는 공간 사이에서 고민이에요. 직접 살아본 경험이 궁금합니다.',9,null],
      ['자취생','일요일에 세 끼만 미리 준비해도 한 주가 편해요','재료를 겹쳐서 쓰니 음식물도 덜 남네요. 냉장고가 작은 집의 식재료 관리 팁을 나눠요.',16,'room']
    ];
    const comment = [{author:'익명 새싹', body:'저도 준비 중인데 이런 경험 공유가 도움이 되네요!'}];
    regionsV2.forEach((region, ri) => seeds.forEach((s, i) => posts.push({id:n++,scope:'지역',region,board:s[0],title:s[1],body:s[2],likes:s[3]+ri,art:s[4],age:ages[(ri+i)%4],author:['익명 초록','익명 모모','익명 이웃'][i%3],comments:i%2?[]:comment.map(c=>({...c})),createdAt:now-(i+1)*3600000,time:'오늘',example:true})));
    [
      ['청약·집 구하기','처음 집을 구할 때 알았으면 좋았을 것들',145,'checklist'],
      ['재테크','가계부 3개월, 소비를 줄인 건 의외로 작은 습관',118,'budget'],
      ['취업·커리어','퇴근하고 자격증 공부, 다들 어떻게 이어가세요?',28,null],
      ['음식·맛집','배달 대신 15분, 냉장고 재료로 만든 저녁',32,'room'],
      ['자유','주말에 아무 약속이 없으면 오히려 좋은 사람',17,null],
      ['금융','금리 숫자와 함께 읽어야 했던 상품 조건들',107,'budget']
    ].forEach((s,i)=>posts.push({id:n++,scope:'연합',region:null,board:s[0],title:s[1],body:'지역이 달라도 비슷한 고민을 하고 있더라고요. 직접 겪은 일과 나에게 도움이 되었던 방법을 함께 나눠요.',likes:s[2],art:s[3],age:ages[i%4],author:'익명 구름',comments:comment.map(c=>({...c})),createdAt:now-(i+1)*7200000,time:'오늘',example:true}));
    ages.forEach((age,i)=>posts.push({id:n++,scope:'연합',region:null,board:'또래 이야기',age,title:['첫 독립 준비, 다들 얼마씩 모으고 있어요?','집과 일 사이, 나만의 기준이 생겼나요?','가족의 생활 동선을 고려하니 집 보는 기준이 달라져요','앞으로 살고 싶은 동네의 조건은 무엇인가요?'][i],body:'비슷한 시기를 보내는 분들의 이야기가 궁금해요. 각자의 상황은 다르니 편하게 경험을 나눠 주세요.',author:'익명 이웃',likes:14+i*3,comments:[],createdAt:now-(i+1)*3600000,example:true}));
    // Earlier periods have their own sample records, so BEST period controls are meaningful.
    for (const scope of ['지역','연합']) for (const region of scope==='지역'?regionsV2:[null]) {
      [new Date(new Date().getFullYear(),new Date().getMonth()-1,15),new Date(new Date().getFullYear(),new Date().getMonth()<6?-1:2,15)].forEach((date,i)=>posts.push({id:n++,scope,region,board:'청약·집 구하기',title:i?'집 찾기를 시작하며 적어 둔 나만의 체크리스트':'이사 한 달 뒤에야 알게 된 생활의 작은 변화',body:'시간이 지나도 다시 꺼내 보고 싶은 이웃의 경험을 모았어요. 이전 기간을 보여 주는 예시 글입니다.',author:'익명 나무',age:'30대',likes:156+i*21,comments:[],createdAt:date.getTime(),example:true,art:'checklist'}));
    }
    save('posts-v3',posts);
  }
  state.posts = posts;
  const persistPosts = () => save('posts-v3', posts);
  const scopePosts = () => posts.filter(p => p.scope===ui.scope && (ui.scope!=='지역'||p.region===ui.region));
  const scoreSort = (a,b) => b.likes-a.likes || b.comments.length-a.comments.length || b.createdAt-a.createdAt;
  const isHot = p => p.likes>=10 && p.createdAt>=Date.now()-7*86400000;
  const context = p => p.board==='또래 이야기'?`전국 · ${esc(p.age)} 또래`:p.scope==='지역'?`${esc(p.region)} · ${esc(p.board)}`:`연합 · ${esc(p.board)}`;
  const time = p => {const diff=Date.now()-p.createdAt;if(diff<60000)return '방금';if(diff<3600000)return Math.floor(diff/60000)+'분 전';if(diff<86400000)return Math.floor(diff/3600000)+'시간 전';return new Date(p.createdAt).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'});};
  const liked = id => read('liked-v3',[]).includes(id);
  const savedPost = id => read('scraps-v3',[]).includes(id);
  const key = (scope,region,board) => [scope,scope==='지역'?region:'전국',board].join('|');
  const boardKey = board => key(ui.scope,ui.region,board);
  const pins = () => read('board-pins-v3',[{scope:'지역',region:state.user?.region||'서울',board:'자유'},{scope:'지역',region:state.user?.region||'서울',board:'청약·집 구하기'},{scope:'연합',region:null,board:'금융'}]);
  const pinned = board => pins().some(p=>key(p.scope,p.region,p.board)===boardKey(board));
  const unread = board => scopePosts().some(p=>p.board===board&&p.createdAt>(read('board-seen-v3',{})[boardKey(board)]||0)&&p.createdAt>Date.now()-7*86400000);
  const markRead = () => {const seen=read('board-seen-v3',{});seen[boardKey(ui.board)]=Date.now();save('board-seen-v3',seen);};
  const opts = (values,selected) => values.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
  function navigate(view,board) {ui.view=view;ui.search='';ui.limit=12;if(board){ui.board=board;markRead();}go('community');}
  function art(type,small=false) {
    const drawings = {
      checklist:'<rect x="56" y="15" width="88" height="112" rx="10" fill="#fffaf0"/><rect x="78" y="9" width="43" height="16" rx="6" fill="#deae70"/><path d="m72 51 5 5 9-10m-14 33 5 5 9-10m-14 33 5 5 9-10" fill="none" stroke="#416b54" stroke-width="4"/><path d="M95 51h30M95 79h24M95 107h30" stroke="#c8d2bf" stroke-width="5"/>',
      budget:'<rect x="43" y="27" width="120" height="88" rx="13" fill="#d6b381"/><path d="M43 47h120" stroke="#b38b5d" stroke-width="3"/><rect x="119" y="60" width="50" height="30" rx="8" fill="#fff3d8"/><circle cx="141" cy="75" r="7" fill="#b68c55"/><circle cx="62" cy="103" r="19" fill="#f2cf77"/><path d="M54 101h16m-8-8v20" stroke="#ac853d" stroke-width="3"/>'.replace(' sixty','60'),
      walk:'<path d="M0 101Q60 54 110 92T200 90V140H0Z" fill="#a9c0a1"/><path d="M81 140Q135 110 113 85T140 42" fill="none" stroke="#e7dec3" stroke-width="18"/><path d="M40 113V53m121 27V24" stroke="#617e5c" stroke-width="6"/><circle cx="40" cy="44" r="26" fill="#7c9b70"/><circle cx="161" cy="29" r="25" fill="#5f865e"/><circle cx="101" cy="28" r="13" fill="#fff2c9"/>',
      room:'<rect x="29" y="20" width="70" height="65" rx="6" fill="#fff7e7"/><path d="M64 20v65M29 52h70" stroke="#cbd3bf" stroke-width="5"/><rect x="65" y="82" width="105" height="32" rx="10" fill="#b7bd95"/><rect x="72" y="69" width="91" height="30" rx="12" fill="#ccd0ad"/><path d="M76 113v12m83-12v12" stroke="#846e52" stroke-width="6"/><rect x="29" y="107" width="20" height="19" rx="4" fill="#bd916b"/><path d="M39 107V77" stroke="#6d8a58" stroke-width="4"/><ellipse cx="33" cy="80" rx="7" ry="15" fill="#779b64"/>'
    };
    return `<div class="c3-art ${small?'small':''} ${type||'room'}"><svg viewBox="0 0 200 140" aria-hidden="true">${drawings[type]||drawings.room}</svg></div>`;
  }
  function metric(p){return `<span class="c3-empathy">♡ ${p.likes}</span><span class="c3-replies">${icon('chat')} ${p.comments.length}</span>`;}
  function row(p,rank) {return `<article class="c3-post-row">${rank?`<span class="c3-rank">${String(rank).padStart(2,'0')}</span>`:''}<a class="c3-post-link" href="#post/${p.id}"><div class="c3-post-copy"><div class="c3-post-tags"><span>${context(p)}</span>${p.example?'<small>예시</small>':''}</div><h3>${esc(p.title)}</h3><p>${esc(p.body.split('\n')[0])}</p><div class="c3-meta">${metric(p)}<span>${time(p)}</span><span>${esc(p.author)}</span></div></div>${p.art?art(p.art,true):''}</a></article>`;}
  function boardTile(board) {return `<div class="c3-board-tile"><button class="c3-board-open" data-c3="board" data-value="${board}">${icon(symbols[board]||'chat')}<span><strong>${board}${unread(board)?'<i class="c3-new" aria-label="새 글">N</i>':''}</strong><small>${scopePosts().filter(p=>p.board===board).length}개의 이야기</small></span></button><button class="c3-pin ${pinned(board)?'active':''}" data-c3="pin" data-value="${board}" aria-label="${board} 즐겨찾기 ${pinned(board)?'해제':'추가'}" aria-pressed="${pinned(board)}">${pinned(board)?'★':'☆'}</button></div>`;}
  function sidebar(){return `<aside class="c3-sidebar"><section class="c3-member panel"><div class="c3-avatar">${state.user?esc(state.user.name.slice(0,1)):'⌂'}</div><strong>${state.user?esc(state.user.name)+'님의 동네':'내 동네가 더 가까워지는 곳'}</strong><p>${state.user?.region?`${esc(state.user.region)} 이웃 · ${esc(state.user.age||'연령 미선택')}`:'지역을 고르면, 이웃의 이야기가 먼저 보여요.'}</p><button class="btn soft small full" data-c3="settings">${state.user?'내 지역·관심 지역 설정':'내 지역 설정하고 시작'}</button></section><nav class="c3-nav" aria-label="커뮤니티 메뉴">${[['home','⌂','게시판 홈'],['hot','♨','HOT 게시판'],['best','♕','BEST 게시판'],['peers','☻','또래 이야기'],['saved','☆','스크랩한 글']].map(([id,i,t])=>`<button data-c3="view" data-value="${id}" class="${ui.view===id?'active':''}"><span>${i}</span>${t}${id==='hot'?'<i class="c3-live"></i>':''}</button>`).join('')}</nav><div class="c3-pin-head"><h3>즐겨찾는 게시판</h3><span>★</span></div><div class="c3-pinned">${pins().map((p,i)=>`<button data-c3="open-pin" data-id="${i}"><span class="c3-pin-dot">${p.scope==='지역'?'⌖':'◎'}</span><span><small>${p.scope==='지역'?p.region:'전국 연합'}</small>${p.board}</span><span>›</span></button>`).join('')||'<p>게시판 옆 ☆을 눌러 추가해요.</p>'}</div><button class="c3-rules" data-v2="rules">함께 쓰는 공간의 약속 ↗</button></aside>`;}
  function overview() {
    const hot=scopePosts().filter(isHot).sort(scoreSort).slice(0,5), best=scopePosts().filter(p=>p.likes>=100).sort(scoreSort).slice(0,3);
    const groups=ui.scope==='지역'?[
      ['우리 동네 게시판','함께 살면서 나누고 싶은 이야기',localBoards.slice(0,6)],['일상을 더 가깝게','나눔부터 취향과 관계까지',localBoards.slice(6)]
    ]:[['함께 알아가는 생활','집, 금융, 커리어에 대한 경험',unionBoards.slice(0,6)],['취향이 만나는 곳','지역이 달라도 통하는 이야기',unionBoards.slice(6)]];
    return `<section class="c3-welcome"><div><span class="eyebrow">${ui.scope==='지역'?'HELLO, NEIGHBORS':'BEYOND OUR NEIGHBORHOOD'}</span><h2>${ui.scope==='지역'?`${ui.region}에서 함께 사는 이야기.`:'사는 곳은 달라도, 통하는 이야기.'}</h2><p>${ui.scope==='지역'?'집을 구하는 순간부터, 이 동네가 익숙해질 때까지.':'집과 돈, 취향과 일상. 전국의 이웃과 경험을 나눠요.'}</p></div><div class="c3-houses" aria-hidden="true"><span>⌂</span><span>⌂</span><span>⌂</span></div></section><section class="c3-section"><div class="c3-section-heading"><h2><span class="c3-fire">♨</span> 지금, HOT한 이야기</h2><button data-c3="view" data-value="hot">전체 보기 ↗</button></div><div class="c3-hot-track" aria-label="인기 게시글">${hot.map(p=>`<a class="c3-hot-card" href="#post/${p.id}"><div class="c3-post-tags"><span>${esc(p.board)}</span><small>${ui.scope==='지역'?ui.region:'전국'}</small></div><h3>${esc(p.title)}</h3><p>${esc(p.body.split('\n')[0])}</p><div class="c3-card-bottom">${art(p.art||'room',true)}<div class="c3-meta">${metric(p)}</div></div></a>`).join('')||'<p class="c3-empty-small">아직 HOT 기준을 채운 글이 없어요.</p>'}</div><div class="c3-track-footer"><small>최근 7일 · 공감 10개 이상</small><div><button data-c3="slide" data-value="-1" aria-label="이전 인기글">←</button><button data-c3="slide" data-value="1" aria-label="다음 인기글">→</button></div></div></section>${groups.map(([title,description,boards])=>`<section class="c3-section"><div class="c3-section-heading"><div><h2>${title}</h2><p>${description}</p></div><span class="c3-muted">☆ 자주 보는 게시판을 담아요</span></div><div class="c3-board-grid">${boards.map(boardTile).join('')}</div></section>`).join('')}<button class="c3-peer-banner" data-c3="view" data-value="peers"><span class="c3-peer-icon">☻</span><span><strong>비슷한 시기, 비슷한 고민</strong><small>20대 · 30대 · 40대 · 50대 이상, 또래와 나눠요</small></span><span>또래 이야기 →</span></button><section class="c3-section"><div class="c3-section-heading"><h2><span class="c3-crown">♕</span> 다시 읽고 싶은 BEST</h2><button data-c3="view" data-value="best">기간별로 보기 ↗</button></div><div class="c3-list">${best.map((p,i)=>row(p,i+1)).join('')}</div></section>`;
  }
  function withinPeriod(p) {
    const date=new Date(), y=date.getFullYear(), m=date.getMonth(); let start,end;
    if(ui.period==='this-month'){start=new Date(y,m,1);end=new Date(y,m+1,1);}
    else if(ui.period==='last-month'){start=new Date(y,m-1,1);end=new Date(y,m,1);}
    else {const half=m<6?0:6;start=new Date(y,half+(ui.period==='last-half'?-6:0),1);end=new Date(start.getFullYear(),start.getMonth()+6,1);}
    return p.createdAt>=start.getTime()&&p.createdAt<end.getTime();
  }
  function listing(){
    const hot=ui.view==='hot',best=ui.view==='best',peers=ui.view==='peers',scraps=ui.view==='saved';
    let list=peers?posts.filter(p=>p.board==='또래 이야기'&&p.age===ui.age):scraps?posts.filter(p=>savedPost(p.id)):scopePosts();
    if(hot)list=list.filter(isHot);else if(best)list=list.filter(p=>p.likes>=100&&withinPeriod(p));else if(!peers&&!scraps)list=list.filter(p=>p.board===ui.board);
    list=list.filter(p=>(p.title+' '+p.body).toLowerCase().includes(ui.search.toLowerCase()));
    list.sort(hot||best||ui.sort==='공감순'?scoreSort:(a,b)=>b.createdAt-a.createdAt);
    const title=hot?'HOT 게시판':best?'BEST 게시판':peers?'또래 이야기':scraps?'스크랩한 글':ui.board;
    const description=hot?'최근 7일 동안 공감 10개 이상을 받은 이야기':best?'공감 100개 이상, 오래 기억하고 싶은 이야기':peers?'지역을 넘어, 비슷한 시기의 고민을 함께 나눠요.':scraps?'다시 읽고 싶은 이야기를 한곳에 모았어요.':`${ui.scope==='지역'?ui.region+' 이웃':'전국의 이웃'}과 나누는 ${ui.board} 이야기`;
    return `<div class="c3-list-heading"><div><button class="c3-back" data-c3="view" data-value="home">← 게시판 홈</button><h2>${title}${!hot&&!best&&!peers&&!scraps?`<button class="c3-pin ${pinned(ui.board)?'active':''}" data-c3="pin" data-value="${ui.board}" aria-label="${ui.board} 즐겨찾기 ${pinned(ui.board)?'해제':'추가'}">${pinned(ui.board)?'★':'☆'}</button>`:''}</h2><p>${description}</p></div>${!scraps?'<button class="btn small" data-c3="write">＋ 글쓰기</button>':''}</div>${peers?`<div class="c3-age-tabs" aria-label="또래 게시판">${ages.map(a=>`<button class="${a===ui.age?'active':''}" aria-pressed="${a===ui.age}" data-c3="age" data-value="${a}">${a}</button>`).join('')}</div>`:''}${best?`<div class="c3-periods" aria-label="BEST 기간">${[['this-month','이번 달'],['last-month','지난달'],['this-half','이번 반기'],['last-half','지난 반기']].map(([v,t])=>`<button class="${v===ui.period?'active':''}" data-c3="period" data-value="${v}" aria-pressed="${v===ui.period}">${t}</button>`).join('')}</div>`:''}${hot||best?`<div class="c3-ranking-note"><strong>선정 기준</strong><span>${ui.scope==='지역'?ui.region+' 지역':'전국 연합'} 게시판 · ${hot?'최근 7일 · 공감 10개 이상':'선택한 기간 · 공감 100개 이상'}<br>공감 많은 순 → 댓글 많은 순 → 최신순으로 정렬해요.</span></div>`:''}<form id="c3-search" class="c3-search"><input aria-label="게시글 검색" placeholder="${esc(title)}에서 검색" value="${esc(ui.search)}"><button class="btn secondary small">검색</button></form><div class="c3-results"><span>이야기 <b>${list.length}</b>개${ui.search?` · “${esc(ui.search)}” <button data-c3="clear">검색 지우기 ×</button>`:''}</span>${!hot&&!best?`<select aria-label="게시글 정렬" data-c3-filter="sort">${opts(['최신순','공감순'],ui.sort)}</select>`:'<span>공감순</span>'}</div><div class="c3-list">${list.length?list.slice(0,ui.limit).map((p,i)=>row(p,best?i+1:0)).join(''):`<div class="empty"><h3>${scraps?'아직 스크랩한 글이 없어요':'아직 이곳의 이야기가 없어요'}</h3><p>${scraps?'게시글에서 ☆ 스크랩을 눌러 보세요.':ui.search?'검색어를 바꿔 보거나 검색을 지워 주세요.':'첫 이야기를 남겨도 좋아요.'}</p></div>`}</div>${list.length>ui.limit?'<button class="btn secondary full c3-more" data-c3="more">이야기 더 보기 ↓</button>':''}`;
  }
  community = function(){return `<div class="wrap page c3-community"><div class="c3-page-title"><div><div class="eyebrow">OUR LITTLE NEIGHBORHOOD</div><h1>우리 동네부터, 모두의 이야기까지.</h1><p>살아가는 곳의 이야기, 함께 나누는 취향.</p></div><button class="btn small" data-c3="write">＋ 이야기 쓰기</button></div><div class="c3-scope-bar"><div class="c3-scopes" aria-label="커뮤니티 범위">${[['지역','내 지역'],['연합','전국 연합']].map(([v,t])=>`<button data-c3="scope" data-value="${v}" aria-pressed="${ui.scope===v}" class="${ui.scope===v?'active':''}">${v==='지역'?'⌖':'◎'} ${t}</button>`).join('')}</div><div class="c3-region-control">${ui.view==='peers'?'<span>또래 이야기는 전국에서 함께해요</span>':ui.scope==='지역'?`<label>둘러볼 지역 <select aria-label="둘러볼 지역" data-c3-filter="region">${opts(regionsV2,ui.region)}</select></label>${state.user?.region===ui.region?'<span class="c3-region-tag">내 지역</span>':state.user?.interestRegion===ui.region?'<span class="c3-region-tag">관심 지역</span>':''}`:'<span>지역에 관계없이, 누구나 함께</span>'}<button data-c3="settings" aria-label="내 지역과 관심 지역 설정">설정 ↗</button></div></div><div class="c3-layout">${sidebar()}<div class="c3-main">${ui.view==='home'?overview():listing()}<p class="demo-note c3-disclaimer">모든 게시글·공감 수는 목업 예시입니다. 글·댓글·즐겨찾기는 이 브라우저에만 저장돼요.</p></div></div><button class="c3-mobile-write" data-c3="write">＋ 글쓰기</button></div>`;};
  post = function(id){const p=posts.find(p=>p.id===Number(id));if(!p)return emptyPage('게시글을 찾을 수 없어요','목록에서 다시 선택해 주세요.','community','목록으로');return `<div class="wrap page c3-detail"><button class="c3-back" data-c3="back-post" data-id="${p.id}">← ${context(p)} 게시판</button><article class="panel post-detail"><div class="c3-post-tags"><span>${context(p)}</span>${p.example?'<small>예시 게시글</small>':''}</div><h1>${esc(p.title)}</h1><div class="c3-meta"><span>${esc(p.author)}</span><span>${time(p)}</span><span>댓글 ${p.comments.length}</span></div><p class="post-content">${esc(p.body)}</p>${p.art?`<div class="c3-detail-art">${art(p.art)}<small>게시글 이미지 예시</small></div>`:''}<div class="c3-post-actions"><button class="btn soft small" data-c3="like" data-id="${p.id}" aria-pressed="${liked(p.id)}">${liked(p.id)?'♥ 공감 취소':'♡ 공감'} ${p.likes}</button><button class="btn secondary small" data-c3="scrap" data-id="${p.id}" aria-pressed="${savedPost(p.id)}">${savedPost(p.id)?'★ 스크랩됨':'☆ 스크랩'}</button><button class="c3-report" data-action="report-post" data-id="${p.id}">신고</button></div><div class="comments"><h3>댓글 ${p.comments.length}</h3>${p.comments.map(c=>`<div class="comment"><strong>${esc(c.author)}</strong><p>${esc(c.body)}</p></div>`).join('')||'<p class="c3-muted">첫 댓글을 남겨 보세요.</p>'}<form class="reply-form" id="c3-comment" data-id="${p.id}"><input aria-label="댓글" placeholder="따뜻한 경험과 이야기를 남겨 주세요" required maxlength="1000"><button class="btn" type="submit">등록</button></form></div><p class="demo-note">작성·공감·스크랩은 현재 브라우저에서만 동작합니다.</p></article></div>`;};
  function memberFields(){return `<div class="form-row"><div class="field"><label for="c3-region">내 지역</label><select id="c3-region">${opts(regionsV2,state.user?.region||state.diagnosis?.region||ui.region)}</select></div><div class="field"><label for="c3-age">연령대</label><select id="c3-age">${opts(ages,safeAge(state.user?.age||state.diagnosis?.age||'20대'))}</select></div></div><div class="field"><label for="c3-interest">관심 지역 <span class="c3-muted">선택</span></label><select id="c3-interest">${opts(['선택 안 함',...regionsV2],state.user?.interestRegion||'선택 안 함')}</select><small>이사 가고 싶거나 소식이 궁금한 지역을 골라요.</small></div>`;}
  login = function(signup=false,callback=null){afterLogin=callback;modal(`<div class="eyebrow">MEET YOUR NEIGHBORHOOD</div><h2>${signup?'내 동네에서 시작해요':'이웃과 다시 만나요'}</h2><p>닉네임과 지역을 고르면 내 동네 게시판이 먼저 열려요.</p><form id="c3-login"><div class="field"><label for="c3-nickname">체험용 닉네임</label><input id="c3-nickname" maxlength="12" required value="새싹"></div>${memberFields()}<button class="btn full">${signup?'내 지역으로 시작하기':'데모 로그인'} →</button></form><p class="demo-note">실제 가입·거주지 인증 없이, 이 브라우저에만 저장되는 목업입니다.</p>`);};
  function settings(){if(!state.user){login(true);return;}modal(`<div class="eyebrow">MY NEIGHBORHOOD</div><h2>내 지역과 관심 지역</h2><p>내 지역이 커뮤니티의 기본 화면이 됩니다.</p><form id="c3-settings">${memberFields()}<button class="btn full">설정 저장</button></form><p class="demo-note">선택한 지역·연령은 자율 입력이며 인증 정보가 아닙니다.</p>`);}
  const oldProfile = profile;
  profile = function(){const html=oldProfile();return state.user?html.replace('<div class="kv"><span>진단 상태',`<div class="kv"><span>내 지역 · 관심 지역</span><strong>${esc(state.user.region||'미설정')} · ${esc(state.user.interestRegion||'없음')}</strong></div><button class="btn soft small" data-c3="settings">지역·연령 설정</button><div class="kv"><span>진단 상태`):html;};
  function write(){requireLogin(()=>{const peer=ui.view==='peers';modal(`<div class="eyebrow">SHARE YOUR STORY</div><h2>이야기를 들려주세요</h2><form id="c3-write"><div class="form-row"><div class="field"><label for="c3-write-scope">공간</label><select id="c3-write-scope">${opts(['지역','연합','또래'],peer?'또래':ui.scope)}</select></div><div class="field" id="c3-write-region-field"><label for="c3-write-region">지역</label><select id="c3-write-region">${opts(regionsV2,ui.region)}</select></div></div><div class="field"><label for="c3-write-board" id="c3-write-board-label">게시판</label><select id="c3-write-board"></select></div><div class="field"><label for="c3-write-title">제목</label><input id="c3-write-title" placeholder="어떤 이야기를 나누고 싶나요?" maxlength="80" required></div><div class="field"><label for="c3-write-body">내용</label><textarea id="c3-write-body" rows="5" maxlength="5000" placeholder="서로의 경험을 존중하며 이야기해요." required></textarea></div><button class="btn full">체험 글 등록</button><p class="demo-note">이 브라우저에만 저장돼요. 실제 개인정보는 적지 마세요.</p></form>`);updateWrite();});}
  function updateWrite(){const scope=$('#c3-write-scope').value,peer=scope==='또래';$('#c3-write-region-field').hidden=scope!=='지역';$('#c3-write-board-label').textContent=peer?'또래 게시판':'게시판';$('#c3-write-board').innerHTML=opts(peer?ages:scope==='지역'?localBoards:unionBoards,peer?ui.age:ui.board);}
  const oldGuide = guide;
  guide = function(){oldGuide();document.querySelectorAll('.flow-card small').forEach(el=>{if(el.textContent.includes('지역·연합'))el.textContent='내 지역·연합, HOT·BEST와 또래 이야기';});};
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-c3]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();const value=b.dataset.value,id=Number(b.dataset.id);
    switch(b.dataset.c3){
      case'scope':ui.scope=value;ui.region=state.user?.region||ui.region;navigate('home');break;
      case'view':navigate(value);break;
      case'board':navigate('board',value);break;
      case'age':ui.age=value;ui.search='';ui.limit=12;render();break;
      case'period':ui.period=value;ui.limit=12;render();break;
      case'clear':ui.search='';render();break;
      case'more':ui.limit+=12;render();break;
      case'settings':settings();break;
      case'write':write();break;
      case'slide':{const track=$('.c3-hot-track');track.scrollBy({left:Number(value)*track.clientWidth,behavior:'smooth'});break;}
      case'pin':{const list=pins(),active=pinned(value);save('board-pins-v3',active?list.filter(p=>key(p.scope,p.region,p.board)!==boardKey(value)):[...list,{scope:ui.scope,region:ui.scope==='지역'?ui.region:null,board:value}]);render();toast(active?'즐겨찾기를 해제했어요.':'즐겨찾는 게시판에 담았어요.');break;}
      case'open-pin':{const p=pins()[id];if(p){ui.scope=p.scope;if(p.region)ui.region=p.region;navigate('board',p.board);}break;}
      case'back-post':{const p=posts.find(p=>p.id===id);if(p){ui.scope=p.scope;ui.region=p.region||ui.region;ui.age=safeAge(p.age);navigate(p.board==='또래 이야기'?'peers':'board',p.board);}break;}
      case'like':{const p=posts.find(p=>p.id===id);if(!p)return;requireLogin(()=>{const list=read('liked-v3',[]),active=list.includes(id);p.likes=Math.max(0,p.likes+(active?-1:1));save('liked-v3',active?list.filter(v=>v!==id):[...list,id]);persistPosts();render();toast(active?'공감을 취소했어요.':'공감을 보냈어요.');});break;}
      case'scrap':requireLogin(()=>{const list=read('scraps-v3',[]),active=list.includes(id);save('scraps-v3',active?list.filter(v=>v!==id):[...list,id]);render();toast(active?'스크랩을 해제했어요.':'다시 읽을 글로 담았어요.');});break;
    }
  },true);
  document.addEventListener('change',e=>{const el=e.target;if(el.dataset.c3Filter){e.stopImmediatePropagation();ui[el.dataset.c3Filter]=el.value;ui.limit=12;ui.search='';render();}if(el.id==='c3-write-scope'){e.stopImmediatePropagation();updateWrite();}},true);
  document.addEventListener('submit',e=>{
    const f=e.target;if(!f.id.startsWith('c3-'))return;e.preventDefault();e.stopImmediatePropagation();
    if(['c3-login','c3-settings'].includes(f.id)){
      const region=$('#c3-region').value,age=$('#c3-age').value,interest=$('#c3-interest').value;
      const name=f.id==='c3-login'?$('#c3-nickname').value.trim():state.user.name;if(!name){toast('닉네임을 입력해 주세요.');return;}
      state.user={...state.user,name,region,age,interestRegion:interest==='선택 안 함'?null:interest};save('user',state.user);ui.region=region;ui.age=age;ui.scope='지역';
      closeModal();const cb=f.id==='c3-login'?afterLogin:null;afterLogin=null;if(cb){cb();}else navigate('home');toast(region+' 이웃으로 시작해요.');return;
    }
    if(f.id==='c3-search'){ui.search=f.querySelector('input').value.trim();ui.limit=12;render();return;}
    if(f.id==='c3-write'){
      const title=$('#c3-write-title').value.trim(),body=$('#c3-write-body').value.trim();if(!title||!body){toast('제목과 내용을 입력해 주세요.');return;}
      const selection=$('#c3-write-scope').value,scope=selection==='지역'?'지역':'연합',peer=selection==='또래',board=peer?'또래 이야기':$('#c3-write-board').value,region=scope==='지역'?$('#c3-write-region').value:null;
      const p={id:Date.now(),scope,region,board,age:peer?$('#c3-write-board').value:state.user.age,title,body,author:'익명 '+state.user.name,likes:0,comments:[],createdAt:Date.now(),example:false};posts.unshift(p);persistPosts();ui.scope=scope;ui.region=region||ui.region;ui.board=board;ui.view=peer?'peers':'board';ui.age=safeAge(p.age);go('post/'+p.id);toast('이 브라우저에 이야기를 저장했어요.');return;
    }
    if(f.id==='c3-comment'){const body=f.querySelector('input').value.trim(),p=posts.find(p=>p.id===Number(f.dataset.id));if(!p||!body)return;requireLogin(()=>{p.comments.push({author:'익명 '+state.user.name,body});persistPosts();render();toast('댓글을 저장했어요.');});}
  },true);
  render();
})();
