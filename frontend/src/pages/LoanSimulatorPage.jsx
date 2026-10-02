import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useSearchParams } from "react-router-dom";

import { fetchLoanMatches } from "../store/loansSlice";

// 기획안 4장 화면 ④ 대출 시뮬레이션
export default function LoanSimulatorPage() {
  const dispatch = useDispatch();
  const userId = useSelector((state) => state.user.id);
  const { matches, status, error } = useSelector((state) => state.loans);
  const [searchParams] = useSearchParams();
  const listingFromQuery = searchParams.get("listingId") || "";
  const [listingId, setListingId] = useState(listingFromQuery);

  useEffect(() => {
    if (listingFromQuery) {
      setListingId(listingFromQuery);
    }
  }, [listingFromQuery]);

  useEffect(() => {
    if (!userId || !listingFromQuery) {
      return;
    }
    dispatch(fetchLoanMatches({ userId, listingId: Number(listingFromQuery) }));
  }, [dispatch, listingFromQuery, userId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userId || !listingId) {
      return;
    }
    dispatch(fetchLoanMatches({ userId, listingId: Number(listingId) }));
  };

  if (!userId) {
    return (
      <div>
        <h2>대출 시뮬레이션</h2>
        <p>대출 매칭을 하려면 먼저 내 정보를 저장해 주세요.</p>
        <Link to="/">내 정보 입력으로 이동</Link>
      </div>
    );
  }

  return (
    <div>
      <h2>대출 시뮬레이션</h2>
      <p>부족 자금에 맞는 정책대출/은행대출을 매칭합니다. (기획안 7장 3단계)</p>
      <form onSubmit={handleSubmit}>
        <label>
          공고 ID
          <input value={listingId} onChange={(e) => setListingId(e.target.value)} />
        </label>
        <button type="submit" disabled={!listingId}>대출 매칭하기</button>
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
