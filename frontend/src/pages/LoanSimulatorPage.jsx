import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { fetchListing } from "../api/client";
import { fetchLoanMatches } from "../store/loansSlice";
import { formatWon } from "../utils/format";

const CATEGORY_TABS = [
  ["all", "전체"],
  ["policy", "정책대출"],
  ["bank", "은행"],
];

function rateText(loan) {
  const { interest_rate_min: min, interest_rate_max: max } = loan;
  if (min == null && max == null) return "-";
  if (min != null && max != null && min !== max) return `연 ${min}~${max}%`;
  return `연 ${min ?? max}%`;
}

// 기획안 4장 화면 ④ 대출 시뮬레이션 (PC 시안 04: 구성 막대 + 비교표형)
export default function LoanSimulatorPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.user);
  const recommendations = useSelector((state) => state.listings.items);
  const { matches, status, error } = useSelector((state) => state.loans);
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get("listingId") || "";

  const [listing, setListing] = useState(null);
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState([]);

  const userId = user.id;
  const assets = Number(user.availableAssets) || 0;

  useEffect(() => {
    setSelected([]);
    if (!listingId) {
      setListing(null);
      return;
    }
    fetchListing(listingId)
      .then((res) => setListing(res.data))
      .catch(() => setListing(null));
    if (userId) {
      dispatch(fetchLoanMatches({ userId, listingId: Number(listingId) }));
    }
  }, [dispatch, listingId, userId]);

  const visibleLoans = useMemo(
    () => (tab === "all" ? matches : matches.filter((l) => l.category === tab)),
    [matches, tab]
  );

  if (!userId) {
    return (
      <div className="card empty">
        <p>대출 매칭을 하려면 먼저 내 정보를 저장해 주세요.</p>
        <Link to="/start" className="btn">
          내 정보 입력으로 이동
        </Link>
      </div>
    );
  }

  const price = listing?.sale_price || 0;
  const ownMoney = Math.min(assets, price);
  const shortfall = Math.max(0, price - assets);
  const chosen = matches.filter((l) => selected.includes(l.id));
  const policyAmount = chosen
    .filter((l) => l.category === "policy")
    .reduce((sum, l) => sum + (l.limit_amount || 0), 0);
  const policyCovered = Math.min(policyAmount, shortfall);
  const bankChosen = chosen.some((l) => l.category !== "policy");
  // 은행 대출은 한도 정보가 없는 경우가 많아, 선택하면 남은 금액을 은행 대출로 본다.
  const bankCovered = bankChosen ? shortfall - policyCovered : 0;
  const remaining = shortfall - policyCovered - bankCovered;
  const pct = (v) => (price ? `${(v / price) * 100}%` : "0%");

  const toggle = (loanId) =>
    setSelected((prev) => (prev.includes(loanId) ? prev.filter((x) => x !== loanId) : [...prev, loanId]));

  return (
    <div className="col">
      <div className="card">
        <div className="row wrap">
          <div>
            <label className="muted small">
              공고 선택{" "}
              <select value={listingId} onChange={(e) => navigate(`/loans?listingId=${e.target.value}`)}>
                <option value="">공고를 선택하세요</option>
                {recommendations.map((i) => (
                  <option key={i.listing.id} value={i.listing.id}>
                    {i.listing.complex_name}
                  </option>
                ))}
                {listing && !recommendations.some((i) => i.listing.id === listing.id) && (
                  <option value={listing.id}>{listing.complex_name}</option>
                )}
              </select>
            </label>
            <div className="summary-title">
              {listing ? `입주까지 필요한 돈 ${price ? formatWon(price) : "(분양가 미정)"}` : "공고를 선택하면 자금 계획을 보여드려요"}
            </div>
          </div>
          {listing && price > 0 && (
            <div className="row stat-group">
              <div>
                <div className="muted small">대출로 메울 금액</div>
                <b className="stat">{formatWon(shortfall)}</b>
              </div>
              <div>
                <div className="muted small">남는 부족 금액</div>
                <b className={remaining > 0 ? "stat bad" : "stat good"}>{formatWon(remaining)}</b>
              </div>
            </div>
          )}
        </div>
        {listing && price > 0 && (
          <>
            <div className="bar tall">
              {ownMoney > 0 && <div style={{ width: pct(ownMoney), background: "var(--bar-own)" }}>내 돈 {formatWon(ownMoney)}</div>}
              {policyCovered > 0 && <div style={{ width: pct(policyCovered), background: "var(--blue)" }}>정책대출 {formatWon(policyCovered)}</div>}
              {bankCovered > 0 && <div style={{ width: pct(bankCovered), background: "var(--blue-light)" }}>은행대출 {formatWon(bankCovered)}</div>}
              {remaining > 0 && <div style={{ width: pct(remaining), background: "var(--gray-bar)" }}>부족 {formatWon(remaining)}</div>}
            </div>
            <p className="field-hint">아래 표에서 상품을 선택하면 막대가 바뀝니다. 정책대출은 한도까지, 은행대출은 남은 금액을 채운다고 가정합니다.</p>
          </>
        )}
      </div>

      <div className="two-col">
        <section className="card main">
          <div className="row">
            <div className="card-title">대출 상품 비교</div>
            <div className="chip-group">
              {CATEGORY_TABS.map(([key, text]) => (
                <button type="button" key={key} className={tab === key ? "chip dday" : "chip lo"} onClick={() => setTab(key)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
          {!listingId && <p className="muted">위에서 공고를 선택하세요.</p>}
          {status === "loading" && <p className="muted">대출 상품을 찾는 중...</p>}
          {status === "failed" && <p className="error">불러오기 실패: {error}</p>}
          {status === "succeeded" && visibleLoans.length === 0 && <p className="muted">조건에 맞는 상품이 없습니다.</p>}
          {visibleLoans.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>상품</th>
                  <th>구분</th>
                  <th>금리</th>
                  <th>한도</th>
                </tr>
              </thead>
              <tbody>
                {visibleLoans.map((loan) => (
                  <tr key={loan.id} className={selected.includes(loan.id) ? "selected" : ""} onClick={() => toggle(loan.id)}>
                    <td>
                      <input type="checkbox" readOnly checked={selected.includes(loan.id)} />
                    </td>
                    <td>
                      <b>{loan.name}</b>
                    </td>
                    <td>{loan.category === "policy" ? "정책" : "은행"}</td>
                    <td>{rateText(loan)}</td>
                    <td>{loan.limit_amount ? formatWon(loan.limit_amount) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="field-hint">금리·한도는 공시 기준 참고값이며 실제 심사 결과와 다를 수 있습니다. 소득·지역 조건은 아직 반영 전입니다.</p>
        </section>

        <aside className="col side-right wide">
          <div className="card card-warm">
            <div className="card-title">받을 수 있는 지원금</div>
            <p className="muted small">지원금 정보는 준비 중입니다. 신혼부부·생애최초 지원 데이터를 연결할 예정입니다.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
