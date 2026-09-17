import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { fetchLoanMatches } from "../store/loansSlice";

// 기획안 4장 화면 ④ 대출 시뮬레이션
export default function LoanSimulatorPage() {
  const dispatch = useDispatch();
  const { matches, status, error } = useSelector((state) => state.loans);
  const [listingId, setListingId] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: 실제 로그인/세션에서 user_id를 가져오도록 교체
    dispatch(fetchLoanMatches({ userId: 1, listingId: Number(listingId) }));
  };

  return (
    <div>
      <h2>대출 시뮬레이션</h2>
      <p>부족 자금에 맞는 정책대출/은행대출을 매칭합니다. (기획안 7장 3단계)</p>
      <form onSubmit={handleSubmit}>
        <label>
          공고 ID
          <input value={listingId} onChange={(e) => setListingId(e.target.value)} />
        </label>
        <button type="submit">대출 매칭하기</button>
      </form>

      {status === "loading" && <p>매칭 중...</p>}
      {status === "failed" && <p>실패: {error}</p>}
      <ul>
        {matches.map((loan) => (
          <li key={loan.id}>
            {loan.name} ({loan.category === "policy" ? "정책대출" : "은행대출"}) —
            금리 {loan.interest_rate_min}% ~ {loan.interest_rate_max}%, 한도{" "}
            {loan.limit_amount ? loan.limit_amount.toLocaleString() : "-"}원
          </li>
        ))}
      </ul>
    </div>
  );
}
