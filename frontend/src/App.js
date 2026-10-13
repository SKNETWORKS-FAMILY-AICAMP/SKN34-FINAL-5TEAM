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
import CommunityPage from "./pages/CommunityPage";

// 누구나: 메인, 공고 목록·상세 / 내 정보가 필요한 화면: 입력, 추천, 자금 계획, 질문
function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/listings" element={<ListingsPage />} />
        <Route path="/listings/:id" element={<ListingDetailPage />} />
        <Route path="/start" element={<InputFormPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/loans" element={<LoanSimulatorPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/commute" element={<CommutePage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/community/posts/:postId" element={<CommunityPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
