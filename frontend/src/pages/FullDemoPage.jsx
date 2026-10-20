import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/full-demo.css";

const SCREENS = new Set(["start", "home", "diagnosis", "result", "homes", "detail", "dashboard", "saved", "finance", "community", "post", "chat", "report", "profile", "preferences"]);

function normalizeRoute(value) {
  const route = value.replace(/^[/#]+/, "");
  return SCREENS.has(route.split("/")[0]) ? route : "start";
}

function screenFromLocation(pathname, hash) {
  if (hash) return normalizeRoute(hash);
  // localhost:3000 (/) 은 항상 첫 페이지(start: 기능 소개 + 진단 시작). 기존 메인은 /home
  if (pathname === "/") return "start";
  if (pathname.startsWith("/community/posts/")) return normalizeRoute(pathname.replace("/community/posts/", "post/"));
  return normalizeRoute(pathname);
}

function pathFromScreen(screen) {
  if (screen === "start") return "/";
  if (screen.startsWith("post/")) return `/community/posts/${screen.slice(5)}`;
  return `/${screen}`;
}

// iframe 안의 화면(public/prototype/live.js)이 부를 백엔드 주소. api/client.js와 같은 환경변수를 쓴다.
window.CY_API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";

// Keep the hosted prototype's complete UI and interactions together, isolated from legacy CSS.
// Assets are part of this repository; the deployed Sites URL is not embedded or required.
export default function FullDemoPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const frame = useRef(null);
  const detach = useRef(null);
  const screen = screenFromLocation(location.pathname, location.hash);
  const initialSource = useRef(`${process.env.PUBLIC_URL || ""}/prototype/index.html#${screen}`);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    document.title = "청약돼?! · 내 집, 내 생활에 맞게";
    return () => detach.current?.();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const child = frame.current?.contentWindow;
    if (child && child.location.hash !== `#${screen}`) child.location.hash = screen;
  }, [loaded, screen]);

  function connectFrame() {
    detach.current?.();
    const child = frame.current.contentWindow;
    const syncAddress = () => {
      const route = normalizeRoute(child.location.hash);
      const nextPath = pathFromScreen(route);
      if (window.location.pathname !== nextPath || window.location.hash) navigate(nextPath, { replace: true });
    };
    child.addEventListener("hashchange", syncAddress);
    detach.current = () => child.removeEventListener("hashchange", syncAddress);
    setLoaded(true);
    syncAddress();
  }

  return <main className="full-demo">
    {!loaded && <div className="full-demo-loading" role="status">청약돼?! 화면을 불러오는 중이에요.</div>}
    <iframe ref={frame} className="full-demo-frame" src={initialSource.current} title="청약돼?! 주거·금융·커뮤니티 데모" onLoad={connectFrame} />
  </main>;
}
