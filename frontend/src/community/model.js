import { REGIONS } from "../constants/regions";

export const COMMUNITY_REGIONS = REGIONS.map(region => region.name);
export const AGES = ["20대", "30대", "40대", "50대 이상"];
export const LOCAL_BOARDS = ["자유", "청약·집 구하기", "금융", "입주 새내기", "동네 생활정보", "자취생", "장터", "친구 만들기", "비밀의 화원"];
export const UNION_BOARDS = ["자유", "청약·집 구하기", "금융", "생활정보·꿀팁", "재테크", "취업·커리어", "음식·맛집", "만화·애니", "연극·뮤지컬", "음악", "스포츠", "게임", "홍보·동아리"];
export const STORAGE_PREFIX = "cheongyak-community-v1-";

export function readCommunityData(key, fallback) {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key)) ?? fallback; }
  catch { return fallback; }
}
export const boardKey = ({ scope, region, board }) => `${scope}|${scope === "지역" ? region : "전국"}|${board}`;
export const scopeMatches = (post, scope, region) => post.scope === scope && (scope !== "지역" || post.region === region);
export const isHot = (post, now = Date.now()) => post.likes >= 10 && post.createdAt <= now && post.createdAt >= now - 7 * 86400000;
export const rankPosts = (a, b) => b.likes - a.likes || b.comments.length - a.comments.length || b.createdAt - a.createdAt;
export const postContext = post => post.board === "또래 이야기" ? `전국 · ${post.age} 또래` : `${post.scope === "지역" ? post.region : "연합"} · ${post.board}`;

export function inBestPeriod(post, period, now = new Date()) {
  const year = now.getFullYear(), month = now.getMonth();
  let start, end;
  if (period === "this-month" || period === "last-month") {
    const offset = period === "last-month" ? -1 : 0;
    start = new Date(year, month + offset, 1); end = new Date(year, month + offset + 1, 1);
  } else {
    start = new Date(year, (month < 6 ? 0 : 6) + (period === "last-half" ? -6 : 0), 1);
    end = new Date(start.getFullYear(), start.getMonth() + 6, 1);
  }
  return post.createdAt >= start.getTime() && post.createdAt < end.getTime();
}
export function relativeTime(timestamp) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60000) return "방금";
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}분 전`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)}시간 전`;
  return new Date(timestamp).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

// Synthetic content only; no visitor data is imported from the hosted mockup.
export function createExamplePosts(now = Date.now()) {
  const samples = [
    ["청약·집 구하기", "공고문, 이 다섯 군데부터 읽으니까 훨씬 쉽네요", "공급 대상 → 신청 일정 → 자격 기준 → 제출 서류 → 공식 접수처 순서로 메모했어요. 처음 준비하는 분들께 제 정리 방법을 공유합니다.", 128, "checklist"],
    ["동네 생활정보", "퇴근길에 발견한, 조용히 걷기 좋은 산책 코스", "이어폰 잠깐 빼고 걸었는데 생각이 정리되더라고요. 여러분 동네에도 좋아하는 산책길이 있나요?", 36, "walk"],
    ["금융", "보증금만 모으면 끝인 줄 알았던 이사 예산", "이사비, 중개보수, 가전 설치비까지 적으니 계획이 달라졌어요. 비용 항목을 먼저 적는 게 도움이 됐습니다.", 104, "budget"],
    ["입주 새내기", "처음 독립한 날, 가장 먼저 산 물건이 뭐였어요?", "큰 가구보다 작은 생활용품이 먼저 필요하더라고요. 첫 자취 준비 목록을 같이 만들어 봐요.", 23, "room"],
    ["자유", "집 크기와 출퇴근 30분, 하나만 고른다면?", "매일 오가는 시간과 주말에 보내는 공간 사이에서 고민이에요. 직접 살아본 경험이 궁금합니다.", 9, null],
    ["자취생", "일요일에 세 끼만 미리 준비해도 한 주가 편해요", "재료를 겹쳐서 쓰니 음식물도 덜 남네요. 냉장고가 작은 집의 식재료 관리 팁을 나눠요.", 16, "room"],
    ["장터", "이사하며 정리하는 책상, 나눔해요", "동네에서 개인 물품을 나누는 화면을 체험하는 예시입니다.", 12, "room"],
    ["친구 만들기", "주말 낮에 가볍게 산책할 이웃 있나요?", "같은 동네에서 취향이 맞는 이웃의 이야기가 궁금해요.", 11, "walk"],
    ["비밀의 화원", "이상형은 취향이 비슷한 사람인가요?", "설렘과 관계에 대한 고민을 편하게 나누는 예시 이야기입니다.", 7, null],
  ];
  const posts = []; let id = 100;
  const make = (scope, region, board, title, body, likes, art, age, createdAt) => ({
    id: id++, scope, region, board, title, body, likes, art, age, createdAt, author: "익명 이웃", example: true,
    comments: likes >= 100 ? [{ author: "익명 새싹", body: "저도 준비 중인데 이런 경험 공유가 도움이 되네요!" }] : [],
  });
  COMMUNITY_REGIONS.forEach((region, ri) => samples.forEach(([board, title, body, likes, art], index) => {
    posts.push(make("지역", region, board, title, body, likes + ri, art, AGES[(ri + index) % AGES.length], now - (index + 1) * 3600000));
  }));
  UNION_BOARDS.forEach((board, index) => {
    const matching = samples.find(sample => sample[0] === board);
    posts.push(make("연합", null, board, matching?.[1] || `${board}, 지역을 넘어 함께 나눠요`,
      matching?.[2] || "사는 곳이 달라도 비슷한 관심사를 가진 이웃과 취향과 경험을 나누고 싶어요.",
      matching?.[3] || 12 + index * 3, matching?.[4] || "room", AGES[index % AGES.length], now - (index + 1) * 3600000));
  });
  AGES.forEach((age, index) => posts.push(make("연합", null, "또래 이야기",
    ["첫 독립 준비, 다들 얼마씩 모으고 있어요?", "집과 일 사이, 나만의 기준이 생겼나요?", "가족의 생활 동선을 고려하니 집 보는 기준이 달라져요", "앞으로 살고 싶은 동네의 조건은 무엇인가요?"][index],
    "비슷한 시기를 보내는 분들의 이야기가 궁금해요. 각자의 상황은 다르니 편하게 경험을 나눠 주세요.", 14 + index * 3, null, age, now - (index + 1) * 3600000)));
  const date = new Date(now);
  for (const scope of ["지역", "연합"]) for (const region of scope === "지역" ? COMMUNITY_REGIONS : [null]) {
    [new Date(date.getFullYear(), date.getMonth() - 1, 15), new Date(date.getFullYear(), date.getMonth() < 6 ? -1 : 2, 15)].forEach((createdAt, index) => {
      posts.push(make(scope, region, "청약·집 구하기", index ? "집 찾기를 시작하며 적어 둔 나만의 체크리스트" : "이사 한 달 뒤에야 알게 된 생활의 작은 변화",
        "시간이 지나도 다시 꺼내 보고 싶은 이웃의 경험을 모았어요. 이전 기간을 보여 주는 예시 글입니다.", 156 + index * 21, "checklist", "30대", createdAt.getTime()));
    });
  }
  return posts;
}
