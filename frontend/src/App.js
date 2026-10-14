import { useLocation } from "react-router-dom";
import FullDemoPage from "./pages/FullDemoPage";
import LegacyApp from "./LegacyApp";

export default function App() {
  const { pathname } = useLocation();
  const legacy = window.location.pathname === "/legacy" || window.location.pathname.startsWith("/legacy/");
  return legacy ? <LegacyApp key={pathname === "/" ? "home" : "service"} /> : <FullDemoPage />;
}
