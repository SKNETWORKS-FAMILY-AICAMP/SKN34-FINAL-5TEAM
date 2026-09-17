import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { fetchRecommendations } from "../store/listingsSlice";

// 기획안 4장 화면 ② 추천 대시보드
export default function DashboardPage() {
  const dispatch = useDispatch();
  const { items, status, error } = useSelector((state) => state.listings);

  useEffect(() => {
    // TODO: 실제 로그인/세션에서 user_id를 가져오도록 교체
    const placeholderUserId = 1;
    dispatch(fetchRecommendations(placeholderUserId));
  }, [dispatch]);

  if (status === "loading") return <p>추천 공고를 불러오는 중...</p>;
  if (status === "failed") return <p>불러오기 실패: {error}</p>;

  return (
    <div>
      <h2>추천 대시보드</h2>
      <p>자격을 충족하는 공고를 과거 유사 단지 대비 위치(구간)와 함께 보여줍니다.</p>
      {items.length === 0 && <p>아직 데이터가 없습니다. 백엔드에 공고 데이터를 먼저 적재해주세요.</p>}
      <ul>
        {items.map((item) => (
          <li key={item.listing.id}>
            <Link to={`/listings/${item.listing.id}`}>{item.listing.complex_name}</Link>
            {" — "}
            자격: {item.eligible ? "충족" : "미충족"} / 내 가점: {item.score}점 / 위치: {item.percentile_band}
          </li>
        ))}
      </ul>
    </div>
  );
}
