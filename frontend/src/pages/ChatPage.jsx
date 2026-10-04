import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { askListingQuestion, fetchListing } from "../api/client";
import { regionName } from "../constants/regions";
import { ddayLabel } from "../utils/format";

// PC 시안 05: 3단 (관심 공고 · 대화 · 근거) 공고 질문 화면
export default function ChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get("listingId") || "";
  const initialQuestion = searchParams.get("q") || "";
  const recommendations = useSelector((state) => state.listings.items);

  const [listing, setListing] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState(null);
  const askedInitial = useRef("");
  const endRef = useRef(null);

  const listings = recommendations.map((i) => i.listing);
  if (listing && !listings.some((l) => l.id === listing.id)) listings.unshift(listing);

  useEffect(() => {
    setMessages([]);
    setActiveEvidence(null);
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
    if (!q || !listingId || sending) return;
    setQuestion("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "me", text: q }]);
    try {
      const res = await askListingQuestion(q, Number(listingId));
      setMessages((prev) => [...prev, { role: "bot", ...res.data }]);
      if (res.data.evidence?.length) setActiveEvidence(res.data.evidence);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", answer: `답변을 가져오지 못했습니다. (${err.message})`, evidence: [] }]);
    } finally {
      setSending(false);
    }
  };

  // 공고 상세의 "자주 묻는 질문"에서 넘어온 경우 바로 질문한다.
  useEffect(() => {
    const key = `${listingId}|${initialQuestion}`;
    if (listing && initialQuestion && askedInitial.current !== key) {
      askedInitial.current = key;
      send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing, initialQuestion, listingId]);

  return (
    <div className="three-col chat-layout">
      <aside className="col side-left">
        <div className="card-title">질문할 공고</div>
        {listings.length === 0 && (
          <p className="muted small">
            추천 공고가 없습니다. <Link to="/dashboard">대시보드</Link>에서 공고를 먼저 확인하세요.
          </p>
        )}
        {listings.map((l) => (
          <button
            type="button"
            key={l.id}
            className={String(l.id) === listingId ? "card list-item active" : "card list-item"}
            onClick={() => navigate(`/chat?listingId=${l.id}`)}
          >
            <b>{l.complex_name}</b>
            <span className="muted small">
              {regionName(l.region_code)} · {ddayLabel(l).text}
            </span>
          </button>
        ))}
        <p className="muted small notice-box">
          선택한 공고문에 적힌 내용으로만 답합니다. 자격·가점·대출 금액은 계산 화면에서 확인하세요.
        </p>
      </aside>

      <section className="col main chat-panel">
        <div className="chat-messages">
          {!listingId && <p className="muted center">왼쪽에서 질문할 공고를 선택하세요.</p>}
          {listingId && messages.length === 0 && (
            <p className="muted center">{listing ? `"${listing.complex_name}" 공고에 대해 물어보세요.` : "공고를 불러오는 중..."}</p>
          )}
          {messages.map((m, i) =>
            m.role === "me" ? (
              <div key={i} className="bubble me">
                {m.text}
              </div>
            ) : (
              <div key={i} className="bubble bot">
                {m.answer}
                {m.evidence?.length > 0 && (
                  <button type="button" className="cite" onClick={() => setActiveEvidence(m.evidence)}>
                    근거 {m.evidence.length}건 보기
                  </button>
                )}
                {m.intent === "api" && (
                  <Link to={`/loans?listingId=${listingId}`} className="btn small-btn">
                    자금 계획에서 확인하기 →
                  </Link>
                )}
              </div>
            )
          )}
          {sending && <div className="bubble bot muted">답변을 찾는 중...</div>}
          <div ref={endRef} />
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
        >
          <input
            value={question}
            disabled={!listingId}
            placeholder="궁금한 점을 물어보세요 (예: 재당첨 제한이 있나요?)"
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!listingId || sending || !question.trim()}>
            전송
          </button>
        </form>
      </section>

      <aside className="col side-right wide">
        <div className="card-title">답변 근거 (공고문 원문)</div>
        {!activeEvidence && <p className="muted small">답변에 근거가 있으면 여기에 공고문 원문이 표시됩니다.</p>}
        {activeEvidence?.map((text, i) => (
          <div key={i} className="card evidence">
            <span className="cite">근거 {i + 1}</span>
            <p>{text}</p>
          </div>
        ))}
      </aside>
    </div>
  );
}
