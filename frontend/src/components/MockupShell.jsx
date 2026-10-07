import { Link, NavLink } from "react-router-dom";
import { useSelector } from "react-redux";

import "../styles/mockup.css";

// 목업(2026.10.04) 화면 공통 틀: 하늘 사진 배경 + 투명 헤더
const NAV = [
  ["/", "청약 진단"],
  ["/ai-chat", "AI 청약 상담"],
  ["/listings", "공고 찾기"],
  ["/report", "전략 리포트"],
  ["/loans", "대출 시뮬레이션"],
];

export function HouseIcon({ color = "#FFFFFF", size = 28 }) {
  return (
    <svg width={size} height={size * 0.96} viewBox="7 9.5 20 18" fill="none" aria-hidden="true">
      <path d="M9 17.5 17 11l8 6.5V25a1 1 0 0 1-1 1h-4.5v-5h-5v5H10a1 1 0 0 1-1-1v-7.5Z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
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
            <span>청약전략</span>
          </Link>
          <nav className="mk-nav" aria-label="주요 메뉴">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? "active" : "")}>
                {label}
              </NavLink>
            ))}
            {userId ? (
              <Link to="/dashboard" className="mk-pill-white">
                마이페이지
              </Link>
            ) : onLogin ? (
              <button type="button" className="mk-pill-white" onClick={onLogin}>
                로그인
              </button>
            ) : (
              <Link to="/" className="mk-pill-white">
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
