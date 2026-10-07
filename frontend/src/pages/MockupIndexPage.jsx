import { Link } from "react-router-dom";

import "../styles/mockup.css";

// 목업 화면 목록 (/mockup) — 2026.10.08 jiyoon 아이디어 목업
// 화면 파일: public/mockup-files/*.dc.html (Claude 디자인 캔버스에서 만든 목업을 그대로 옮김)
const BOARDS = [
  ["Landing", "★ 첫 페이지", "제목 · 예시 화면 3단계 · 청약 진단 시작 (스크롤 없음)"],
  ["Home", "⓪ 홈 · 단계별 진단", "6단계 진단 → 결과 미리보기 → 로그인(가입)"],
  ["Journey", "⑥ 로그인 후 · 내 청약 단계 (메인)", "진단 → 내 집 기준 → 추천 공고 담기 → 후보 비교 → 자금 · 대출 → AI 상담 → 최종 리포트 · 전체 공고 · 질의응답 · 마이페이지 · 알림 설정"],
  ["Brand", "⑦ 서비스 이름 · 로고", "청약돼?! · 청약홈 · LH · SH"],
  ["MyHome", "⑤ 맞춤 대시보드 (이전안)", "jiyoon · jinyoung 화면 합병안"],
  ["AIChat", "② AI 청약 상담 (단독)", "RAG 문서 근거 답변"],
  ["NoticeAI", "③ AI 공고문 분석 (단독)", "공고문 요약 · 내 조건 비교"],
  ["AgentReport", "④ 멀티 에이전트 전략 리포트 (단독)", "에이전트 5개가 만든 리포트"],
  ["HomeB", "⓪-B 홈 대안 · 랜딩형", "Monarch 레이아웃 참고"],
  ["Main", "(이전안) 한 페이지 진단", "모든 진단 항목을 한 페이지에"],
];

export default function MockupIndexPage() {
  return (
    <div className="mk">
      <main style={{ position: "relative", zIndex: 1, maxWidth: 1080, margin: "0 auto", padding: "40px 24px 56px" }}>
        <div style={{ color: "#FFFFFF", textShadow: "0 2px 16px rgba(6, 22, 48, 0.35)" }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>2026.10.08 · jiyoon 아이디어 목업</div>
          <h1 style={{ margin: "6px 0", fontFamily: "'Jua', 'Gothic A1', sans-serif", fontWeight: 400, fontSize: 36 }}>
            청약돼?! 목업 화면 모음
          </h1>
          <p style={{ margin: 0, color: "#EAF2FF" }}>
            디자인 캔버스의 화면을 그대로 옮겼어요 · 버튼 · 입력이 실제로 동작해요 · 데이터는 예시예요
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14, marginTop: 22 }}>
          {BOARDS.map(([id, title, desc]) => (
            <Link
              key={id}
              to={`/mockup/${id}`}
              style={{
                display: "flex", flexDirection: "column", gap: 4, padding: "16px 18px", borderRadius: 18, textDecoration: "none",
                background: id === "Journey" ? "rgba(10, 43, 94, 0.92)" : "rgba(255, 255, 255, 0.95)",
                color: id === "Journey" ? "#FFFFFF" : "#14213A", boxShadow: "0 14px 34px rgba(6, 22, 48, 0.18)",
              }}
            >
              <b style={{ fontSize: 16 }}>{title}</b>
              <span style={{ fontSize: 13, opacity: 0.8 }}>{desc}</span>
              <span style={{ fontSize: 12, opacity: 0.6 }}>/mockup/{id}</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
