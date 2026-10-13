import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AGES, COMMUNITY_REGIONS, LOCAL_BOARDS, UNION_BOARDS, STORAGE_PREFIX,
  boardKey, createExamplePosts, inBestPeriod, isHot, postContext, rankPosts,
  readCommunityData, relativeTime, scopeMatches,
} from "../community/model";
import "../styles/community.css";

function useCommunityStorage(key, fallback, notify) {
  const [value, setValue] = useState(() => readCommunityData(key, typeof fallback === "function" ? fallback() : fallback));
  useEffect(() => {
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); }
    catch { notify("이 브라우저에 저장하지 못했어요. 이번 화면에서만 유지됩니다."); }
  }, [key, value, notify]);
  return [value, setValue];
}

function Art({ kind = "room", small = false }) {
  return <div className={`c3-art ${small ? "small" : ""} ${kind}`}><svg viewBox="0 0 200 140" aria-hidden="true">
    {kind === "checklist" ? <><rect x="56" y="15" width="88" height="112" rx="10" fill="#fffaf0" /><rect x="78" y="9" width="43" height="16" rx="6" fill="#deae70" /><path d="m72 51 5 5 9-10m-14 33 5 5 9-10m-14 33 5 5 9-10" fill="none" stroke="#416b54" strokeWidth="4" /><path d="M95 51h30M95 79h24M95 107h30" stroke="#c8d2bf" strokeWidth="5" /></>
      : kind === "budget" ? <><rect x="43" y="27" width="120" height="88" rx="13" fill="#d6b381" /><path d="M43 47h120" stroke="#b38b5d" strokeWidth="3" /><rect x="119" y="60" width="50" height="30" rx="8" fill="#fff3d8" /><circle cx="141" cy="75" r="7" fill="#b68c55" /><circle cx="62" cy="103" r="19" fill="#f2cf77" /></>
      : kind === "walk" ? <><path d="M0 101Q60 54 110 92T200 90V140H0Z" fill="#a9c0a1" /><path d="M81 140Q135 110 113 85T140 42" fill="none" stroke="#e7dec3" strokeWidth="18" /><path d="M40 113V53m121 27V24" stroke="#617e5c" strokeWidth="6" /><circle cx="40" cy="44" r="26" fill="#7c9b70" /><circle cx="161" cy="29" r="25" fill="#5f865e" /></>
      : <><rect x="29" y="20" width="70" height="65" rx="6" fill="#fff7e7" /><path d="M64 20v65M29 52h70" stroke="#cbd3bf" strokeWidth="5" /><rect x="65" y="82" width="105" height="32" rx="10" fill="#b7bd95" /><rect x="72" y="69" width="91" height="30" rx="12" fill="#ccd0ad" /><path d="M76 113v12m83-12v12" stroke="#846e52" strokeWidth="6" /><rect x="29" y="107" width="20" height="19" rx="4" fill="#bd916b" /><ellipse cx="33" cy="80" rx="7" ry="15" fill="#779b64" /></>}
  </svg></div>;
}

function Metrics({ post }) {
  return <><span className="c3-empathy">♡ {post.likes}</span><span className="c3-replies">▤ {post.comments.length}</span></>;
}

function PostRow({ post, rank }) {
  return <article className="c3-post-row">
    {rank && <span className="c3-rank">{String(rank).padStart(2, "0")}</span>}
    <Link className="c3-post-link" to={`/community/posts/${post.id}`}>
      <div className="c3-post-copy"><div className="c3-post-tags"><span>{postContext(post)}</span>{post.example && <small>예시</small>}</div>
        <h3>{post.title}</h3><p>{post.body.split("\n")[0]}</p>
        <div className="c3-meta"><Metrics post={post} /><span>{relativeTime(post.createdAt)}</span><span>{post.author}</span></div>
      </div>{post.art && <Art kind={post.art} small />}
    </Link>
  </article>;
}

function CommunityDialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus();
  }, []);
  return <dialog ref={ref} className="c3-dialog" aria-label={title} onCancel={onClose}>
    <button className="c3-dialog-close" onClick={onClose} aria-label="닫기">×</button><h2>{title}</h2>{children}
  </dialog>;
}

function ProfileForm({ profile, onSave }) {
  return <form className="c3-form" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("nickname")).trim();
    if (!name) return;
    onSave({ name, region: data.get("region"), age: data.get("age"), interestRegion: data.get("interest") || null });
  }}>
    <p>지역을 고르면 내 동네 게시판이 먼저 열려요.</p>
    <label>체험용 닉네임<input name="nickname" required maxLength={12} defaultValue={profile?.name || "새싹"} /></label>
    <div className="c3-form-row"><label>내 지역<select name="region" defaultValue={profile?.region || "서울"}>{COMMUNITY_REGIONS.map(r => <option key={r}>{r}</option>)}</select></label>
      <label>연령대<select name="age" defaultValue={profile?.age || "20대"}>{AGES.map(a => <option key={a}>{a}</option>)}</select></label></div>
    <label>관심 지역 · 선택<select name="interest" defaultValue={profile?.interestRegion || ""}><option value="">선택 안 함</option>{COMMUNITY_REGIONS.map(r => <option key={r}>{r}</option>)}</select></label>
    <button className="btn full" type="submit">내 지역으로 시작하기</button>
    <p className="c3-muted">실제 가입·거주지 인증 없이 이 브라우저에만 저장되는 체험 프로필입니다.</p>
  </form>;
}

function WriteForm({ ui, onSave }) {
  const [space, setSpace] = useState(ui.view === "peers" ? "또래" : ui.scope);
  const options = space === "또래" ? AGES : space === "지역" ? LOCAL_BOARDS : UNION_BOARDS;
  return <form className="c3-form" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title")).trim();
    const body = String(data.get("body")).trim();
    if (!title || !body) return;
    onSave({ title, body, scope: space === "지역" ? "지역" : "연합", region: space === "지역" ? data.get("region") : null,
      board: space === "또래" ? "또래 이야기" : data.get("board"), age: space === "또래" ? data.get("board") : ui.age });
  }}>
    <div className="c3-form-row"><label>공간<select value={space} onChange={e => setSpace(e.target.value)}>{["지역", "연합", "또래"].map(s => <option key={s}>{s}</option>)}</select></label>
      {space === "지역" && <label>지역<select name="region" defaultValue={ui.region}>{COMMUNITY_REGIONS.map(r => <option key={r}>{r}</option>)}</select></label>}</div>
    <label>{space === "또래" ? "또래 게시판" : "게시판"}<select key={space} name="board" defaultValue={options.includes(space === "또래" ? ui.age : ui.board) ? (space === "또래" ? ui.age : ui.board) : options[0]}>{options.map(b => <option key={b}>{b}</option>)}</select></label>
    <label>제목<input name="title" maxLength={80} placeholder="어떤 이야기를 나누고 싶나요?" required /></label>
    <label>내용<textarea name="body" rows={5} maxLength={5000} placeholder="서로의 경험을 존중하며 이야기해요." required /></label>
    <button className="btn full" type="submit">체험 글 등록</button><p className="c3-muted">이 브라우저에만 저장돼요. 실제 개인정보는 적지 마세요.</p>
  </form>;
}

const MENU = [["home", "⌂", "게시판 홈"], ["hot", "♨", "HOT 게시판"], ["best", "♕", "BEST 게시판"], ["peers", "☻", "또래 이야기"], ["saved", "☆", "스크랩한 글"]];
const PERIODS = [["this-month", "이번 달"], ["last-month", "지난달"], ["this-half", "이번 반기"], ["last-half", "지난 반기"]];

export default function CommunityPage() {
  const navigate = useNavigate();
  const { postId } = useParams();
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useCommunityStorage("profile", null, setNotice);
  const [posts, setPosts] = useCommunityStorage("posts", createExamplePosts, setNotice);
  const [likes, setLikes] = useCommunityStorage("likes", [], setNotice);
  const [scraps, setScraps] = useCommunityStorage("scraps", [], setNotice);
  const [pins, setPins] = useCommunityStorage("pins", [], setNotice);
  const [seen, setSeen] = useCommunityStorage("seen", {}, setNotice);
  const [ui, setUi] = useState(() => ({ scope: "지역", region: profile?.region || "서울", age: profile?.age || "20대", view: "home", board: "자유", search: "", sort: "최신순", period: "this-month", limit: 12 }));
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(null);
  const pending = useRef(null);
  const hotTrack = useRef(null);

  useEffect(() => { if (!notice) return undefined; const timer = setTimeout(() => setNotice(""), 3000); return () => clearTimeout(timer); }, [notice]);
  const currentPosts = posts.filter(p => scopeMatches(p, ui.scope, ui.region));
  const selectedPost = posts.find(p => String(p.id) === postId);
  const pinKey = board => boardKey({ ...ui, board });
  const isPinned = board => pins.some(p => boardKey(p) === pinKey(board));
  const unread = board => currentPosts.some(p => p.board === board && p.createdAt > (seen[pinKey(board)] || 0) && p.createdAt >= Date.now() - 7 * 86400000);

  function openView(view, board, scope = ui.scope, region = ui.region, age = ui.age) {
    setUi(v => ({ ...v, view, board: board || v.board, scope, region, age, search: "", limit: 12 }));
    setQuery("");
    if (board) setSeen(s => ({ ...s, [boardKey({ scope, region, board })]: Date.now() }));
    navigate("/community");
  }
  function requireProfile(action) {
    if (profile) action(profile);
    else { pending.current = action; setDialog("profile"); }
  }
  function saveProfile(value) {
    setProfile(value);
    setUi(v => ({ ...v, region: value.region, age: value.age }));
    const action = pending.current; pending.current = null; setDialog(null);
    if (action) action(value); else openView("home", null, "지역", value.region, value.age);
    setNotice(`${value.region} 이웃으로 시작해요.`);
  }
  function togglePin(board) {
    const pin = { scope: ui.scope, region: ui.scope === "지역" ? ui.region : null, board };
    setPins(list => isPinned(board) ? list.filter(p => boardKey(p) !== boardKey(pin)) : [...list, pin]);
    setNotice(isPinned(board) ? "즐겨찾기를 해제했어요." : "즐겨찾는 게시판에 담았어요.");
  }
  function toggleLike(post) {
    requireProfile(() => {
      const active = likes.includes(post.id);
      setLikes(list => active ? list.filter(id => id !== post.id) : [...list, post.id]);
      setPosts(list => list.map(p => p.id === post.id ? { ...p, likes: Math.max(0, p.likes + (active ? -1 : 1)) } : p));
    });
  }
  function toggleScrap(post) {
    requireProfile(() => setScraps(list => list.includes(post.id) ? list.filter(id => id !== post.id) : [...list, post.id]));
  }
  function savePost(value) {
    const post = { ...value, id: Date.now(), author: `익명 ${profile.name}`, createdAt: Date.now(), example: false, likes: 0, comments: [] };
    setPosts(list => [post, ...list]);
    setUi(v => ({ ...v, scope: post.scope, region: post.region || v.region, board: post.board, age: post.age, view: post.board === "또래 이야기" ? "peers" : "board" }));
    setDialog(null); navigate(`/community/posts/${post.id}`); setNotice("이 브라우저에 이야기를 저장했어요.");
  }
  function boardTile(board) {
    return <div className="c3-board-tile" key={board}><button className="c3-board-open" onClick={() => openView("board", board)}><span className="c3-tile-icon" aria-hidden="true">{board.includes("금융") ? "₩" : board.includes("집") ? "⌂" : "▤"}</span><span><strong>{board}{unread(board) && <i className="c3-new" aria-label="새 글">N</i>}</strong><small>{currentPosts.filter(p => p.board === board).length}개의 이야기</small></span></button>
      <button className={`c3-pin ${isPinned(board) ? "active" : ""}`} onClick={() => togglePin(board)} aria-label={`${board} 즐겨찾기 ${isPinned(board) ? "해제" : "추가"}`} aria-pressed={isPinned(board)}>{isPinned(board) ? "★" : "☆"}</button></div>;
  }
  function overview() {
    const hot = currentPosts.filter(p => isHot(p)).sort(rankPosts).slice(0, 5);
    const best = currentPosts.filter(p => p.likes >= 100).sort(rankPosts).slice(0, 3);
    const groups = ui.scope === "지역" ? [["우리 동네 게시판", "함께 살면서 나누고 싶은 이야기", LOCAL_BOARDS.slice(0, 6)], ["일상을 더 가깝게", "나눔부터 취향과 관계까지", LOCAL_BOARDS.slice(6)]] : [["함께 알아가는 생활", "집, 금융, 커리어에 대한 경험", UNION_BOARDS.slice(0, 6)], ["취향이 만나는 곳", "지역이 달라도 통하는 이야기", UNION_BOARDS.slice(6)]];
    return <><section className="c3-welcome"><div><span className="eyebrow">{ui.scope === "지역" ? "HELLO, NEIGHBORS" : "BEYOND OUR NEIGHBORHOOD"}</span><h2>{ui.scope === "지역" ? `${ui.region}에서 함께 사는 이야기.` : "사는 곳은 달라도, 통하는 이야기."}</h2><p>{ui.scope === "지역" ? "집을 구하는 순간부터, 이 동네가 익숙해질 때까지." : "집과 돈, 취향과 일상. 전국의 이웃과 경험을 나눠요."}</p></div><div className="c3-houses" aria-hidden="true"><span>⌂</span><span>⌂</span><span>⌂</span></div></section>
      <section className="c3-section"><div className="c3-section-heading"><h2><span className="c3-fire">♨</span> 지금, HOT한 이야기</h2><button onClick={() => openView("hot")}>전체 보기 ↗</button></div>
        <div className="c3-hot-track" ref={hotTrack} aria-label="인기 게시글">{hot.length ? hot.map(post => <Link className="c3-hot-card" key={post.id} to={`/community/posts/${post.id}`}><div className="c3-post-tags"><span>{post.board}</span><small>{post.region || "전국"}</small></div><h3>{post.title}</h3><p>{post.body}</p><div className="c3-card-bottom"><Art kind={post.art || "room"} small /><div className="c3-meta"><Metrics post={post} /></div></div></Link>) : <p className="c3-empty-small">아직 HOT 기준을 채운 글이 없어요.</p>}</div>
        <div className="c3-track-footer"><small>최근 7일 · 공감 10개 이상</small><div>{[-1, 1].map(direction => <button key={direction} aria-label={direction < 0 ? "이전 인기글" : "다음 인기글"} onClick={() => hotTrack.current.scrollBy({ left: direction * hotTrack.current.clientWidth, behavior: "smooth" })}>{direction < 0 ? "←" : "→"}</button>)}</div></div></section>
      {groups.map(([title, description, boards]) => <section className="c3-section" key={title}><div className="c3-section-heading"><div><h2>{title}</h2><p>{description}</p></div><span className="c3-muted">☆ 자주 보는 게시판을 담아요</span></div><div className="c3-board-grid">{boards.map(boardTile)}</div></section>)}
      <button className="c3-peer-banner" onClick={() => openView("peers")}><span className="c3-peer-icon">☻</span><span><strong>비슷한 시기, 비슷한 고민</strong><small>20대 · 30대 · 40대 · 50대 이상, 또래와 나눠요</small></span><span>또래 이야기 →</span></button>
      <section className="c3-section"><div className="c3-section-heading"><h2><span className="c3-crown">♕</span> 다시 읽고 싶은 BEST</h2><button onClick={() => openView("best")}>기간별로 보기 ↗</button></div><div className="c3-list">{best.map((p, i) => <PostRow key={p.id} post={p} rank={i + 1} />)}</div></section></>;
  }
  function listing() {
    const hot = ui.view === "hot", best = ui.view === "best", peers = ui.view === "peers", saved = ui.view === "saved";
    let list = peers ? posts.filter(p => p.board === "또래 이야기" && p.age === ui.age) : saved ? posts.filter(p => scraps.includes(p.id)) : currentPosts;
    if (hot) list = list.filter(p => isHot(p));
    else if (best) list = list.filter(p => p.likes >= 100 && inBestPeriod(p, ui.period));
    else if (!peers && !saved) list = list.filter(p => p.board === ui.board);
    list = list.filter(p => `${p.title} ${p.body}`.toLowerCase().includes(ui.search.toLowerCase()));
    list.sort(hot || best || ui.sort === "공감순" ? rankPosts : (a, b) => b.createdAt - a.createdAt);
    const title = hot ? "HOT 게시판" : best ? "BEST 게시판" : peers ? "또래 이야기" : saved ? "스크랩한 글" : ui.board;
    return <><div className="c3-list-heading"><div><button className="c3-back" onClick={() => openView("home")}>← 게시판 홈</button><h2>{title}{ui.view === "board" && <button className={`c3-pin ${isPinned(ui.board) ? "active" : ""}`} onClick={() => togglePin(ui.board)} aria-label={`${ui.board} 즐겨찾기 ${isPinned(ui.board) ? "해제" : "추가"}`}>{isPinned(ui.board) ? "★" : "☆"}</button>}</h2><p>{peers ? "지역을 넘어, 비슷한 시기의 고민을 함께 나눠요." : saved ? "다시 읽고 싶은 이야기를 한곳에 모았어요." : `${ui.scope === "지역" ? ui.region : "전국"} 이웃과 나누는 이야기`}</p></div>{!saved && <button className="btn small" onClick={() => requireProfile(() => setDialog("write"))}>＋ 글쓰기</button>}</div>
      {peers && <div className="c3-age-tabs" aria-label="또래 게시판">{AGES.map(age => <button key={age} className={ui.age === age ? "active" : ""} aria-pressed={ui.age === age} onClick={() => { setUi(v => ({ ...v, age, search: "", limit: 12 })); setQuery(""); }}>{age}</button>)}</div>}
      {best && <div className="c3-periods" aria-label="BEST 기간">{PERIODS.map(([value, label]) => <button key={value} className={ui.period === value ? "active" : ""} aria-pressed={ui.period === value} onClick={() => setUi(v => ({ ...v, period: value, limit: 12 }))}>{label}</button>)}</div>}
      {(hot || best) && <div className="c3-ranking-note"><strong>선정 기준</strong><span>{ui.scope === "지역" ? `${ui.region} 지역` : "전국 연합"} 게시판 · {hot ? "최근 7일 · 공감 10개 이상" : "선택한 기간 · 공감 100개 이상"}<br />공감 많은 순 → 댓글 많은 순 → 최신순으로 정렬해요.</span></div>}
      <form className="c3-search" onSubmit={e => { e.preventDefault(); setUi(v => ({ ...v, search: query.trim(), limit: 12 })); }}><input aria-label="게시글 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder={`${title}에서 검색`} /><button className="btn secondary small">검색</button></form>
      <div className="c3-results"><span>이야기 <b>{list.length}</b>개{ui.search && <> · “{ui.search}” <button onClick={() => { setQuery(""); setUi(v => ({ ...v, search: "" })); }}>검색 지우기 ×</button></>}</span>{!hot && !best ? <select aria-label="게시글 정렬" value={ui.sort} onChange={e => setUi(v => ({ ...v, sort: e.target.value }))}><option>최신순</option><option>공감순</option></select> : <span>공감순</span>}</div>
      <div className="c3-list">{list.length ? list.slice(0, ui.limit).map((p, i) => <PostRow key={p.id} post={p} rank={best ? i + 1 : null} />) : <div className="empty"><h3>{saved ? "아직 스크랩한 글이 없어요" : "아직 이곳의 이야기가 없어요"}</h3><p>{saved ? "게시글에서 ☆ 스크랩을 눌러 보세요." : ui.search ? "검색어를 바꿔 보세요." : "첫 이야기를 남겨도 좋아요."}</p></div>}</div>
      {list.length > ui.limit && <button className="btn secondary full c3-more" onClick={() => setUi(v => ({ ...v, limit: v.limit + 12 }))}>이야기 더 보기 ↓</button>}</>;
  }
  function detail(post) {
    return <div className="c3-detail"><button className="c3-back" onClick={() => openView(post.board === "또래 이야기" ? "peers" : "board", post.board, post.scope, post.region || ui.region, post.age)}>← {postContext(post)} 게시판</button><article className="panel post-detail"><div className="c3-post-tags"><span>{postContext(post)}</span>{post.example && <small>예시 게시글</small>}</div><h1>{post.title}</h1><div className="c3-meta"><span>{post.author}</span><span>{relativeTime(post.createdAt)}</span><span>댓글 {post.comments.length}</span></div><p className="post-content">{post.body}</p>{post.art && <div className="c3-detail-art"><Art kind={post.art} /><small>게시글 이미지 예시</small></div>}
      <div className="c3-post-actions"><button className="btn soft small" aria-pressed={likes.includes(post.id)} onClick={() => toggleLike(post)}>{likes.includes(post.id) ? "♥ 공감 취소" : "♡ 공감"} {post.likes}</button><button className="btn secondary small" aria-pressed={scraps.includes(post.id)} onClick={() => toggleScrap(post)}>{scraps.includes(post.id) ? "★ 스크랩됨" : "☆ 스크랩"}</button><button className="c3-report" onClick={() => setDialog("report")}>신고</button></div>
      <div className="comments"><h3>댓글 {post.comments.length}</h3>{post.comments.map((comment, index) => <div className="comment" key={index}><strong>{comment.author}</strong><p>{comment.body}</p></div>)}<form className="reply-form" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const body = String(new FormData(form).get("comment")).trim(); if (!body) return; requireProfile(member => { setPosts(list => list.map(p => p.id === post.id ? { ...p, comments: [...p.comments, { author: `익명 ${member.name}`, body }] } : p)); form.reset(); }); }}><input aria-label="댓글" name="comment" maxLength={1000} required placeholder="따뜻한 경험과 이야기를 남겨 주세요" /><button className="btn">등록</button></form></div></article></div>;
  }
  return <div className="community-page">
    <div className="c3-page-title"><div><div className="eyebrow">OUR LITTLE NEIGHBORHOOD</div><h1>우리 동네부터, 모두의 이야기까지.</h1><p>살아가는 곳의 이야기, 함께 나누는 취향.</p></div><button className="btn small" onClick={() => requireProfile(() => setDialog("write"))}>＋ 이야기 쓰기</button></div>
    {!postId ? <><div className="c3-scope-bar"><div className="c3-scopes" aria-label="커뮤니티 범위">{[["지역", "내 지역"], ["연합", "전국 연합"]].map(([scope, label]) => <button key={scope} aria-pressed={ui.scope === scope} className={ui.scope === scope ? "active" : ""} onClick={() => openView("home", null, scope, profile?.region || ui.region)}>{scope === "지역" ? "⌖" : "◎"} {label}</button>)}</div><div className="c3-region-control">{ui.view === "peers" ? <span>또래 이야기는 전국에서 함께해요</span> : ui.scope === "지역" ? <><label>둘러볼 지역<select aria-label="둘러볼 지역" value={ui.region} onChange={e => setUi(v => ({ ...v, region: e.target.value, search: "", limit: 12 }))}>{COMMUNITY_REGIONS.map(r => <option key={r}>{r}</option>)}</select></label>{ui.region === profile?.region && <span className="c3-region-tag">내 지역</span>}{ui.region === profile?.interestRegion && <span className="c3-region-tag">관심 지역</span>}</> : <span>지역에 관계없이, 누구나 함께</span>}<button aria-label="내 지역과 관심 지역 설정" onClick={() => setDialog("profile")}>설정 ↗</button></div></div>
      <div className="c3-layout"><aside className="c3-sidebar"><section className="c3-member panel"><div className="c3-avatar">{profile ? profile.name.slice(0, 1) : "⌂"}</div><strong>{profile ? `${profile.name}님의 동네` : "내 동네가 더 가까워지는 곳"}</strong><p>{profile ? `${profile.region} 이웃 · ${profile.age}` : "지역을 고르면 이웃의 이야기가 먼저 보여요."}</p><button className="btn soft small full" onClick={() => setDialog("profile")}>내 지역·관심 지역 설정</button></section><nav className="c3-nav" aria-label="커뮤니티 메뉴">{MENU.map(([view, symbol, title]) => <button key={view} className={ui.view === view ? "active" : ""} onClick={() => openView(view)}><span>{symbol}</span>{title}{view === "hot" && <i className="c3-live" />}</button>)}</nav><div className="c3-pin-head"><h3>즐겨찾는 게시판</h3><span>★</span></div><div className="c3-pinned">{pins.length ? pins.map(pin => <button key={boardKey(pin)} onClick={() => openView("board", pin.board, pin.scope, pin.region || ui.region)}><span className="c3-pin-dot">{pin.scope === "지역" ? "⌖" : "◎"}</span><span><small>{pin.region || "전국 연합"}</small>{pin.board}</span><span>›</span></button>) : <p>게시판 옆 ☆을 눌러 추가해요.</p>}</div><button className="c3-rules" onClick={() => setDialog("rules")}>함께 쓰는 공간의 약속 ↗</button></aside><div className="c3-main">{ui.view === "home" ? overview() : listing()}</div></div></> : selectedPost ? detail(selectedPost) : <div className="empty"><h2>게시글을 찾을 수 없어요</h2><p>이 브라우저에 저장된 글이 아닐 수 있어요.</p><Link to="/community">게시판 홈으로</Link></div>}
    <p className="demo-note c3-disclaimer">모든 게시글·공감 수는 목업 예시입니다. 프로필·글·댓글·즐겨찾기는 이 브라우저에만 저장되며 다른 방문자와 공유되지 않습니다.</p>
    {dialog && <CommunityDialog title={{ profile: "내 지역에서 시작해요", write: "이야기를 들려주세요", rules: "함께 쓰는 공간의 약속", report: "게시글 신고" }[dialog]} onClose={() => { pending.current = null; setDialog(null); }}>
      {dialog === "profile" && <ProfileForm profile={profile} onSave={saveProfile} />}{dialog === "write" && <WriteForm ui={ui} onSave={savePost} />}
      {dialog === "rules" && <><p>이웃과 서로 존중하며 이야기해 주세요.</p><ul><li>타인의 실명·동호수·연락처·사진을 공개하지 않아요.</li><li>혐오·괴롭힘·불법 광고·금융 사기를 신고해 주세요.</li><li>지역과 연령은 자율 선택이며 인증을 의미하지 않습니다.</li></ul></>}
      {dialog === "report" && <form className="c3-form" onSubmit={e => { e.preventDefault(); setDialog(null); setNotice("신고 접수 화면을 체험했어요. 실제 전송은 없습니다."); }}><p>신고 화면을 체험합니다. 운영자에게 전달되지 않습니다.</p><label>신고 사유<select><option>개인정보 노출</option><option>비방·혐오 표현</option><option>금융 사기·불법 광고</option><option>기타</option></select></label><button className="btn">신고 접수 체험</button></form>}
    </CommunityDialog>}
    <div className={`c3-toast ${notice ? "show" : ""}`} role="status" aria-live="polite">{notice}</div>
  </div>;
}
