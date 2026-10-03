import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { fetchCommute } from "../api/client";

const LEG_ICON = { subway: "🚇", bus: "🚌", walk: "🚶" };

function errorText(err) {
  const detail = err.response?.data?.detail;
  return typeof detail === "string" ? detail : "경로를 불러오지 못했습니다.";
}

function RouteCard({ title, result }) {
  if (!result) return null;
  if (result.status === "loading") {
    return (
      <div className="route-card">
        <div className="route-title">{title}</div>
        <p className="muted small">경로를 찾는 중...</p>
      </div>
    );
  }
  if (result.status === "failed") {
    return (
      <div className="route-card">
        <div className="route-title">{title}</div>
        <p className="error small">{result.error}</p>
      </div>
    );
  }
  const r = result.data;
  return (
    <div className="route-card">
      <div className="route-title">{title}</div>
      <div className="route-time">
        {r.total_minutes}
        <span>분</span>
      </div>
      <div className="muted small route-addr">
        {r.origin.label} → {r.destination.label}
      </div>
      <div className="muted small">
        환승 {r.transfers}회{r.fare ? ` · ${r.fare.toLocaleString()}원` : ""}
      </div>
      <div className="legs">
        {r.legs.map((leg, i) => (
          <span key={i} className={`leg ${leg.kind}`}>
            {LEG_ICON[leg.kind] || "•"} {leg.line ? `${leg.line} ` : ""}
            {leg.minutes}분
          </span>
        ))}
      </div>
      {r.origin.approximate && <p className="field-hint">출발 위치는 대략적인 위치({r.origin.label})입니다.</p>}
    </div>
  );
}

// 공고 상세의 출퇴근 비교: 이 단지 → 직장 vs 현재 집 → 직장
export default function CommuteSection({ listing }) {
  const workplace = useSelector((state) => state.user.workplaceAddress?.trim());
  const home = useSelector((state) => state.user.homeAddress?.trim());
  const [fromListing, setFromListing] = useState(null);
  const [fromHome, setFromHome] = useState(null);

  useEffect(() => {
    if (!workplace) return undefined;
    let cancelled = false;
    const run = (payload, setter) => {
      setter({ status: "loading" });
      fetchCommute(payload)
        .then((res) => !cancelled && setter({ status: "ok", data: res.data }))
        .catch((err) => !cancelled && setter({ status: "failed", error: errorText(err) }));
    };
    run({ origin_listing_id: listing.id, destination_address: workplace }, setFromListing);
    if (home) run({ origin_address: home, destination_address: workplace }, setFromHome);
    else setFromHome(null);
    return () => {
      cancelled = true;
    };
  }, [listing.id, workplace, home]);

  if (!workplace) {
    return (
      <div className="card">
        <div className="card-title">출퇴근</div>
        <p className="muted small">직장 주소를 입력하면 이 단지에서 직장까지 대중교통 시간을 알려드려요.</p>
        <Link to="/start" className="btn ghost small-btn">
          직장 주소 입력하기
        </Link>
      </div>
    );
  }

  const listingData = fromListing?.status === "ok" ? fromListing.data : null;
  const homeData = fromHome?.status === "ok" ? fromHome.data : null;
  const diff = listingData && homeData ? homeData.total_minutes - listingData.total_minutes : null;

  return (
    <div className="card">
      <div className="row">
        <div className="card-title">출퇴근 (대중교통)</div>
        <span className="muted small">직장: {workplace}</span>
      </div>
      {diff != null && (
        <p className={`commute-diff ${diff >= 0 ? "good" : "bad"}`}>
          {diff === 0
            ? "지금 집과 출퇴근 시간이 같아요."
            : diff > 0
              ? `이 단지가 지금보다 출퇴근 ${diff}분 더 짧아요.`
              : `이 단지가 지금보다 출퇴근 ${-diff}분 더 길어요.`}
        </p>
      )}
      <div className="route-grid">
        <RouteCard title="이 단지 → 직장" result={fromListing} />
        {home ? (
          <RouteCard title="현재 집 → 직장" result={fromHome} />
        ) : (
          <div className="route-card muted small">
            현재 집 주소를 입력하면 지금 출퇴근 시간과 비교해 드려요. <Link to="/start">입력하기</Link>
          </div>
        )}
      </div>
      <p className="field-hint">한 번에 찾은 추천 경로 기준이며, 시간대·배차에 따라 달라질 수 있습니다.</p>
    </div>
  );
}
