import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useSearchParams } from "react-router-dom";

import MockupShell, { SparkIcon } from "../components/MockupShell";
import { askListingQuestion, fetchListing } from "../api/client";
import { calcScore, profileChips } from "../utils/diagnosis";

// 목업 ② AI 청약 상담 (RAG): 왼쪽 내 프로필·참조 공고, 가운데 대화, 오른쪽 답변 근거
// 질문은 백엔드 /chat/ (질문 분류 → 공고문 근거 검색 → LLM 답변)으로 보낸다.
const SUGGESTIONS = [
  "이 공고, 제 조건으로 신청할 수 있나요?",
  "당첨되면 부족한 돈은 대출로 어떻게 마련하나요?",
  "가점이 낮으면 어떤 공급 유형을 노려야 하나요?",
  "접수 마감이 언제예요?",
];

const INTENT_LABEL = { listing: "공고 내용 질문", term: "청약 용어 질문", api: "내 정보·자격 계산 질문" };
const SOURCE_LABEL = { llm: "LLM이 근거 문서로 답변 생성", local: "공고 데이터·용어 사전에서 바로 답변", api: "자격·대출 계산 화면 안내" };

export default function AIChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const listingId = searchParams.get("listingId") || "";
  const d = useSelector((state) => state.diagnosis);
  const recommendations = useSelector((state) => state.listings.items);
  const [listing, setListing] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const score = calcScore(d);
  const chips = profileChips(d).slice(1);
  const lastBot = [...messages].reverse().find((m) => m.role === "bot");
  const evidence = lastBot?.evidence || [];

  useEffect(() => {
    if (!listingId) {
      setListing(null);
      return;
    }
    fetchListing(listingId)
      .then((res) => setListing(res.data))
      .catch(() => setListing(null));
  }, [listingId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = async (text) => {
    const q = text.trim();
    if (!q || sending) return;
    setQuestion("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "me", text: q }]);
    try {
      const res = await askListingQuestion(q, listingId ? Number(listingId) : undefined);
      setMessages((prev) => [...prev, { role: "bot", ...res.data }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", answer: `답변을 가져오지 못했어요. (${err.message})`, evidence: [] }]);
    } finally {
      setSending(false);
    }
  };

  const listings = recommendations.map((i) => i.listing).slice(0, 5);
  if (listing && !listings.some((l) => l.id === listing.id)) listings.unshift(listing);

  return (
    <MockupShell>
      <main className="mk-main mk-cols">
        <div className="mk-hero-title" style={{ flex: "1 1 100%", padding: "8px 0 6px" }}>
          <span className="mk-badge-glass mk-glass-dark">공고문 · 법령 근거로 답하는 AI</span>
          <h1 style={{ fontSize: 38, margin: "12px 0 6px" }}>무엇이든 물어보세요</h1>
          <p style={{ fontSize: 15 }}>내 진단 결과를 바탕으로, 근거 문서와 함께 답해 드려요</p>
        </div>

        {/* 왼쪽: 프로필 + 참조 공고 */}
        <aside className="mk-side" aria-label="상담 컨텍스트">
          <section className="mk-glass" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700 }}>내 진단 프로필</h2>
              <Link to="/diagnosis" style={{ fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                수정
              </Link>
            </div>
            <div className="mk-score-big" style={{ margin: "10px 0 12px" }}>
              <b style={{ fontSize: 34, lineHeight: 1 }}>{score.total}</b>
              <span>/ 84점</span>
            </div>
            <div className="mk-opts">
              {chips.map((c) => (
                <span key={c} className="mk-tag">
                  {c}
                </span>
              ))}
            </div>
            <p style={{ marginTop: 12 }} className="mk-sub">
              {d.done ? "진단 결과를 참고해 질문해 보세요." : "청약 진단을 먼저 하면 내 조건에 맞춰 볼 수 있어요. (지금은 기본값)"}
            </p>
          </section>

          <section className="mk-glass" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>참조 공고</h2>
            <p className="mk-sub" style={{ marginBottom: 10 }}>
              고른 공고의 공고문에서 답변 근거를 찾아요
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="mk-check-row">
                <input type="radio" name="ref" checked={!listingId} onChange={() => setSearchParams({})} />
                <span>
                  <b style={{ fontWeight: 600 }}>공고 없이 일반 질문</b>
                  <br />
                  <span className="mk-sub">청약 용어 · 제도</span>
                </span>
              </label>
              {listings.map((l) => (
                <label key={l.id} className="mk-check-row">
                  <input type="radio" name="ref" checked={String(l.id) === listingId} onChange={() => setSearchParams({ listingId: String(l.id) })} />
                  <span>
                    <b style={{ fontWeight: 600 }}>{l.complex_name}</b>
                    <br />
                    <span className="mk-sub">{l.supply_type || "입주자모집공고"}</span>
                  </span>
                </label>
              ))}
            </div>
            <Link to="/listings" className="mk-btn-line" style={{ marginTop: 12, width: "100%", minHeight: 44, fontSize: 13.5, borderStyle: "dashed", boxSizing: "border-box" }}>
              + 공고 목록에서 고르기
            </Link>
          </section>
        </aside>

        {/* 가운데: 대화 */}
        <section className="mk-glass mk-chat" aria-label="AI 상담 대화" style={{ flex: "999 1 520px", minWidth: 0 }}>
          <div className="mk-chat-head">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: "#F1EEFD", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <SparkIcon />
              </span>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700 }}>AI 청약 상담</h2>
                <div className="mk-sub">{listing ? `${listing.complex_name} 공고문에서 근거를 찾아 답해요` : "공고문·청약 용어 문서에서 근거를 찾아 답하는 LLM 상담"}</div>
              </div>
            </div>
            <span className="mk-pill" style={{ background: "#F1EEFD", color: "#4A2FC0", fontWeight: 600 }}>
              RAG · 문서 근거 답변
            </span>
          </div>

          <div className="mk-chat-body">
            <div className="mk-msg-ai">
              <span className="mk-avatar">AI</span>
              <div className="mk-bubble-ai">
                진단 프로필(가점 {score.total}점)을 바탕으로 답변할게요. 공고 자격, 대출, 당첨 전략 무엇이든 물어보세요.
              </div>
            </div>
            {messages.map((m, i) =>
              m.role === "me" ? (
                <div key={i} className="mk-bubble-me">
                  {m.text}
                </div>
              ) : (
                <div key={i} className="mk-msg-ai">
                  <span className="mk-avatar">AI</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {m.intent && (
                      <details className="mk-details">
                        <summary>답변 과정 보기</summary>
                        <ol style={{ margin: "8px 0 2px", paddingLeft: 18 }}>
                          <li>
                            <b>질문 분류</b> — {INTENT_LABEL[m.intent] || m.intent}
                          </li>
                          <li>
                            <b>문서 검색</b> — 근거 조각 {m.evidence?.length || 0}개
                          </li>
                          <li>
                            <b>답변 생성</b> — {SOURCE_LABEL[m.source] || m.source}
                          </li>
                        </ol>
                      </details>
                    )}
                    <div className="mk-bubble-ai">{m.answer}</div>
                    {m.intent === "api" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <Link to="/dashboard" className="mk-btn sm">
                          내 추천 공고 보기
                        </Link>
                        <Link to="/loans" className="mk-btn sm">
                          대출 시뮬레이션 열기
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
            {sending && (
              <div className="mk-msg-ai">
                <span className="mk-avatar">AI</span>
                <div className="mk-bubble-ai">근거 문서를 찾고 있어요…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="mk-chat-foot"
            onSubmit={(e) => {
              e.preventDefault();
              send(question);
            }}
          >
            <div className="mk-opts">
              {SUGGESTIONS.map((q) => (
                <button key={q} type="button" className="mk-chip-btn" onClick={() => send(q)} disabled={sending}>
                  {q}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }} className="mk-sub">
                질문 입력
                <textarea
                  className="mk-textarea"
                  rows={2}
                  style={{ resize: "none", fontSize: 14.5, padding: "10px 12px" }}
                  placeholder="예) 맞벌이인데 소득 기준은 어떻게 계산돼요?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(question);
                    }
                  }}
                />
              </label>
              <button type="submit" className="mk-btn" style={{ minHeight: 48, padding: "0 20px" }} disabled={sending || !question.trim()}>
                보내기
              </button>
            </div>
          </form>
        </section>

        {/* 오른쪽: 근거 */}
        <aside className="mk-side" style={{ flex: "1 1 300px" }} aria-label="답변 근거">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }} className="mk-on-photo">
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>답변 근거</h2>
            <span style={{ fontSize: 12, color: "#EAF2FF" }}>검색된 문서 조각 {evidence.length}개</span>
          </div>
          {evidence.length === 0 && (
            <div className="mk-glass mk-cite">
              <p style={{ background: "transparent", padding: 0, color: "#5B6576" }}>
                {listing ? "질문하면 이 공고의 공고문에서 찾은 근거 문장이 여기에 표시돼요." : "참조 공고를 고르고 질문하면 공고문 근거가 여기에 표시돼요."}
              </p>
            </div>
          )}
          {evidence.map((text, i) => (
            <article key={i} className="mk-glass mk-cite">
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <span className="mk-tag-violet">[{i + 1}]</span>
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{listing ? `${listing.complex_name} 공고` : "참조 문서"}</span>
              </div>
              <p>{text}</p>
            </article>
          ))}
          {listing && (
            <Link to={`/listings/${listing.id}/ai`} className="mk-btn block sm" style={{ minHeight: 44 }}>
              이 공고 AI 분석 보기
            </Link>
          )}
        </aside>
      </main>
    </MockupShell>
  );
}
