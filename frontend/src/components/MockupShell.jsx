import { Link, NavLink } from "react-router-dom";
import { useSelector } from "react-redux";

import "../styles/mockup.css";

// 목업(2026.10.04) 화면 공통 틀: 하늘 사진 배경 + 투명 헤더
const NAV = [
  ["/diagnosis", "청약 진단"],
  ["/ai-chat", "AI 청약 상담"],
  ["/listings", "공고 찾기"],
  ["/report", "전략 리포트"],
  ["/loans", "대출 시뮬레이션"],
];

// 로고: 집 선 아이콘 + 창문 점 3개(파랑 청약홈 · 초록 LH · 주황 SH) — 2026.10.08 이름 "청약돼?!" 확정안
export function HouseIcon({ color = "#FFFFFF", size = 40 }) {
  const light = color.toUpperCase() === "#FFFFFF";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M6 19 20 7l14 12v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" stroke={color} strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="14" cy="26" r="2.8" fill={light ? "#7FB0FF" : "#1D5BD8"} />
      <circle cx="20" cy="26" r="2.8" fill={light ? "#5FD3A8" : "#0B8A6A"} />
      <circle cx="26" cy="26" r="2.8" fill={light ? "#FF9B6A" : "#D9480F"} />
    </svg>
  );
}

// 이름: 청약돼 + 주황 말풍선 "?!" (하나만)
export function BrandName() {
  return (
    <span>
      청약돼<em className="mk-qm">?!</em>
    </span>
  );
}

export function SparkIcon({ color = "#5B3FD6", size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M6.3 17.7l2.4-2.4M15.3 8.7l2.4-2.4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function MockupShell({ children, onLogin, footer }) {
  const userId = useSelector((state) => state.user.id);

  return (
    <div className="mk">
      <header>
        <div className="mk-header-inner">
          <Link to="/" className="mk-brand">
            <HouseIcon />
            <BrandName />
          </Link>
          <nav className="mk-nav" aria-label="주요 메뉴">
            {/* 로그인 전에는 메뉴 없이 로그인 버튼만 */}
            {userId && NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? "active" : "")}>
                {label}
              </NavLink>
            ))}
            {userId ? (
              <Link to="/portal" className="mk-pill-white">
                청약 홈
              </Link>
            ) : onLogin ? (
              <button type="button" className="mk-pill-white" onClick={onLogin}>
                로그인
              </button>
            ) : (
              <Link to="/diagnosis" className="mk-pill-white">
                진단 시작
              </Link>
            )}
          </nav>
        </div>
      </header>
      {children}
      <footer className="mk-footer">
        {footer || "진단·분석 결과는 참고용이며, 실제 자격은 각 입주자모집공고문 기준으로 확인하세요 · 데이터: 청약홈 · LH · SH"}
      </footer>
    </div>
  );
}
