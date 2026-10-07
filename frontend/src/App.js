import { Routes, Route } from "react-router-dom";

import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import ListingsPage from "./pages/ListingsPage";
import InputFormPage from "./pages/InputFormPage";
import DashboardPage from "./pages/DashboardPage";
import ListingDetailPage from "./pages/ListingDetailPage";
import LoanSimulatorPage from "./pages/LoanSimulatorPage";
import ChatPage from "./pages/ChatPage";
import CommutePage from "./pages/CommutePage";
import DiagnosisPage from "./pages/DiagnosisPage";
import LandingPage from "./pages/LandingPage";
import LandingAltPage from "./pages/LandingAltPage";
import MyHomePage from "./pages/MyHomePage";
import AIChatPage from "./pages/AIChatPage";
import NoticeAIPage from "./pages/NoticeAIPage";
import ReportPage from "./pages/ReportPage";

// 누구나: 메인, 공고 목록·상세 / 내 정보가 필요한 화면: 입력, 추천, 자금 계획, 질문
// 흐름: 첫 페이지(/) → 청약 진단(/diagnosis) → 로그인(가입) → 청약 홈(/portal, jinyoung 메인)
// 목업 화면: 내 맞춤 대시보드(/my), 랜딩 대안(/intro),
// AI 상담(/ai-chat), 공고 AI 분석(/listings/:id/ai), 전략 리포트(/report)
function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/diagnosis" element={<DiagnosisPage />} />
        <Route path="/my" element={<MyHomePage />} />
        <Route path="/intro" element={<LandingAltPage />} />
        <Route path="/ai-chat" element={<AIChatPage />} />
        <Route path="/listings/:id/ai" element={<NoticeAIPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/portal" element={<HomePage />} />
        <Route path="/listings" element={<ListingsPage />} />
        <Route path="/listings/:id" element={<ListingDetailPage />} />
        <Route path="/start" element={<InputFormPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/loans" element={<LoanSimulatorPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/commute" element={<CommutePage />} />
      </Routes>
    </Layout>
  );
}

export default App;
