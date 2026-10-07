import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { mountBoard, parseBoard } from "../mockup/dcRuntime";

// 목업 화면 한 장 (/mockup/:board) — public/mockup-files/<board>.dc.html 을 그대로 그린다.
// 예) /mockup/Journey = 로그인 후 6단계 진행 화면, /mockup/Landing = 첫 페이지
const BASE = `${process.env.PUBLIC_URL}/mockup-files`;

export default function MockupBoardPage() {
  const { board = "Journey" } = useParams();
  const navigate = useNavigate();
  const ref = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cleanup = () => {};
    let alive = true;
    setError("");
    fetch(`${BASE}/${board}.dc.html`)
      .then((res) => {
        if (!res.ok) throw new Error(`${board} 화면 파일을 찾을 수 없어요 (${res.status})`);
        return res.text();
      })
      .then((html) => {
        if (!alive || !ref.current) return;
        const parsed = parseBoard(html, BASE);
        document.title = parsed.title || "청약돼?! 목업";
        window.scrollTo(0, 0);
        cleanup = mountBoard(ref.current, parsed, (next) => navigate(`/mockup/${next}`));
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
      cleanup();
    };
  }, [board, navigate]);

  return (
    <>
      {error && (
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          <p>{error}</p>
          <Link to="/mockup">목업 화면 목록으로</Link>
        </div>
      )}
      <div ref={ref} />
      <Link
        to="/mockup"
        style={{
          position: "fixed", left: 16, bottom: 16, zIndex: 50, padding: "8px 14px", borderRadius: 999,
          background: "rgba(10, 43, 94, 0.85)", color: "#FFFFFF", fontSize: 13, fontWeight: 700, textDecoration: "none",
        }}
      >
        ☰ 목업 화면 목록
      </Link>
    </>
  );
}
