import { Routes, Route } from "react-router-dom";

import Layout from "./components/Layout";
import InputFormPage from "./pages/InputFormPage";
import DashboardPage from "./pages/DashboardPage";
import ListingDetailPage from "./pages/ListingDetailPage";
import LoanSimulatorPage from "./pages/LoanSimulatorPage";

// 기획안 4장 '화면 단위' 그대로 라우트 4개로 구성
function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<InputFormPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/listings/:id" element={<ListingDetailPage />} />
        <Route path="/loans" element={<LoanSimulatorPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
