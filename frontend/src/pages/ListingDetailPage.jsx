import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";

import { fetchListing } from "../api/client";
import CommuteSection from "../components/CommuteSection";
import { regionName } from "../constants/regions";
import { ddayLabel, formatShortDate, formatWon } from "../utils/format";

const BAND_CLASS = { 상: "hi", 중: "mid", 하: "lo" };
const QUICK_QUESTIONS = ["전매 제한 기간이 얼마나 돼요?", "거주 의무가 있나요?", "계약금은 언제 내요?"];

function Timeline({ listing }) {
  const points = [
    ["접수 시작", listing.receipt_start, listing.days_until_receipt_start],
    ["접수 마감", listing.receipt_end, listing.days_until_receipt_end],
    ["당첨자 발표", listing.announce_date, listing.days_until_announce],
    ["입주 예정", listing.move_in_date, null],
  ];
  // 아직 지나지 않은 첫 일정을 "현재 단계"로 표시한다.
  const nowIndex = points.findIndex(([, , d]) => d != null && d >= 0);

  return (
    <ol className="timeline">
      {points.map(([label, date, days], i) => (
        <li
          key={label}
          className={i === nowIndex ? "now" : days != null && days < 0 ? "done" : ""}
        >
          <i />
          <b>{label}</b>
          <span>{date ? formatShortDate(date) : "미정"}</span>
        </li>
      ))}
    </ol>
  );
}

// 기획안 4장 화면 ③ 공고 상세 (PC 시안 03: 본문 + 고정 사이드형)
export default function ListingDetailPage() {
  const { id } = useParams();
  const user = useSelector((state) => state.user);
  const recommendation = useSelector((state) =>
    state.listings.items.find((i) => String(i.listing.id) === String(id))
  );
  const [listing, setListing] = useState(null);
  const [error, setError] = useState(null);
  const [checked, setChecked] = useState({});

  useEffect(() => {
    setListing(null);
    setError(null);
    fetchListing(id)
      .then((res) => setListing(res.data))
      .catch((err) => setError(err.response?.status === 404 ? "공고를 찾을 수 없습니다." : err.message));
  }, [id]);

  if (error) return <p className="error">불러오기 실패: {error}</p>;
  if (!listing) return <p className="muted">공고를 불러오는 중...</p>;

  const assets = Number(user.availableAssets) || 0;
  const deposit = listing.contract_deposit;
  const price = listing.sale_price;
  const docs = listing.required_documents || [];
  const doneCount = docs.filter((d) => checked[d]).length;
  const dday = ddayLabel(listing);
  const depositPct = price && deposit != null ? Math.min(100, (deposit / price) * 100) : null;

  return (
    <div className="two-col">
      <section className="col main">
        <div className="card">
          <div className="muted small">
            <Link to="/dashboard">대시보드</Link> › 공고 상세
          </div>
          <div className="row wrap">
            <h2 className="detail-title">{listing.complex_name}</h2>
            <div className="chip-group">
              {recommendation &&
                (recommendation.eligible ? (
                  <span className="chip ok">자격 가능</span>
                ) : (
                  <span className="chip no">자격 불가능</span>
                ))}
              {recommendation?.eligible && BAND_CLASS[recommendation.percentile_band] && (
                <span className={`chip ${BAND_CLASS[recommendation.percentile_band]}`}>
                  내 위치 {recommendation.percentile_band}
                </span>
              )}
              <span className={dday.urgent ? "chip dday" : "chip lo"}>{dday.text}</span>
            </div>
          </div>
          <div className="muted">
            {regionName(listing.region_code)}
            {listing.address ? ` · ${listing.address}` : ""} · {listing.supply_type}
            {listing.unit_size_sqm ? ` · ${listing.unit_size_sqm}㎡` : ""} · 총 {listing.unit_count}세대
          </div>
          {listing.notice_url && (
            <a href={listing.notice_url} target="_blank" rel="noreferrer" className="small">
              공고문 원문 보기 ↗
            </a>
          )}
        </div>

        <div className="card">
          <div className="card-title">청약 일정</div>
          <Timeline listing={listing} />
        </div>

        <div className="card">
          <div className="row">
            <div className="card-title">분양가 {price ? formatWon(price) : "미정"}</div>
          </div>
          {depositPct != null ? (
            <>
              <div className="bar">
                <div style={{ width: `${depositPct}%`, background: "var(--blue)" }}>계약금</div>
                <div style={{ width: `${100 - depositPct}%`, background: "var(--blue-light)" }}>
                  중도금·잔금
                </div>
              </div>
              <dl className="kv">
                <dt>계약금 (내 돈으로 먼저)</dt>
                <dd>
                  <b>{formatWon(deposit)}</b>
                </dd>
                <dt>중도금·잔금 (대출 등)</dt>
                <dd>{formatWon(price - deposit)}</dd>
              </dl>
            </>
          ) : (
            <p className="muted">
              {listing.deposit_status === "later"
                ? "추후공지"
                : listing.deposit_status === "none"
                  ? "공고에 비율 없음"
                  : "공고 확인 전"}
            </p>
          )}
        </div>

        <CommuteSection listing={listing} />
      </section>

      <aside className="col side-right wide">
        <div className="card">
          <div className="card-title">내 자금으로 가능할까?</div>
          {assets > 0 && deposit != null ? (
            <>
              <dl className="kv">
                <dt>계약금</dt>
                <dd>
                  <b>{formatWon(deposit)}</b>
                </dd>
                <dt>내 가용자산</dt>
                <dd>{formatWon(assets)}</dd>
              </dl>
              <hr />
              <dl className="kv">
                <dt>계약금 후 여유</dt>
                <dd className={assets >= deposit ? "good" : "bad"}>
                  <b>
                    {assets >= deposit ? "+" : ""}
                    {formatWon(assets - deposit)}
                  </b>
                </dd>
                {price ? (
                  <>
                    <dt>입주까지 부족</dt>
                    <dd className="bad">
                      <b>{formatWon(Math.max(0, price - assets))}</b>
                    </dd>
                  </>
                ) : null}
              </dl>
            </>
          ) : (
            <p className="muted small">
              {assets > 0 ? "계약금 정보가 없습니다." : "내 정보에서 가용자산을 입력하면 비교해 드려요."}
            </p>
          )}
          <Link to={`/loans?listingId=${listing.id}`} className="btn">
            자금 계획 보기 →
          </Link>
          <Link to={`/listings/${listing.id}/ai`} className="btn ghost">
            AI 공고 분석 보기 →
          </Link>
        </div>

        <div className="card">
          <div className="card-title">
            준비 서류{" "}
            <span className="muted small">
              {doneCount} / {docs.length}
            </span>
          </div>
          {docs.length === 0 && <p className="muted small">등록된 서류 정보가 없습니다.</p>}
          {docs.map((doc) => (
            <label key={doc} className="check">
              <input
                type="checkbox"
                checked={Boolean(checked[doc])}
                onChange={() => setChecked((prev) => ({ ...prev, [doc]: !prev[doc] }))}
              />
              {doc}
            </label>
          ))}
        </div>

        <div className="card">
          <div className="card-title">공고에 대해 물어보기</div>
          <div className="chip-group">
            {QUICK_QUESTIONS.map((q) => (
              <Link key={q} to={`/chat?listingId=${listing.id}&q=${encodeURIComponent(q)}`} className="chip lo">
                {q}
              </Link>
            ))}
          </div>
          <Link to={`/chat?listingId=${listing.id}`} className="btn ghost">
            질문하기
          </Link>
        </div>
      </aside>
    </div>
  );
}
