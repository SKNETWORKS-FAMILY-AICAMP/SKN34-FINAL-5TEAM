import { Link } from "react-router-dom";

import { HouseIcon } from "../components/MockupShell";
import "../styles/mockup.css";

// 목업 ⓪-B 홈 대안 · 랜딩형 (/intro) — 첫 화면은 /mockup/Landing
const BADGES = [
  ["청약홈 공고 연동", "분양정보 · 경쟁률 · 당첨가점 API"],
  ["LH · SH 공고 수집", "공공분양 · 임대 공고 한곳에"],
  ["근거를 보여주는 AI", "공고문 · 법령 인용 답변"],
  ["나만의 전략 리포트", "멀티 에이전트가 자금 계획까지"],
];

function Laurel({ flip }) {
  return (
    <svg width="22" height="44" viewBox="0 0 22 44" fill="none" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M18 42C8 36 5 24 9 4" stroke="#B9A988" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M9.5 10c-4-1-6-4-6-7 4 1 6 4 6 7ZM8 18c-4-1-6.5-3.5-7-7 4 .5 6.5 3.5 7 7ZM8 26.5c-3.5-.5-6.5-3-7-6.5 4 .5 6.5 3 7 6.5ZM10.5 34.5c-3.5 0-6.5-2.5-7.5-5.5 4 0 6.5 2.5 7.5 5.5Z"
        fill="#CDBF9F"
      />
    </svg>
  );
}

export default function LandingAltPage() {
  const month = new Date().getMonth() + 1;
  return (
    <div className="mk-landing">
      <Link to="/diagnosis" className="mk-landing-strip">
        {month}월 신규 청약 공고, 내 조건에 맞는지 1분 만에 확인해 보세요 · <span style={{ textDecoration: "underline" }}>진단 시작</span>
      </Link>
      <div className="mk-landing-wrap">
        <section className="mk-landing-hero">
          <header className="mk-landing-nav">
            <Link to="/intro" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "#0A2B5E" }}>
              <HouseIcon color="#E8613C" size={26} />
              <span style={{ fontFamily: "'Jua', 'Gothic A1', sans-serif", fontSize: 26 }}>청약돼<em className="mk-qm">?!</em></span>
            </Link>
            <nav aria-label="주요 메뉴">
              <Link to="/diagnosis">청약 진단</Link>
              <Link to="/listings">공고 찾기</Link>
              <Link to="/ai-chat">AI 청약 상담</Link>
              <Link to="/report">전략 리포트</Link>
              <Link to="/loans">대출 시뮬레이션</Link>
            </nav>
            <div style={{ display: "flex", gap: 8 }}>
              <Link to="/diagnosis" className="mk-btn-plain">
                로그인
              </Link>
              <Link to="/diagnosis" className="mk-btn-orange sm">
                회원가입
              </Link>
            </div>
          </header>
          <div className="mk-landing-card">
            <h1>청약, 이제 내 조건부터</h1>
            <p>가점·1순위·특별공급 자격을 1분 만에 진단하고, AI가 공고문을 읽어 나에게 맞는 공고와 자금 계획까지 정리해 드려요.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <Link to="/diagnosis" className="mk-btn-orange">
                1분 진단 시작하기
              </Link>
              <Link to="/ai-chat" style={{ display: "inline-flex", alignItems: "center", minHeight: 48, padding: "0 16px", color: "#1B2230", textDecoration: "none", fontWeight: 600 }}>
                AI에게 먼저 물어보기 ›
              </Link>
            </div>
          </div>
        </section>
        <section className="mk-badges" aria-label="서비스 특징">
          {BADGES.map(([title, sub]) => (
            <div key={title}>
              <Laurel />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 12.5, color: "#5B6576" }}>{sub}</div>
              </div>
              <Laurel flip />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
