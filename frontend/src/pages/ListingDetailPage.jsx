import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import apiClient from "../api/client";

// 기획안 4장 화면 ③ 공고 상세
export default function ListingDetailPage() {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient
      .get(`/listings/${id}`)
      .then((res) => setListing(res.data))
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p>불러오기 실패: {error}</p>;
  if (!listing) return <p>불러오는 중...</p>;

  return (
    <div>
      <h2>{listing.complex_name}</h2>
      <p>지역코드: {listing.region_code}</p>
      <p>공급유형: {listing.supply_type}</p>
      <p>분양가: {listing.sale_price ? `${listing.sale_price.toLocaleString()}원` : "미정"}</p>
      <p>접수기간: {listing.receipt_start} ~ {listing.receipt_end}</p>
      <p>발표일: {listing.announce_date}</p>
      <Link to="/loans">이 공고 기준으로 대출 시뮬레이션 하기 →</Link>
    </div>
  );
}
