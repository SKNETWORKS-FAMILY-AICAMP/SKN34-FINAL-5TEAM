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
      <p>
        계약금:{" "}
        {listing.contract_deposit != null
          ? `${listing.contract_deposit.toLocaleString()}원`
          : "미정"}
        {listing.deposit_is_estimate ? " (공고 기준 가정치 10%)" : ""}
      </p>
      <p>접수기간: {listing.receipt_start} ~ {listing.receipt_end}</p>
      <p>
        D-day 접수시작 {listing.days_until_receipt_start ?? "-"} / 마감{" "}
        {listing.days_until_receipt_end ?? "-"} / 발표 {listing.days_until_announce ?? "-"}
      </p>
      <p>발표일: {listing.announce_date}</p>
      <h3>준비 서류</h3>
      <ul>
        {(listing.required_documents || []).map((doc) => (
          <li key={doc}>{doc}</li>
        ))}
      </ul>
      <ListingQuestion listingId={listing.id} />
      <Link to={`/loans?listingId=${listing.id}`}>이 공고 기준으로 대출 시뮬레이션 하기 →</Link>
    </div>
  );
}

function ListingQuestion({ listingId }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const ask = () => {
    apiClient
      .post("/chat/", { question, listing_id: listingId })
      .then((res) => setAnswer(res.data.answer))
      .catch((err) => setAnswer(err.message));
  };

  return (
    <section>
      <h3>이 공고에 대해 질문</h3>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} />
      <button type="button" onClick={ask}>
        묻기
      </button>
      {answer ? <p>{answer}</p> : null}
    </section>
  );
}
