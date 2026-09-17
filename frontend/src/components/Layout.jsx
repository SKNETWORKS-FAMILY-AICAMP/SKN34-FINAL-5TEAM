import { Link } from "react-router-dom";

export default function Layout({ children }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>청약 전략 플랫폼</h1>
        <nav>
          <Link to="/">내 정보 입력</Link>
          <Link to="/dashboard">추천 대시보드</Link>
          <Link to="/loans">대출 시뮬레이션</Link>
        </nav>
      </header>
      <main className="app-content">{children}</main>
    </div>
  );
}
