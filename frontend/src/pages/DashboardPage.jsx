import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";

import { regionName } from "../constants/regions";
import { fetchRecommendations } from "../store/listingsSlice";
import { daysLeft, ddayLabel, formatShortDate, formatWon } from "../utils/format";

const SORTS = [
  ["deadline", "마감 임박순"],
  ["deposit", "계약금 낮은순"],
  ["band", "내 위치순"],
];
const BAND_ORDER = { 상: 0, 중: 1, 하: 2 };
const BAND_CLASS = { 상: "hi", 중: "mid", 하: "lo" };

function ListingCard({ item, assets }) {
  const { listing, eligible, percentile_band: band } = item;
  const dday = ddayLabel(listing);
  const overBudget =
    eligible && assets > 0 && listing.contract_deposit != null && listing.contract_deposit > assets;
  const dimmed = !eligible || overBudget;

  return (
    <Link to={`/listings/${listing.id}`} className={dimmed ? "listing-card dimmed" : "listing-card"}>
      <div className="row">
        {eligible ? (
          overBudget ? (
            <span className="chip no">자금 초과</span>
          ) : (
            <span className="chip ok">자격 가능</span>
          )
        ) : (
          <span className="chip no">자격 불가능</span>
        )}
        <span className={dday.urgent ? "chip dday" : "chip lo"}>{dday.text}</span>
      </div>
      <h3>{listing.complex_name}</h3>
      <div className="muted small">
        {regionName(listing.region_code)} · {listing.unit_size_sqm ? `${listing.unit_size_sqm}㎡ · ` : ""}
        {listing.supply_type}
      </div>
      <dl className="kv">
        <dt>분양가</dt>
        <dd>{listing.sale_price ? formatWon(listing.sale_price) : "미정"}</dd>
        <dt>
          계약금 {listing.deposit_is_estimate && <span className="muted small">(가정치)</span>}
        </dt>
        <dd>
          <b>{listing.contract_deposit != null ? formatWon(listing.contract_deposit) : "미정"}</b>
        </dd>
      </dl>
      {!eligible ? (
        <p className="warn small">자격 조건 미충족</p>
      ) : overBudget ? (
        <p className="warn small">계약금이 가용자산보다 많아요</p>
      ) : BAND_CLASS[band] ? (
        <div className="row">
          <span className="muted small">내 위치</span>
          <span className={`chip ${BAND_CLASS[band]}`}>{band}</span>
        </div>
      ) : null}
    </Link>
  );
}

// 기획안 4장 화면 ② 추천 대시보드 (PC 시안 02: 필터 + 카드 그리드형)
export default function DashboardPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.user);
  const { items, status, error } = useSelector((state) => state.listings);

  const [supplyFilter, setSupplyFilter] = useState([]);
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [withinBudget, setWithinBudget] = useState(false);
  const [sort, setSort] = useState("deadline");

  const userId = user.id;
  const assets = Number(user.availableAssets) || 0;

  useEffect(() => {
    if (!userId) {
      navigate("/start");
      return;
    }
    dispatch(fetchRecommendations(userId));
  }, [dispatch, navigate, userId]);

  const supplyTypes = useMemo(
    () => [...new Set(items.map((i) => i.listing.supply_type).filter(Boolean))],
    [items]
  );

  const visible = useMemo(() => {
    let list = items.filter((i) => {
      if (supplyFilter.length && !supplyFilter.includes(i.listing.supply_type)) return false;
      if (eligibleOnly && !i.eligible) return false;
      if (withinBudget && assets > 0 && (i.listing.contract_deposit ?? Infinity) > assets) return false;
      return true;
    });
    const byKey = {
      deadline: (a, b) => daysLeft(a.listing) - daysLeft(b.listing),
      deposit: (a, b) =>
        (a.listing.contract_deposit ?? Infinity) - (b.listing.contract_deposit ?? Infinity),
      band: (a, b) =>
        (a.eligible ? BAND_ORDER[a.percentile_band] ?? 3 : 4) -
        (b.eligible ? BAND_ORDER[b.percentile_band] ?? 3 : 4),
    };
    return [...list].sort(byKey[sort]);
  }, [items, supplyFilter, eligibleOnly, withinBudget, assets, sort]);

  const upcoming = useMemo(
    () =>
      items
        .map((i) => i.listing)
        .filter((l) => l.days_until_receipt_start != null && l.days_until_receipt_start >= 0 && l.days_until_receipt_start <= 7)
        .sort((a, b) => a.days_until_receipt_start - b.days_until_receipt_start)
        .slice(0, 4),
    [items]
  );

  if (!userId) return null;

  const toggleSupply = (type) =>
    setSupplyFilter((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  const months = Number(user.noHousePeriodMonths) || 0;

  return (
    <div className="three-col">
      <aside className="col side-left">
        <div className="card">
          <div className="card-title">공급 유형</div>
          {supplyTypes.length === 0 && <p className="muted small">공고가 없습니다.</p>}
          {supplyTypes.map((type) => (
            <label key={type} className="check">
              <input type="checkbox" checked={supplyFilter.includes(type)} onChange={() => toggleSupply(type)} />
              {type}
            </label>
          ))}
        </div>
        <div className="card">
          <div className="card-title">조건</div>
          <label className="check">
            <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEligibleOnly(e.target.checked)} />
            자격 가능한 공고만
          </label>
          <label className="check">
            <input type="checkbox" checked={withinBudget} onChange={(e) => setWithinBudget(e.target.checked)} />
            계약금 {assets > 0 ? `${formatWon(assets)} 이하` : "가용자산 이하"}
          </label>
        </div>
      </aside>

      <section className="col main">
        <Link to="/" className="btn ghost back-btn">
          ← 첫 화면으로
        </Link>
        <div className="row wrap">
          <h2 className="section-title">추천 공고 {visible.length}건</h2>
          <div className="chip-group">
            {SORTS.map(([key, text]) => (
              <button
                type="button"
                key={key}
                className={sort === key ? "chip dday" : "chip lo"}
                onClick={() => setSort(key)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        {status === "loading" && <p className="muted">추천 공고를 불러오는 중...</p>}
        {status === "failed" && <p className="error">불러오기 실패: {error}</p>}
        {status === "succeeded" && visible.length === 0 && (
          <div className="card empty">
            조건에 맞는 공고가 없습니다. 필터를 줄이거나 희망 지역을 바꿔 보세요.
          </div>
        )}
        <div className="card-grid">
          {visible.map((item) => (
            <ListingCard key={item.listing.id} item={item} assets={assets} />
          ))}
        </div>
      </section>

      <aside className="col side-right">
        <div className="card card-dark">
          <div className="small">내 가용자산</div>
          <div className="summary-value">{formatWon(assets)}</div>
          {assets > 0 && (
            <div className="small">
              계약금 10% 기준 <b>분양가 {formatWon(assets * 10)} 이하</b>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-title">내 청약 정보</div>
          <dl className="kv">
            <dt>청약 가점</dt>
            <dd>
              <b>{items[0] ? `${items[0].score}점` : "-"}</b>
            </dd>
            <dt>무주택</dt>
            <dd>{months ? `${Math.floor(months / 12)}년 ${months % 12}개월` : "-"}</dd>
            <dt>부양가족</dt>
            <dd>{user.dependentsCount}명</dd>
            <dt>희망 지역</dt>
            <dd>{user.desiredRegionCode ? regionName(user.desiredRegionCode) : "전체"}</dd>
          </dl>
          <Link to="/start" className="btn ghost small-btn">
            정보 수정
          </Link>
        </div>
        <div className="card">
          <div className="card-title">7일 안에 접수 시작</div>
          {upcoming.length === 0 && <p className="muted small">예정된 접수가 없습니다.</p>}
          {upcoming.map((l) => (
            <Link key={l.id} to={`/listings/${l.id}`} className="row schedule">
              <span>{l.complex_name}</span>
              <span className="chip dday">{formatShortDate(l.receipt_start)}</span>
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
}
