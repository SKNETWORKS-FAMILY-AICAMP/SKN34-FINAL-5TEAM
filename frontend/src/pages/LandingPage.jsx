import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { HouseIcon } from "../components/MockupShell";
import slideDiagnosis from "../assets/landing/slide-diagnosis.png";
import slideResult from "../assets/landing/slide-result.png";
import slideDashboard from "../assets/landing/slide-dashboard.png";
import "../styles/mockup.css";

// 첫 페이지(/): 제목 → 기능 화면 슬라이드(자동으로 넘어가고 도트로 선택) → "청약 진단 시작하기" 버튼 하나
// 슬라이드 가운데 세로 바는 고정, 왼쪽은 기능 화면 캡처 · 오른쪽은 설명
const SLIDES = [
  {
    title: "단계별 청약 진단",
    desc: "나이 · 주택 · 가족 · 통장 · 소득 · 희망 조건 6단계에 버튼으로 답하면, 오른쪽 막대에 가점이 차곡차곡 쌓여요.",
    tag: "가점 자동 계산 · 회원가입 없이",
    img: slideDiagnosis,
  },
  {
    title: "진단 결과 미리보기",
    desc: "예상 가점과 1순위 요건, 특별공급 자격을 한눈에 확인하고, AI가 고른 내 조건에 맞는 공고 1건을 먼저 봐요.",
    tag: "AI 공고 판정 1건 무료",
    img: slideResult,
  },
  {
    title: "로그인 후 맞춤 대시보드",
    desc: "추천 공고와 자금 · 출퇴근 조건을 함께 보고, 공고문 근거 AI 상담과 전략 리포트까지 이어져요.",
    tag: "RAG 상담 · 멀티 에이전트 리포트",
    img: slideDashboard,
  },
];
const INTERVAL_MS = 4000;

export default function LandingPage() {
  const userId = useSelector((state) => state.user.id);
  const [cur, setCur] = useState(0);
  const timer = useRef(null);

  // 움직임 줄이기를 켠 사용자에게는 자동으로 넘기지 않는다.
  const start = useCallback(() => {
    clearInterval(timer.current);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    timer.current = setInterval(() => setCur((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
  }, []);

  useEffect(() => {
    start();
    return () => clearInterval(timer.current);
  }, [start]);

  // 도트를 누르면 그 화면으로 가고, 그때부터 다시 4초를 센다.
  const go = (k) => {
    setCur(k);
    start();
  };

  return (
    <div className="mk mk-first">
      <header>
        <div className="mk-header-inner" style={{ maxWidth: 1240 }}>
          <Link to="/" className="mk-brand">
            <HouseIcon />
            <span>청약전략</span>
          </Link>
          <nav className="mk-nav" aria-label="주요 메뉴">
            <Link to="/listings">공고 찾기</Link>
            <Link to="/ai-chat">AI 청약 상담</Link>
            {userId ? (
              <Link to="/my" className="mk-pill-white">
                내 대시보드
              </Link>
            ) : (
              <Link to="/diagnosis" className="mk-pill-white">
                로그인
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mk-first-main">
        <div className="mk-first-title">
          <span className="mk-badge-glass mk-glass-dark">청약홈 · LH · SH 공고 기반 AI 청약 진단</span>
          <h1>1분 진단으로 당첨 가능한 공고와 전략까지</h1>
          <p>가점·1순위·특별공급 자격을 진단하고, AI가 공고문을 읽어 내게 맞는 공고와 자금 계획까지 정리해 드려요</p>
        </div>

        <section className="mk-carousel" aria-roledescription="carousel" aria-label="기능 화면 미리보기">
          <div className="mk-carousel-band">
            {SLIDES.map((s, k) => (
              <div
                key={s.title}
                className={k === cur ? "mk-slide on" : "mk-slide"}
                role="group"
                aria-roledescription="slide"
                aria-label={`${k + 1} / ${SLIDES.length} · ${s.title}`}
                aria-hidden={k !== cur}
              >
                <div className="mk-slide-img">
                  <img src={s.img} alt={`${s.title} 화면 예시`} />
                </div>
                <div className="mk-slide-text">
                  <div className="mk-slide-bar" aria-hidden="true" />
                  <div className="mk-slide-card">
                    <span className="mk-slide-step">
                      <span>{k + 1}</span>STEP {k + 1} / {SLIDES.length}
                    </span>
                    <span className="mk-slide-title">{s.title}</span>
                    <span className="mk-slide-desc">{s.desc}</span>
                    <span className="mk-slide-tag">{s.tag}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mk-dots" role="group" aria-label="슬라이드 선택">
            {SLIDES.map((s, k) => (
              <button
                key={s.title}
                type="button"
                aria-label={`${k + 1}번 화면 보기 · ${s.title}`}
                aria-current={k === cur}
                onClick={() => go(k)}
              >
                <span className={k === cur ? "on" : ""} />
              </button>
            ))}
          </div>
        </section>

        <div className="mk-first-cta">
          <Link to="/diagnosis" className="mk-btn-start">
            청약 진단 시작하기
          </Link>
          <span>회원가입 없이 시작 · 결과를 저장할 때만 로그인</span>
        </div>
      </main>

      <footer className="mk-footer" style={{ paddingTop: 0, paddingBottom: 12, fontSize: 12 }}>
        진단 결과는 참고용이며, 실제 자격은 각 입주자모집공고문 기준으로 확인하세요 · 데이터: 청약홈 · LH · SH
      </footer>
    </div>
  );
}
