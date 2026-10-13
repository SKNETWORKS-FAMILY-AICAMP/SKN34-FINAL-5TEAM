import { Link, NavLink, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";

// 상단 메뉴: 마우스를 올리면 하위 메뉴가 펼쳐지는 포털 스타일
const MENUS = [
  {
    label: "청약 공고",
    to: "/listings",
    children: [
      ["전체 공고 둘러보기", "/listings"],
      ["내게 맞는 공고 추천", "/dashboard"],
    ],
  },
  { label: "자금 계획", to: "/loans", children: [["대출·자금 시뮬레이션", "/loans"]] },
  { label: "출퇴근 조회", to: "/commute", children: [["출발지·도착지 경로 조회", "/commute"]] },
  { label: "공고 질문", to: "/chat", children: [["공고문 궁금한 점 묻기", "/chat"]] },
  { label: "커뮤니티", to: "/community", children: [["내 지역·전국 연합 게시판", "/community"]] },
];

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const email = useSelector((state) => state.user.email);
  const userId = useSelector((state) => state.user.id);

  // 내 정보 입력(온보딩) 화면은 상단 메뉴 없이 전체 화면으로 보여준다.
  if (pathname === "/start") {
    return <main className="app-full">{children}</main>;
  }

  return (
    <div className={`app-shell${pathname.startsWith("/community") ? " community-shell" : ""}`}>
      <div className="util-bar">
        <span>청약홈·LH·SH 공고를 한곳에서</span>
        <Link to="/start">{userId ? `${email} · 내 정보` : "내 정보 입력"}</Link>
      </div>
      <header className="app-header">
        <NavLink to="/" className="brand">
          청약 전략 플랫폼
        </NavLink>
        <nav className="gnb">
          {MENUS.map((menu) => (
            <div key={menu.label} className="gnb-item">
              <NavLink to={menu.to}>{menu.label}</NavLink>
              <ul className="gnb-sub">
                {menu.children.map(([text, to]) => (
                  <li key={to}>
                    <Link to={to}>{text}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <Link to={userId ? "/dashboard" : "/start"} className="btn header-cta">
          {userId ? "내 추천 공고" : "맞춤 추천 받기"}
        </Link>
      </header>
      <main className="app-content">{children}</main>
      <footer className="app-footer">
        <div className="footer-inner">
          <b>청약 전략 플랫폼</b>
          <p>
            공고 데이터 출처: 청약홈, LH, SH, 금융감독원. 자격·위치(상/중/하)는 참고용이며
            실제 당첨과 대출 승인을 보장하지 않습니다. 정확한 내용은 공고문 원문을 확인하세요.
          </p>
        </div>
      </footer>
    </div>
  );
}
