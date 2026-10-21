import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";

import MockupShell, { SparkIcon } from "../components/MockupShell";
import { regionName } from "../constants/regions";
import { SAMPLE_LISTINGS } from "../constants/sampleListings";
import { setDiagnosisField } from "../store/diagnosisSlice";
import { fetchRecommendations } from "../store/listingsSlice";
import { ACCOUNT_SHORT, calcRank1, calcScore, calcSpecial, parseConditions } from "../utils/diagnosis";
import { daysLeft, ddayLabel, formatShortDate, formatWon } from "../utils/format";
import "../styles/mockup.css";

// 로그인 후 내 맞춤 대시보드(/my)
// 팀원 추천 대시보드(DashboardPage: 필터 + 공고 카드 + 내 정보)와 목업 디자인(하늘 배경 · 유리 카드 · AI 판정)을 합친 화면
const PEER_AVG = 31; // 비슷한 조건 평균 가점 — 예시값 (사용자 통계 연결 전)
const SORTS = [
  ["deadline", "마감 임박순"],
  ["deposit", "계약금 낮은순"],
  ["band", "내 위치순"],
];
const BAND_ORDER = { 상: 0, 중: 1, 하: 2 };
const BAND_TONE = { 상: "mk-band-hi", 중: "mk-band-mid", 하: "mk-band-lo" };
const QUICK = [
  ["/listings", "공고 둘러보기"],
  ["/loans", "자금 계획"],
  ["/commute", "출퇴근 조회"],
  ["/chat", "AI에게 공고 질문"],
  ["/report", "AI 전략 리포트"],
];

function depositText(listing) {
  if (listing.contract_deposit != null) return formatWon(listing.contract_deposit);
  if (listing.deposit_status === "later") return "추후공지";
  if (listing.deposit_status === "none") return "공고에 비율 없음";
  return "공고 확인 전";
}

// 공고 한 건에 대한 AI 한 줄 평 (진단 결과 기준 규칙 — LLM 판정 연결 전)
function aiLine(item, assets, special, rank1) {
  const { listing, eligible } = item;
  if (eligible === false) return "자격 조건 미충족";
  if (assets > 0 && listing.contract_deposit != null && listing.contract_deposit > assets) return "계약금이 가용자산보다 많아요";
  const ok = special.filter((s) => s.status === "ok").map((s) => s.label);
  const type = listing.supply_type || "";
  if (type.includes("신혼") && ok.includes("신혼부부")) return "신혼부부 특별공급 대상";
  if (/임대/.test(type) && ok.includes("신혼부부")) return "신혼부부 우선공급 대상";
  if (ok.includes("생애최초") && /APT|분양/.test(type)) return "생애최초 특별공급 신청 가능";
  return rank1.badge.text;
}

export default function MyHomePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.user);
  const d = useSelector((state) => state.diagnosis);
  const { items: apiItems, status } = useSelector((state) => state.listings);

  const [supplyFilter, setSupplyFilter] = useState([]);
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [budgetOnly, setBudgetOnly] = useState(false);
  const [sort, setSort] = useState("deadline");
  const [addText, setAddText] = useState("");

  const userId = user.id;

  // 로그인(진단 저장) 전에는 진단 화면으로 보낸다.
  useEffect(() => {
    if (!userId) {
      navigate("/diagnosis");
      return;
    }
    dispatch(fetchRecommendations(userId));
  }, [dispatch, navigate, userId]);

  // 서버가 꺼져 있으면 화면 확인용 예시 공고로 보여준다 (자격 판정 없음).
  const usingSample = status === "failed";
  const items = useMemo(
    () => (usingSample ? SAMPLE_LISTINGS.map((listing) => ({ listing, eligible: null, percentile_band: null, score: null })) : apiItems),
    [usingSample, apiItems]
  );

  const assets = Number(user.availableAssets) || d.assets * 10_000_000;
  const score = calcScore(d);
  const rank1 = calcRank1(d);
  const special = calcSpecial(d);
  const okSpecial = special.filter((s) => s.status === "ok").map((s) => s.label);

  const supplyTypes = useMemo(() => [...new Set(items.map((i) => i.listing.supply_type).filter(Boolean))], [items]);

  const visible = useMemo(() => {
    const list = items.filter((i) => {
      if (supplyFilter.length && !supplyFilter.includes(i.listing.supply_type)) return false;
      if (eligibleOnly && i.eligible === false) return false;
      if (budgetOnly && assets > 0 && (i.listing.contract_deposit ?? Infinity) > assets) return false;
      return true;
    });
    const byKey = {
      deadline: (a, b) => daysLeft(a.listing) - daysLeft(b.listing),
      deposit: (a, b) => (a.listing.contract_deposit ?? Infinity) - (b.listing.contract_deposit ?? Infinity),
      band: (a, b) =>
        (a.eligible === false ? 4 : BAND_ORDER[a.percentile_band] ?? 3) - (b.eligible === false ? 4 : BAND_ORDER[b.percentile_band] ?? 3),
    };
    return [...list].sort(byKey[sort]);
  }, [items, supplyFilter, eligibleOnly, budgetOnly, assets, sort]);

  // 맨 위 AI 판정 카드: 자격이 되는 공고 중 내 위치가 가장 좋은 1건 (진단 결과에서 미리 본 공고를 전체 공개)
  const pick = useMemo(() => {
    const cands = items.filter((i) => i.eligible !== false);
    return [...cands].sort((a, b) => (BAND_ORDER[a.percentile_band] ?? 3) - (BAND_ORDER[b.percentile_band] ?? 3))[0];
  }, [items]);

  const soon = useMemo(
    () =>
      items
        .map((i) => i.listing)
        .filter((l) => l.days_until_receipt_end != null && l.days_until_receipt_end >= 0 && l.days_until_receipt_end <= 7)
        .sort((a, b) => a.days_until_receipt_end - b.days_until_receipt_end)
        .slice(0, 4),
    [items]
  );

  if (!userId) return null;

  const toggleSupply = (type) =>
    setSupplyFilter((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));

  // 조건 더하기: 글에서 조건을 뽑아 기존 조건에 더한다 (utils/diagnosis.js parseConditions — LLM 연결 전 규칙)
  const conds = d.conditions || [];
  const addConditions = () => {
    const found = parseConditions(addText).filter((c) => !conds.some((x) => x.id === c.id));
    if (found.length) dispatch(setDiagnosisField({ field: "conditions", value: [...conds, ...found] }));
    dispatch(setDiagnosisField({ field: "requestText", value: [d.requestText, addText].filter(Boolean).join(" ") }));
    setAddText("");
  };

  const pickDeposit = pick?.listing.contract_deposit;

  return (
    <MockupShell>
      <main className="mk-main" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* 환영 밴드 */}
        <section className="mk-welcome">
          <div className="mk-on-photo">
            <span className="mk-badge-glass mk-glass-dark">로그인 완료 · 진단 결과가 저장됐어요</span>
            <h1 className="mk-jua" style={{ fontSize: 36, margin: "10px 0 4px" }}>
              내 조건에 맞는 공고를 모았어요
            </h1>
            <p style={{ color: "#EAF2FF" }}>진단 정보와 AI 맞춤 조건으로 공고를 골라, 자격·자금·출퇴근까지 한 번에 보여드려요</p>
          </div>
          <div className="mk-welcome-chips">
            <span className="mk-glass-dark">
              가점 <b>{score.total}점</b>
            </span>
            <span className="mk-glass-dark">
              1순위 <b>{rank1.badge.text}</b>
            </span>
            <span className="mk-glass-dark">
              특별공급 <b>{okSpecial.length ? okSpecial.join(" · ") : "해당 없음"}</b>
            </span>
          </div>
        </section>

        {/* 바로가기 (팀원 홈의 퀵메뉴) */}
        <nav className="mk-glass mk-quick" aria-label="바로가기">
          {QUICK.map(([to, label]) => (
            <Link key={to} to={to}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="mk-cols">
          {/* 왼쪽: AI 맞춤 조건 + 필터 */}
          <aside className="mk-side" style={{ flex: "1 1 230px" }} aria-label="조건과 필터">
            <section className="mk-glass mk-card" style={{ borderColor: "#CFC5F7", padding: 16 }}>
              <div className="mk-section-head" style={{ marginBottom: 10 }}>
                <h2 style={{ fontSize: 15, color: "#3A2A8C" }}>AI 맞춤 조건</h2>
                <span className="mk-tag-violet">LLM 추출</span>
              </div>
              {conds.length === 0 && <p className="mk-sub">아직 조건이 없어요. 원하는 조건을 문장으로 적어 보세요.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {conds.map((c) => (
                  <div key={c.id} className="mk-cond-mini">
                    <span className="mk-tag-violet">{c.cat}</span>
                    <span>{c.text}</span>
                  </div>
                ))}
              </div>
              <label className="mk-sub" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
                조건 더하기
                <textarea
                  className="mk-textarea"
                  rows={2}
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  placeholder="예) 강남역까지 40분 안이면 좋겠어요"
                />
              </label>
              <button type="button" className="mk-btn violet block sm" style={{ marginTop: 8 }} onClick={addConditions} disabled={!addText.trim()}>
                AI로 반영하기
              </button>
              <button type="button" className="mk-link-plain" onClick={() => navigate("/diagnosis", { state: { screen: "ai" } })}>
                조건 자세히 입력하기 ›
              </button>
            </section>

            <section className="mk-glass mk-card" style={{ padding: 16 }}>
              <h2 style={{ fontSize: 15, marginBottom: 6 }}>공급 유형</h2>
              {supplyTypes.length === 0 && <p className="mk-sub">공고가 없습니다.</p>}
              {supplyTypes.map((type) => (
                <label key={type} className="mk-check">
                  <input type="checkbox" checked={supplyFilter.includes(type)} onChange={() => toggleSupply(type)} />
                  {type}
                  <small>{items.filter((i) => i.listing.supply_type === type).length}건</small>
                </label>
              ))}
            </section>

            <section className="mk-glass mk-card" style={{ padding: 16 }}>
              <h2 style={{ fontSize: 15, marginBottom: 6 }}>조건</h2>
              <label className="mk-check">
                <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEligibleOnly(e.target.checked)} />
                자격 가능한 공고만
              </label>
              <label className="mk-check">
                <input type="checkbox" checked={budgetOnly} onChange={(e) => setBudgetOnly(e.target.checked)} />
                계약금 {formatWon(assets)} 이하
              </label>
            </section>
          </aside>

          {/* 가운데: AI 판정 + 추천 공고 */}
          <section className="mk-center-col" aria-label="추천 공고">
            {pick && (
              <article className="mk-glass mk-card mk-pick">
                <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <span className="mk-tag-violet">
                      <SparkIcon color="#FFFFFF" size={11} /> AI 판정
                    </span>
                    <span className="mk-sub">진단 결과에서 미리 본 1건 · 가입 후 전체 공개</span>
                  </div>
                  <h2 style={{ fontSize: 18, marginBottom: 6 }}>
                    {pick.listing.complex_name} — {pick.eligible === null ? "자격 확인 필요" : "신청 자격 충족"}
                  </h2>
                  <ul className="mk-pick-list">
                    <li>{okSpecial.length ? `특별공급: ${okSpecial.join(" · ")} 대상` : `1순위: ${rank1.badge.text}`}</li>
                    <li>
                      계약금 {depositText(pick.listing)}
                      {pickDeposit != null && assets > 0 ? (pickDeposit <= assets ? ` → 가용자산 ${formatWon(assets)}으로 충분` : " → 가용자산보다 많아요") : ""}
                    </li>
                    <li>
                      {regionName(pick.listing.region_code)} · {pick.listing.supply_type} · {ddayLabel(pick.listing).text}
                    </li>
                  </ul>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
                  <Link to={`/listings/${pick.listing.id}/ai`} className="mk-btn">
                    공고 AI 분석 보기
                  </Link>
                  <Link to={`/chat?listingId=${pick.listing.id}`} className="mk-btn-outline-blue">
                    이 공고 AI에게 묻기
                  </Link>
                </div>
              </article>
            )}

            <div className="mk-section-head mk-on-photo">
              <h2 style={{ fontSize: 19 }}>추천 공고 {visible.length}건</h2>
              <div className="mk-sorts">
                {SORTS.map(([key, text]) => (
                  <button key={key} type="button" aria-pressed={sort === key} className={sort === key ? "on" : ""} onClick={() => setSort(key)}>
                    {text}
                  </button>
                ))}
              </div>
            </div>

            {status === "loading" && <p className="mk-on-photo">추천 공고를 불러오는 중...</p>}
            {usingSample && (
              <p className="mk-glass mk-card mk-sub" style={{ padding: 12 }}>
                서버에 연결되지 않아 화면 확인용 예시 공고를 보여줘요. 자격 · 내 위치는 서버 연결 후 표시돼요.
              </p>
            )}
            {status === "succeeded" && visible.length === 0 && (
              <p className="mk-glass mk-card">조건에 맞는 공고가 없습니다. 필터를 줄이거나 희망 지역을 바꿔 보세요.</p>
            )}

            <div className="mk-listing-grid">
              {visible.map((item) => {
                const { listing, eligible, percentile_band: band } = item;
                const dday = ddayLabel(listing);
                const over = eligible !== false && assets > 0 && listing.contract_deposit != null && listing.contract_deposit > assets;
                return (
                  <Link key={listing.id} to={`/listings/${listing.id}`} className={eligible === false || over ? "mk-listing dim" : "mk-listing"}>
                    <span className="mk-listing-top">
                      {eligible === null ? (
                        <span className="mk-pill mk-tone-none">자격 확인 전</span>
                      ) : eligible ? (
                        over ? (
                          <span className="mk-pill mk-tone-no">자금 초과</span>
                        ) : (
                          <span className="mk-pill mk-tone-ok">자격 가능</span>
                        )
                      ) : (
                        <span className="mk-pill mk-tone-no">자격 불가능</span>
                      )}
                      <span className={dday.urgent ? "mk-pill mk-dday" : "mk-pill mk-tone-none"}>{dday.text}</span>
                    </span>
                    <b className="mk-listing-name">{listing.complex_name}</b>
                    <span className="mk-sub">
                      {regionName(listing.region_code)} · {listing.unit_size_sqm ? `${listing.unit_size_sqm}㎡ · ` : ""}
                      {listing.supply_type}
                    </span>
                    <span className="mk-kv">
                      <span>분양가</span>
                      <span>{listing.sale_price ? formatWon(listing.sale_price) : "미정"}</span>
                      <span>계약금</span>
                      <b>{depositText(listing)}</b>
                      <span>접수</span>
                      <span>
                        {formatShortDate(listing.receipt_start)} ~ {formatShortDate(listing.receipt_end)}
                      </span>
                    </span>
                    <span className="mk-listing-band">
                      <span className="mk-sub">내 위치</span>
                      <span className={`mk-pill ${BAND_TONE[band] || "mk-tone-none"}`}>{band || "-"}</span>
                    </span>
                    <span className="mk-ai-line">AI · {aiLine(item, assets, special, rank1)}</span>
                  </Link>
                );
              })}
            </div>
            <p className="mk-on-photo" style={{ fontSize: 12 }}>
              출퇴근 시간은 공고 상세의 출퇴근 조회에서 확인해요 · 내 위치(상/중/하)는 참고용이에요
            </p>
          </section>

          {/* 오른쪽: 내 정보 요약 */}
          <aside className="mk-side" style={{ flex: "1 1 270px" }} aria-label="내 청약 요약">
            <section className="mk-assets">
              <small>내 가용자산</small>
              <b>{formatWon(assets)}</b>
              <Link to="/loans">대출 시뮬레이션 ›</Link>
            </section>

            <section className="mk-glass mk-card" style={{ padding: "16px 18px" }}>
              <div className="mk-section-head" style={{ marginBottom: 10 }}>
                <h2 style={{ fontSize: 15 }}>내 청약 정보</h2>
                <Link to="/diagnosis" style={{ fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  정보 수정
                </Link>
              </div>
              <div className="mk-score-big">
                <b>{score.total}</b>
                <span>/ 84점</span>
              </div>
              <div className="mk-mini-gauge" role="img" aria-label={`내 가점 ${score.total}점, 비슷한 조건 평균 ${PEER_AVG}점(예시)`}>
                <div style={{ width: `${(score.total / 84) * 100}%` }} />
                <i style={{ left: `${(PEER_AVG / 84) * 100}%` }} />
                <em style={{ left: `${(PEER_AVG / 84) * 100}%` }}>평균 {PEER_AVG} (예시)</em>
              </div>
              <dl className="mk-dl">
                <dt>무주택</dt>
                <dd>{d.homeOwn === "none" ? `${d.noHouseYears}년` : "주택 소유"}</dd>
                <dt>부양가족</dt>
                <dd>{d.dependents}명</dd>
                <dt>청약통장</dt>
                <dd>
                  {ACCOUNT_SHORT[d.accountType]} {d.accountYears}년 · {d.payments}회
                </dd>
                <dt>희망 지역</dt>
                <dd>{d.wantRegions.length ? d.wantRegions.join(" · ") : "전체"}</dd>
              </dl>
            </section>

            <section className="mk-glass mk-card" style={{ padding: "16px 18px" }}>
              <h2 style={{ fontSize: 15, marginBottom: 6 }}>7일 안에 접수 마감</h2>
              {soon.length === 0 && <p className="mk-sub">7일 안에 마감되는 공고가 없어요.</p>}
              {soon.map((l) => (
                <Link key={l.id} to={`/listings/${l.id}`} className="mk-soon">
                  <span>{l.complex_name}</span>
                  <span className="mk-pill mk-dday">D-{l.days_until_receipt_end}</span>
                </Link>
              ))}
            </section>

            <Link to="/report" className="mk-report-cta">
              <small>멀티 에이전트</small>
              <b>AI 전략 리포트 만들기 ›</b>
              <span>추천 공고 · 자금 계획 · 일정을 한 장으로 정리해요</span>
            </Link>
          </aside>
        </div>
      </main>
    </MockupShell>
  );
}
