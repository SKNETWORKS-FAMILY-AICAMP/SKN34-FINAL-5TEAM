import { useState } from "react";
import { useSelector } from "react-redux";

import { fetchCommute } from "../api/client";

const LEG_ICON = { subway: "🚇", bus: "🚌", walk: "🚶" };
const LEG_NAME = { subway: "지하철", bus: "버스", walk: "도보" };

function formatDistance(meters) {
  if (meters == null) return "-";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}

function formatMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}시간 ${m}분` : `${m}분`;
}

// 한 경로의 구간별 교통편 (도보 → 지하철 → 버스 …)
function LegList({ legs }) {
  return (
    <ol className="leg-list">
      {legs.map((leg, i) => (
        <li key={i} className={`leg-row ${leg.kind}`}>
          <span className="leg-icon">{LEG_ICON[leg.kind] || "•"}</span>
          <div className="leg-body">
            <b>
              {LEG_NAME[leg.kind] || "이동"}
              {leg.line ? ` · ${leg.line}` : ""}
            </b>
            {leg.start && leg.end && (
              <span className="muted small">
                {leg.start} → {leg.end}
                {leg.stations ? ` (${leg.stations}개 정거장)` : ""}
              </span>
            )}
          </div>
          <span className="leg-min">{leg.minutes}분</span>
        </li>
      ))}
    </ol>
  );
}

function errorText(err) {
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return "출발지와 도착지 주소를 모두 입력해 주세요.";
  return "경로를 불러오지 못했습니다. 서버가 켜져 있는지 확인해 주세요.";
}

// 출발지·도착지 주소를 입력하면 거리, 교통편, 소요시간을 조회한다. (로그인 없이 누구나)
export default function CommutePage() {
  const savedHome = useSelector((state) => state.user.homeAddress);
  const savedWork = useSelector((state) => state.user.workplaceAddress);
  const [origin, setOrigin] = useState(savedHome || "");
  const [destination, setDestination] = useState(savedWork || "");
  const [status, setStatus] = useState("idle"); // idle | loading | ok | failed
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(0);

  const search = async (e) => {
    e.preventDefault();
    if (!origin.trim() || !destination.trim()) {
      setStatus("failed");
      setError("출발지와 도착지 주소를 모두 입력해 주세요.");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const res = await fetchCommute({ origin_address: origin.trim(), destination_address: destination.trim() });
      setResult(res.data);
      setSelected(0);
      setStatus("ok");
    } catch (err) {
      setError(errorText(err));
      setStatus("failed");
    }
  };

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const routes = result ? [result, ...(result.alternatives || [])] : [];
  const current = routes[selected];

  return (
    <div className="col">
      <h2 className="section-title">출퇴근 경로 조회</h2>

      <form className="card commute-form" onSubmit={search}>
        <label className="commute-field">
          <span className="field-label">출발지</span>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="주소 입력 (예: 서울 관악구 신림로 330)"
          />
        </label>
        <button type="button" className="swap-btn" onClick={swap} aria-label="출발지와 도착지 바꾸기">
          ⇄
        </button>
        <label className="commute-field">
          <span className="field-label">도착지</span>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="주소 입력 (예: 서울 강남구 테헤란로 152)"
          />
        </label>
        <button type="submit" className="btn" disabled={status === "loading"}>
          {status === "loading" ? "조회 중..." : "경로 조회"}
        </button>
      </form>

      {status === "failed" && <p className="error">{error}</p>}
      {status === "idle" && (
        <div className="card empty">출발지와 도착지 주소를 입력하면 대중교통 거리, 교통편, 소요시간을 알려드려요.</div>
      )}

      {status === "ok" && current && (
        <>
          {routes.length > 1 && (
            <div className="tabs">
              {routes.map((r, i) => (
                <button type="button" key={i} className={i === selected ? "tab on" : "tab"} onClick={() => setSelected(i)}>
                  {i === 0 ? "추천 경로" : `대안 ${i}`} · {formatMinutes(r.total_minutes)}
                </button>
              ))}
            </div>
          )}

          <div className="summary-grid">
            <div className="card">
              <div className="muted small">소요시간</div>
              <div className="summary-big">{formatMinutes(current.total_minutes)}</div>
            </div>
            <div className="card">
              <div className="muted small">이동 거리</div>
              <div className="summary-big">{formatDistance(current.distance_m)}</div>
              <div className="muted small">직선거리 {formatDistance(result.straight_distance_m)}</div>
            </div>
            <div className="card">
              <div className="muted small">환승</div>
              <div className="summary-big">{current.transfers}회</div>
            </div>
            <div className="card">
              <div className="muted small">요금</div>
              <div className="summary-big">{current.fare ? `${current.fare.toLocaleString()}원` : "-"}</div>
            </div>
          </div>

          <div className="two-col">
            <section className="card">
              <div className="card-title">교통편</div>
              <LegList legs={current.legs} />
              {(result.origin.approximate || result.destination.approximate) && (
                <p className="field-hint">주소를 정확히 찾지 못해 대략적인 위치로 계산했을 수 있어요. 도로명 주소로 입력하면 더 정확합니다.</p>
              )}
            </section>
            <aside className="card">
              <div className="card-title">찾은 위치</div>
              <dl className="kv">
                <dt>출발</dt>
                <dd>{result.origin.label}</dd>
                <dt>도착</dt>
                <dd>{result.destination.label}</dd>
              </dl>
            </aside>
          </div>
          <p className="field-hint">추천 경로 기준이며, 시간대·배차에 따라 달라질 수 있습니다.</p>
        </>
      )}
    </div>
  );
}
