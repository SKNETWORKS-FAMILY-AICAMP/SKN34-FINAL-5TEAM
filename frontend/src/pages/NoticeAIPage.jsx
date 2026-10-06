import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";

import MockupShell, { SparkIcon } from "../components/MockupShell";
import { askListingQuestion, fetchListing, fetchListings } from "../api/client";
import { regionName } from "../constants/regions";
import { ddayLabel, formatShortDate, formatWon } from "../utils/format";
import { calcSpecial, MARITAL_LABEL } from "../utils/diagnosis";

// 목업 ③ AI 공고 분석: 공고 요약 · 내 조건 비교 · 일정 · 주택형별 공급 · 이 공고에 질문하기
// 숫자는 모두 공고 API 값. 공고문에서 따로 뽑아야 하는 값(소득·자산 기준 등)은 [공고문 확인] 으로 둔다.
const QUICK = ["신청 자격이 어떻게 돼요?", "필요 서류 정리해줘", "계약금은 얼마예요?"];

function Pill({ tone, children }) {
  return <span className={`mk-pill mk-tone-${tone}`}>{children}</span>;
}

export default function NoticeAIPage() {
  const { id } = useParams();
  const d = useSelector((state) => state.diagnosis);
  const [listing, setListing] = useState(null);
  const [types, setTypes] = useState([]);
  const [error, setError] = useState(null);
  const [qa, setQa] = useState(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setListing(null);
    setQa(null);
    fetchListing(id)
      .then((res) => {
        setListing(res.data);
        // 같은 공고(external_id)의 다른 주택형도 함께 보여준다
        return fetchListings({ keyword: res.data.complex_name.slice(0, 50), per_page: 100 }).then((page) =>
          setTypes(page.data.items.filter((l) => l.external_id === res.data.external_id))
        );
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const ask = async (q) => {
    setAsking(true);
    try {
      const res = await askListingQuestion(q, Number(id));
      setQa({ q, ...res.data });
    } catch (err) {
      setQa({ q, answer: `답변을 가져오지 못했어요. (${err.message})`, evidence: [] });
    } finally {
      setAsking(false);
    }
  };

  if (error || !listing) {
    return (
      <MockupShell>
        <main className="mk-main">
          <section className="mk-glass mk-card">{error ? `공고를 불러오지 못했어요. (${error})` : "공고를 불러오는 중…"}</section>
        </main>
      </MockupShell>
    );
  }

  const assetsWon = d.assets * 10_000_000;
  const rows = types.length ? types : [listing];
  const totalUnits = rows.reduce((sum, l) => sum + (l.unit_count || 0), 0);
  const prices = rows.map((l) => l.sale_price).filter(Boolean);
  const dday = ddayLabel(listing);
  const deposit = listing.contract_deposit;
  const special = calcSpecial(d).filter((s) => s.status !== "no").map((s) => s.label);
  const supply = listing.supply_type || "";

  // 내 조건과 비교: 공고 API로 판단 가능한 것만 판정, 나머지는 확인
  const compare = [
    {
      label: "공급 유형",
      rule: supply || "-",
      mine: special.length ? `특공 후보: ${special.join(", ")}` : MARITAL_LABEL[d.marital],
      tone: /신혼/.test(supply) ? (d.marital === "newlywed" ? "ok" : "no") : /생애/.test(supply) ? (d.firstTime ? "ok" : "no") : "warn",
    },
    { label: "주택 소유", rule: "무주택세대구성원 (공고문 확인)", mine: d.homeOwn === "none" ? "세대 전원 무주택" : "주택 소유", tone: d.homeOwn === "none" ? "ok" : "no" },
    { label: "계약금", rule: deposit ? formatWon(deposit) : listing.deposit_status === "later" ? "추후 안내" : "[공고문 확인]", mine: `가용 자산 ${(d.assets / 10).toFixed(1)}억원`, tone: deposit ? (assetsWon >= deposit ? "ok" : "no") : "warn" },
    { label: "월평균 소득", rule: "[공고문 확인]", mine: d.income >= 999 ? "200% 초과" : `${d.income}% 이하${d.dualIncome == null ? " · 맞벌이 여부 미입력" : d.dualIncome ? " · 맞벌이" : " · 외벌이"}`, tone: "warn" },
    { label: "청약통장", rule: "공고별 가입 기간·납입 회차", mine: `${d.accountYears}년 · ${d.payments}회`, tone: d.accountYears >= 1 && d.payments >= 6 ? "ok" : "warn" },
  ];
  const warnCount = compare.filter((c) => c.tone !== "ok").length;

  const schedule = [
    ["청약 접수", listing.receipt_start ? `${formatShortDate(listing.receipt_start)} ~ ${formatShortDate(listing.receipt_end)}` : "-"],
    ["당첨자 발표", formatShortDate(listing.announce_date)],
    ["입주 예정", listing.move_in_date ? formatShortDate(listing.move_in_date) : "-"],
  ];
  const nextIdx = (listing.days_until_receipt_end ?? -1) >= 0 ? 0 : (listing.days_until_announce ?? -1) >= 0 ? 1 : 2;

  return (
    <MockupShell>
      {/* 공고 헤더 */}
      <section className="mk-on-photo">
        <div className="mk-header-inner" style={{ padding: "28px 24px 30px", alignItems: "flex-end", gap: "16px 32px" }}>
          <div style={{ flex: "1 1 560px" }}>
            <div className="mk-crumb">
              <Link to="/listings" style={{ color: "#EAF2FF" }}>
                공고 찾기
              </Link>{" "}
              › {regionName(listing.region_code)} › {supply || "공고"}
            </div>
            <div className="mk-opts" style={{ margin: "10px 0 8px" }}>
              {supply && <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: "#fff", color: "#0A2B5E", textShadow: "none" }}>{supply}</span>}
              <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.55)" }}>{dday.text}</span>
            </div>
            <h1 style={{ fontSize: 28, lineHeight: 1.35 }}>{listing.complex_name}</h1>
            <div style={{ fontSize: 14, color: "#F1F6FF", marginTop: 6 }}>{listing.address || regionName(listing.region_code)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, color: "#EAF2FF" }}>당첨자 발표</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {formatShortDate(listing.announce_date)}{" "}
              {listing.days_until_announce > 0 && <span style={{ fontSize: 15, color: "#FFD08A" }}>D-{listing.days_until_announce}</span>}
            </div>
          </div>
        </div>
      </section>

      <main className="mk-main mk-cols" style={{ paddingTop: 0 }}>
        <div className="mk-center-col" style={{ flex: "999 1 640px" }}>
          {/* 요약 */}
          <section className="mk-glass mk-card">
            <div className="mk-section-head">
              <h2>
                <SparkIcon />
                3줄 요약
              </h2>
              <span className="mk-sub">공고 API 값으로 생성 · LLM 요약 연결 예정</span>
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
              <li>
                <b>{supply || "입주자 모집"}</b> 공고예요{listing.address ? ` · ${listing.address}` : ""}.
              </li>
              <li>
                {rows.length}개 주택형, 총 <b>{totalUnits.toLocaleString()}세대</b>
                {prices.length > 0 && (
                  <>
                    {" "}
                    · 분양가 <b>{formatWon(Math.min(...prices))}</b>
                    {prices.length > 1 && Math.max(...prices) !== Math.min(...prices) && <> ~ <b>{formatWon(Math.max(...prices))}</b></>}
                  </>
                )}
                .
              </li>
              <li>
                접수 {schedule[0][1]} · <b>{schedule[1][1]} 당첨자 발표</b>
                {listing.move_in_date && ` · ${schedule[2][1]} 입주 예정`}.
              </li>
            </ol>
          </section>

          {/* 내 조건과 비교 */}
          <section className="mk-glass mk-card">
            <div className="mk-section-head" style={{ marginBottom: 4 }}>
              <h2>내 조건과 비교</h2>
              {warnCount ? <Pill tone="warn">{warnCount}개 항목 확인 필요</Pill> : <Pill tone="ok">모두 충족</Pill>}
            </div>
            <p className="mk-sub" style={{ margin: "0 0 12px", fontSize: 13 }}>
              공고 정보와 내 진단 프로필을 하나씩 비교했어요. {d.done ? "" : "(진단 전이라 기본값으로 비교 중)"}
            </p>
            <div className="mk-table-wrap">
              <table className="mk-table">
                <thead>
                  <tr>
                    <th scope="col">자격 항목</th>
                    <th scope="col">공고 기준</th>
                    <th scope="col">내 정보</th>
                    <th scope="col">판정</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.map((c) => (
                    <tr key={c.label}>
                      <td style={{ fontWeight: 600 }}>{c.label}</td>
                      <td>{c.rule}</td>
                      <td>{c.mine}</td>
                      <td>
                        <Pill tone={c.tone}>{c.tone === "ok" ? "충족" : c.tone === "no" ? "미충족" : "확인"}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 핵심 정보 */}
          <section className="mk-glass mk-card">
            <div className="mk-section-head" style={{ marginBottom: 16 }}>
              <h2>핵심 정보</h2>
              <span className="mk-sub" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: "#0A2B5E" }} />
                공고 API 구조화 데이터
              </span>
            </div>
            <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#3A4556" }}>일정</h3>
            <div className="mk-sched">
              {schedule.map(([label, value], i) => (
                <div key={label} className={i === nextIdx ? "next" : ""}>
                  <small>{i === nextIdx ? `${label} · 다음 일정` : label}</small>
                  <b>{value}</b>
                </div>
              ))}
            </div>

            <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#3A4556" }}>주택형별 공급</h3>
            <div className="mk-table-wrap" style={{ marginBottom: 20 }}>
              <table className="mk-table">
                <thead>
                  <tr>
                    <th scope="col">주택형 · 공급유형</th>
                    <th scope="col">전용면적</th>
                    <th scope="col">공급 세대</th>
                    <th scope="col">분양가</th>
                    <th scope="col">계약금</th>
                    <th scope="col">내 자산 대비 부족액</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const short = l.sale_price ? l.sale_price - assetsWon : null;
                    return (
                      <tr key={l.id} style={l.id === listing.id ? { background: "#F7F9FF" } : undefined}>
                        <td style={{ fontWeight: 600 }}>{l.supply_type || "-"}</td>
                        <td>{l.unit_size_sqm ? `${Number(l.unit_size_sqm).toFixed(2)}㎡` : "-"}</td>
                        <td>{l.unit_count ? `${l.unit_count}세대` : "-"}</td>
                        <td>{l.sale_price ? formatWon(l.sale_price) : "-"}</td>
                        <td>{l.contract_deposit ? formatWon(l.contract_deposit) : l.deposit_status === "later" ? "추후 안내" : "-"}</td>
                        <td style={{ color: "#8F4300", fontWeight: 600 }}>{short == null ? "-" : short > 0 ? `약 ${formatWon(short)}` : "부족 없음"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#3A4556" }}>신청 전 확인할 것</h3>
            <ul className="mk-notes">
              {(listing.required_documents || []).length > 0 && (
                <li>
                  <span className="mk-tag-navy">서류</span>
                  <span>{listing.required_documents.join(" · ")}</span>
                </li>
              )}
              <li className="pdf">
                <span className="mk-tag-violet">PDF</span>
                <span>전매제한·거주의무 기간, 소득·자산 기준은 공고문 원문에서 확인하세요. [공고문 추출값 연결 예정]</span>
              </li>
              {listing.notice_url && (
                <li>
                  <span className="mk-tag-navy">원문</span>
                  <a href={listing.notice_url} target="_blank" rel="noreferrer">
                    입주자모집공고 원문 열기
                  </a>
                </li>
              )}
            </ul>
          </section>
        </div>

        {/* 오른쪽 */}
        <aside className="mk-side wide" aria-label="공고에 질문하기">
          <section className="mk-glass" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>이 공고에 질문하기</h2>
            <p className="mk-sub" style={{ marginBottom: 12, fontSize: 13 }}>
              이 공고문만 검색 범위로 묶어 AI가 답해요.
            </p>
            {qa && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="mk-bubble-me" style={{ fontSize: 14, padding: "10px 12px" }}>
                  {qa.q}
                </div>
                <div className="mk-bubble-ai" style={{ fontSize: 14 }}>
                  {qa.answer}
                  {qa.evidence?.length > 0 && <sup style={{ color: "#4A2FC0", fontWeight: 700 }}> [근거 {qa.evidence.length}]</sup>}
                </div>
              </div>
            )}
            {asking && <div className="mk-bubble-ai">공고문에서 찾는 중…</div>}
            <div className="mk-opts" style={{ margin: "12px 0" }}>
              {QUICK.map((q) => (
                <button key={q} type="button" className="mk-chip-btn" onClick={() => ask(q)} disabled={asking}>
                  {q}
                </button>
              ))}
            </div>
            <Link to={`/ai-chat?listingId=${listing.id}`} className="mk-btn block" style={{ minHeight: 46, fontSize: 15 }}>
              AI 상담에서 이어서 묻기
            </Link>
          </section>

          <section className="mk-glass" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>공고문 원문</h2>
              {listing.notice_url && (
                <a href={listing.notice_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  원문 열기
                </a>
              )}
            </div>
            {qa?.evidence?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {qa.evidence.map((t, i) => (
                  <p key={i} style={{ padding: 8, background: "#FFF8DB", borderRadius: 6, fontSize: 12.5, color: "#4A3B00", whiteSpace: "pre-wrap" }}>
                    {t}
                  </p>
                ))}
              </div>
            ) : (
              <div style={{ border: "1px solid #DDE3EC", borderRadius: 8, background: "#FAFBFD", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ height: 10, width: "70%", background: "#DDE3EC", borderRadius: 3 }} />
                <div style={{ height: 8, width: "92%", background: "#E8ECF2", borderRadius: 3 }} />
                <div style={{ padding: 8, background: "#FFF8DB", borderRadius: 6, fontSize: 12.5, color: "#4A3B00" }}>질문하면 AI가 인용한 구간이 여기에 노란색으로 표시돼요</div>
                <div style={{ height: 8, width: "64%", background: "#E8ECF2", borderRadius: 3 }} />
              </div>
            )}
          </section>

          <Link to={`/listings/${listing.id}`} className="mk-btn-line" style={{ minHeight: 44, fontSize: 14 }}>
            기본 상세 화면으로 보기
          </Link>
        </aside>
      </main>
    </MockupShell>
  );
}
