import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";

import MockupShell from "../components/MockupShell";
import { fetchRecommendations } from "../store/listingsSlice";
import { regionName } from "../constants/regions";
import { daysLeft, formatShortDate, formatWon } from "../utils/format";
import { calcRank1, calcScore, calcSpecial } from "../utils/diagnosis";

// 목업 ④ 멀티 에이전트 전략 리포트
// 지금은 각 단계를 화면에서 순서대로 계산한다 (진단 계산 → /recommendations → 자금 계산).
// 에이전트(LLM) 백엔드가 생기면 같은 자리에 결과만 바꿔 넣으면 된다.
export default function ReportPage() {
  const dispatch = useDispatch();
  const d = useSelector((state) => state.diagnosis);
  const userId = useSelector((state) => state.user.id);
  const { items, status } = useSelector((state) => state.listings);
  const [agent, setAgent] = useState(2);

  useEffect(() => {
    if (userId) dispatch(fetchRecommendations(userId));
  }, [dispatch, userId]);

  const score = calcScore(d);
  const rank1 = calcRank1(d);
  const special = calcSpecial(d).filter((s) => s.status !== "no");
  const eligible = items.filter((i) => i.eligible);
  const assetsWon = d.assets * 10_000_000;
  const target = eligible.find((i) => i.listing.sale_price) || items.find((i) => i.listing.sale_price);
  const price = target?.listing.sale_price || 0;
  const shortage = Math.max(0, price - assetsWon);
  const ownPct = price ? Math.min(100, (assetsWon / price) * 100) : 0;
  const upcoming = [...items].sort((a, b) => daysLeft(a.listing) - daysLeft(b.listing)).filter((i) => daysLeft(i.listing) !== Number.MAX_SAFE_INTEGER).slice(0, 3);
  const specialNames = special.map((s) => s.label);
  const regions = d.wantRegions.join("·");

  const agents = [
    {
      name: "프로필 분석",
      role: "가점·1순위·특공 자격 계산",
      input: "청약 진단 입력값 (나이, 혼인, 무주택 기간, 통장, 소득·자산)",
      tools: ["가점 계산 함수", "1순위 규칙 엔진", "사용자 DB"],
      output: `가점 ${score.total}점 · 1순위 ${rank1.badge.text} · 특공 후보: ${specialNames.join(", ") || "없음"}`,
    },
    {
      name: "공고 탐색",
      role: "희망 조건에 맞는 공고 수집",
      input: `희망 지역(${regions}), 공급 유형(${d.supply.join("·")}), 특공 후보`,
      tools: ["청약홈 분양정보 API", "LH 공고 API", "SH 게시판 수집", "공고 DB"],
      output: userId ? `추천 대상 공고 ${items.length}건 · 자격 충족 ${eligible.length}건` : "진단 저장 후 공고를 찾아요",
    },
    {
      name: "공고문 분석 (RAG)",
      role: "PDF에서 자격·일정·유의사항 추출",
      input: "후보 공고문 PDF + 사용자 프로필",
      tools: ["PDF 텍스트 추출", "공고문 벡터 검색", "LLM 구조화 추출"],
      output: "공고별 계약금 · 일정 · 필요 서류 (공고 AI 분석 화면)",
    },
    {
      name: "자금 · 대출",
      role: "부족 자금과 대출 상품 매칭",
      input: `공고별 분양가, 가용자산 ${(d.assets / 10).toFixed(1)}억`,
      tools: ["청약홈 주택형 API", "파인 대출 상품", "자금 계산기"],
      output: price ? `부족 자금 약 ${formatWon(shortage)} · 정책대출 → 은행 주담대 순 확인` : "분양가가 있는 추천 공고가 생기면 계산해요",
    },
    {
      name: "전략 작성 · 검증",
      role: "리포트 작성, 근거 없는 문장 제거",
      input: "앞 단계 결과 전체",
      tools: ["LLM 리포트 작성", "근거 인용 검증", "일정 계산"],
      output: "추천 전략 · 준비 체크리스트 · 자금 계획 · 일정",
    },
  ];
  const cur = agents[agent];

  const strategies = [];
  if (specialNames.length) {
    strategies.push({
      title: `${specialNames.slice(0, 2).join(" · ")} 특별공급`,
      body: `${specialNames.join(", ")} 특별공급 요건을 충족(또는 확인 필요)해요. 가점 경쟁보다 특별공급 물량을 먼저 노리세요.`,
      tags: [["ok", "자격 후보"], ["none", "근거: 진단 프로필"]],
    });
  }
  if (eligible.length) {
    const top = eligible[0].listing;
    strategies.push({
      title: `${regionName(top.region_code)} ${top.supply_type || "공고"}부터 확인`,
      body: `계약금 기준으로 낼 수 있는 공고가 ${eligible.length}건 있어요. 가장 먼저 볼 공고: ${top.complex_name}.`,
      tags: [["ok", "자격 충족"], ["none", `확률 구간 ${eligible[0].percentile_band}`]],
      link: `/listings/${top.id}/ai`,
    });
  }
  strategies.push({
    title: score.total >= 52 ? "민영 일반공급 가점제 도전" : "민영 일반공급은 추첨제 물량 위주로",
    body:
      score.total >= 52
        ? `가점 ${score.total}점으로 희망 지역 당첨선(예시값 52점) 이상이에요. 가점제 물량도 노려볼 만해요.`
        : `1순위 요건은 ${rank1.badge.text}이지만 가점이 ${score.total}점이에요. 가점제보다 추첨제 비율이 있는 주택형이 유리해요.`,
    tags: [["none", "근거: 주택공급에 관한 규칙 · 당첨가점 통계(예시값)"]],
  });

  const conclusion = specialNames.length
    ? `가점(${score.total}점)으로 경쟁하기보다 ${specialNames.slice(0, 2).join("·")} 특별공급을 중심으로, ${regions} 공고를 1순위 목표로 잡으세요.`
    : `가점 ${score.total}점 기준으로 ${regions} 공고 중 추첨제 물량과 계약금이 맞는 공고부터 보세요.`;

  return (
    <MockupShell>
      <main className="mk-main" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div className="mk-on-photo">
            <div className="mk-crumb">청약 진단 › AI 전략 리포트</div>
            <h1 style={{ margin: "6px 0", fontSize: 38, lineHeight: 1.2 }}>나의 청약 전략 리포트</h1>
            <p style={{ color: "#EAF2FF" }}>에이전트 5단계가 진단 → 공고 탐색 → 공고문 분석 → 자금 계획 → 전략 작성을 진행해요.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="mk-btn-line"
              style={{ minHeight: 44, borderRadius: 999, background: "rgba(255,255,255,0.18)", color: "#fff", borderColor: "rgba(255,255,255,0.7)" }}
              onClick={() => userId && dispatch(fetchRecommendations(userId))}
            >
              다시 생성
            </button>
            <button type="button" className="mk-btn-line" style={{ minHeight: 44, borderRadius: 999, border: 0 }} onClick={() => window.print()}>
              PDF로 저장
            </button>
          </div>
        </div>

        {!userId && (
          <section className="mk-glass mk-card" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
            <span>진단 정보를 저장하면 실제 추천 공고로 리포트를 채워요. 지금은 진단 계산 결과만 보여요.</span>
            <Link to="/diagnosis" className="mk-btn sm">
              진단하고 저장하기
            </Link>
          </section>
        )}

        {/* 에이전트 흐름 */}
        <section className="mk-glass mk-card">
          <div className="mk-section-head" style={{ marginBottom: 14 }}>
            <h2>에이전트 작업 흐름</h2>
            <span className="mk-sub">카드를 누르면 각 에이전트가 쓴 도구와 결과를 볼 수 있어요</span>
          </div>
          <div className="mk-orch">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="5" r="2.5" stroke="#5B3FD6" strokeWidth="1.8" />
              <circle cx="5" cy="19" r="2.5" stroke="#5B3FD6" strokeWidth="1.8" />
              <circle cx="19" cy="19" r="2.5" stroke="#5B3FD6" strokeWidth="1.8" />
              <path d="M12 7.5V12M12 12l-5.5 4.8M12 12l5.5 4.8" stroke="#5B3FD6" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>
              <b>오케스트레이터</b>가 목표(“당첨 가능성 높은 공고와 자금 계획”)를 받아 아래 에이전트에게 순서대로 맡겨요.
            </span>
          </div>
          <div className="mk-agents">
            {agents.map((a, i) => {
              const done = i !== 1 || status !== "loading";
              return (
                <button key={a.name} type="button" aria-pressed={agent === i} className={`mk-agent${agent === i ? " on" : ""}`} onClick={() => setAgent(i)}>
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#5B3FD6" }}>STEP {i + 1}</span>
                    <span className={`mk-pill mk-tone-${done ? "ok" : "warn"}`} style={{ fontSize: 11.5, padding: "2px 8px" }}>
                      {done ? "완료" : "진행 중"}
                    </span>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#121826" }}>{a.name}</span>
                  <span style={{ fontSize: 12.5, color: "#4A5568" }}>{a.role}</span>
                </button>
              );
            })}
          </div>
          <div className="mk-agent-detail">
            <div>
              <h4>입력</h4>
              <div style={{ fontSize: 14 }}>{cur.input}</div>
            </div>
            <div>
              <h4>사용한 도구 · 데이터</h4>
              <div className="mk-opts">
                {cur.tools.map((t) => (
                  <span key={t} className="mk-tag" style={{ background: "#fff", border: "1px solid #D6D0F5" }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4>결과 → 다음 에이전트로 전달</h4>
              <div style={{ fontSize: 14 }}>{cur.output}</div>
            </div>
          </div>
        </section>

        <div className="mk-cols">
          <div className="mk-center-col" style={{ flex: "999 1 620px" }}>
            <section className="mk-conclusion">
              <small>AI 결론</small>
              <p>{conclusion}</p>
            </section>

            <section className="mk-glass mk-card">
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>추천 전략</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {strategies.map((s, i) => (
                  <article key={s.title} className={`mk-strategy${i === 0 ? " top" : ""}`}>
                    <span className="no">{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                      <div className="mk-opts" style={{ fontSize: 12.5 }}>
                        {s.tags.map(([tone, text]) => (
                          <span key={text} className={tone === "none" ? "mk-tag" : `mk-tag mk-tone-${tone}`} style={{ fontWeight: tone === "none" ? 400 : 600 }}>
                            {text}
                          </span>
                        ))}
                        {s.link && (
                          <Link to={s.link} style={{ fontSize: 12.5, fontWeight: 600 }}>
                            공고 AI 분석 보기 ›
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="mk-glass mk-card">
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>신청 전 준비할 것</h2>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, fontSize: 14.5 }}>
                {[
                  d.dualIncome == null ? "맞벌이 여부를 입력해 주세요 — 소득 기준이 달라져 판정이 바뀔 수 있어요." : null,
                  d.marital === "newlywed" ? "혼인신고일 기준 7년이 지나는 시점을 확인하세요. [혼인신고일 입력 필요]" : null,
                  "청약통장 월 납입을 유지하세요 — 공공분양은 납입 인정 회차가 순위에 반영돼요.",
                  "소득·자산 증빙 서류를 미리 준비하세요. 목록은 공고 AI 분석에서 공고별로 볼 수 있어요.",
                ]
                  .filter(Boolean)
                  .map((t) => (
                    <li key={t} style={{ display: "flex", gap: 10 }}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: 2 }}>
                        <rect x="2" y="2" width="16" height="16" rx="4" stroke="#8C97A8" strokeWidth="1.6" />
                      </svg>
                      <span>{t}</span>
                    </li>
                  ))}
              </ul>
            </section>
          </div>

          <aside className="mk-side wide" aria-label="자금 계획과 일정">
            <section className="mk-glass mk-card">
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>자금 계획</h2>
              {target ? (
                <>
                  <p className="mk-sub" style={{ marginBottom: 14, fontSize: 13 }}>
                    {target.listing.complex_name} 분양가 기준
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                    <span>분양가</span>
                    <b>{formatWon(price)}</b>
                  </div>
                  <div className="mk-fundbar" role="img" aria-label={`자기자금 ${ownPct.toFixed(1)}%, 대출 필요 ${(100 - ownPct).toFixed(1)}%`}>
                    <div style={{ width: `${ownPct}%`, background: "#1D5BD8" }} />
                    <div style={{ width: `${100 - ownPct}%`, background: "#F0A64A" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                    <span>■ 가용자산 {formatWon(assetsWon)}</span>
                    <span style={{ color: "#B35300" }}>■ 부족 {formatWon(shortage)}</span>
                  </div>
                  {target.listing.contract_deposit && (
                    <p className="mk-sub" style={{ marginTop: 10 }}>
                      계약금 {formatWon(target.listing.contract_deposit)} (공고문 숫자)
                    </p>
                  )}
                </>
              ) : (
                <div className="mk-empty" style={{ marginTop: 10 }}>
                  {userId ? (status === "loading" ? "추천 공고를 불러오는 중…" : "분양가가 있는 추천 공고가 아직 없어요.") : "진단을 저장하면 추천 공고의 분양가로 계산해요."}
                </div>
              )}
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: 12, borderRadius: 10, border: "1px solid #DDE3EC" }}>
                  <div className="mk-sub" style={{ fontSize: 13 }}>
                    대출 상품 매칭
                  </div>
                  <div style={{ fontWeight: 700 }}>정책대출 → 은행 주담대 순</div>
                  <div className="mk-sub">파인 대출 상품 데이터 · DSR 별도 심사</div>
                </div>
              </div>
              <Link to={target ? `/loans?listingId=${target.listing.id}` : "/loans"} className="mk-btn-outline-blue" style={{ marginTop: 14 }}>
                대출 시뮬레이션에서 자세히
              </Link>
            </section>

            <section className="mk-glass mk-card">
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>다가오는 일정</h2>
              <ol className="mk-timeline">
                {upcoming.map(({ listing }) => (
                  <li key={listing.id}>
                    <b style={{ color: listing.days_until_receipt_end <= 7 ? "#C4302B" : undefined }}>{formatShortDate(listing.receipt_end)}</b>
                    <Link to={`/listings/${listing.id}/ai`} style={{ color: "#121826", textDecoration: "none" }}>
                      {listing.complex_name} 접수 마감
                    </Link>
                  </li>
                ))}
                <li>
                  <b style={{ color: "#5B6576" }}>매일</b>
                  <span>오전 6시 신규 공고 자동 수집</span>
                </li>
              </ol>
              <Link to="/ai-chat" className="mk-btn block sm" style={{ marginTop: 12, minHeight: 44 }}>
                이 리포트로 AI 상담 이어가기
              </Link>
            </section>
          </aside>
        </div>
      </main>
    </MockupShell>
  );
}
