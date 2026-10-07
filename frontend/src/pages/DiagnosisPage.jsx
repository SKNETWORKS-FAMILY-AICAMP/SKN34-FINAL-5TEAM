import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";

import MockupShell, { SparkIcon } from "../components/MockupShell";
import { setDiagnosisField } from "../store/diagnosisSlice";
import { saveUserProfile, setUserField } from "../store/userSlice";
import {
  calcRank1,
  calcScore,
  calcSpecial,
  diagnosisToUser,
  parseConditions,
  peerGroup,
  profileChips,
  SPECIAL_TEXT,
  STATUS_TEXT,
} from "../utils/diagnosis";

// 청약 진단(/diagnosis): 6단계 진단 → 결과 미리보기 → 가입(저장) → 청약 홈(/portal, jinyoung 메인 화면)
// AI 맞춤 조건 화면은 대시보드에서 "조건 자세히 입력"으로 들어온다 (location.state.screen = "ai").
// 비슷한 조건 평균·희망 지역 당첨선은 예시값 (사용자 통계 · 청약홈 당첨가점 API 연결 전)
const PEER_AVG = 31;
const CUTLINE = 52;

const TITLES = ["기본 정보", "주택 소유 · 무주택 기간", "가족 구성", "청약통장", "소득 · 자산", "희망 조건"];
const SHORT = ["기본", "주택", "가족", "통장", "소득", "희망"];
const EXAMPLE_TEXT =
  "강남역까지 대중교통으로 1시간 안이면 좋겠어요. 아이 계획이 있어서 초등학교 가까운 단지면 좋겠고, 대출은 한 달에 150만원 이하로 갚고 싶어요. 2년 안에는 입주하고 싶어요.";
const EXAMPLES = [
  ["반려동물", "반려견이랑 같이 살 수 있으면 좋겠어요."],
  ["부모님 집 근처", "부모님 댁이 분당이라 가까우면 좋겠어요."],
  ["역세권", "지하철역 도보 10분 이내면 좋겠어요."],
];

function Stepper({ label, value, text, min, max, step = 1, onChange }) {
  return (
    <div className="mk-stepper">
      <button type="button" aria-label={`${label} 줄이기`} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <output>{text}</output>
      <button type="button" aria-label={`${label} 늘리기`} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

function Options({ value, options, onPick }) {
  return (
    <div className="mk-opts">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" className={`mk-opt${value === v ? " on" : ""}`} onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function MultiOptions({ values, options, onChange }) {
  return (
    <div className="mk-opts">
      {options.map((label) => {
        const on = values.includes(label);
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            className={`mk-opt multi${on ? " on" : ""}`}
            onClick={() => onChange(on ? values.filter((x) => x !== label) : [...values, label])}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, sub, hint, children }) {
  return (
    <div>
      <div className="mk-field-label">
        {label} {sub && <small>{sub}</small>}
      </div>
      {children}
      {hint && <div className="mk-hint">{hint}</div>}
    </div>
  );
}

const pct = (v) => `${((Math.max(0, Math.min(84, v)) / 84) * 100).toFixed(2)}%`;

export default function DiagnosisPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const d = useSelector((state) => state.diagnosis);
  const user = useSelector((state) => state.user);
  const [screen, setScreen] = useState(location.state?.screen === "ai" && user.id ? "ai" : d.done ? "result" : "step");
  const [step, setStep] = useState(1);
  const [modal, setModal] = useState(false);
  const [email, setEmail] = useState(user.email || "");
  const [text, setText] = useState(d.requestText || EXAMPLE_TEXT);
  const [removed, setRemoved] = useState([]);

  const set = (field) => (value) => dispatch(setDiagnosisField({ field, value }));

  const score = calcScore(d);
  const rank1 = calcRank1(d);
  const special = calcSpecial(d);

  // 가점 스택 바: STEP 2부터 항목이 하나씩 쌓인다
  const r1 = step >= 2 || screen !== "step" ? score.noHouse : 0;
  const r2 = step >= 3 || screen !== "step" ? score.dependents : 0;
  const r3 = step >= 4 || screen !== "step" ? score.account : 0;
  const stackTotal = r1 + r2 + r3;
  const diff = stackTotal - PEER_AVG;
  const resultDiff = score.total - PEER_AVG;
  const cutPos = Math.abs(CUTLINE - PEER_AVG) < 14 ? (CUTLINE >= PEER_AVG ? PEER_AVG + 14 : PEER_AVG - 14) : CUTLINE;
  const legend = [
    ["무주택 기간", score.noHouse, 32, 2, "#0A2B5E"],
    ["부양가족 수", score.dependents, 35, 3, "#1D5BD8"],
    ["통장 가입 기간", score.account, 17, 4, "#8DB0F2"],
  ];

  const next = () => {
    if (step < 6) setStep(step + 1);
    else {
      dispatch(setDiagnosisField({ field: "done", value: true }));
      setScreen("result");
    }
  };

  const signup = async (e) => {
    e?.preventDefault();
    const merged = { ...user, ...diagnosisToUser(d, email.trim()) };
    Object.entries(merged).forEach(([field, value]) => {
      if (field in user || field === "subscriptionPaymentCount") dispatch(setUserField({ field, value }));
    });
    const saved = await dispatch(saveUserProfile(merged));
    if (saveUserProfile.fulfilled.match(saved)) {
      setModal(false);
      navigate("/portal");
    }
  };

  const conds = (d.conditions || []).filter((c) => !removed.includes(c.id));
  const analyze = () => {
    dispatch(setDiagnosisField({ field: "requestText", value: text }));
    dispatch(setDiagnosisField({ field: "conditions", value: parseConditions(text) }));
    setRemoved([]);
  };
  const makeReport = () => {
    dispatch(setDiagnosisField({ field: "conditions", value: conds }));
    navigate("/report");
  };

  return (
    <MockupShell onLogin={() => setModal(true)}>
      <main className="mk-center">
        {/* ===== 진단 단계 ===== */}
        {screen === "step" && (
          <div className="mk-wizard">
            <div className="mk-hero-title">
              <span className="mk-badge-glass mk-glass-dark">1분 청약 진단 · 회원가입 없이 시작</span>
              <h1>내 집 마련, 내 조건부터.</h1>
              <p>6단계만 답하면 가점·1순위·특별공급 자격을 바로 알려드려요</p>
            </div>

            <ol className="mk-progress" aria-label="진단 단계">
              {SHORT.map((label, i) => {
                const n = i + 1;
                return (
                  <li key={label} className={n === step ? "cur" : n < step ? "done" : ""}>
                    <button type="button" aria-label={`STEP ${n} ${TITLES[i]}`} aria-current={n === step ? "step" : undefined} onClick={() => setStep(n)} />
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>

            <section className="mk-glass mk-step-card">
              <div className="mk-step-body">
                <div className="mk-step-head">
                  <span className="mk-step-no">{step}</span>
                  <div>
                    <small>STEP {step} / 6</small>
                    <h2>{TITLES[step - 1]}</h2>
                  </div>
                </div>

                {step === 1 && (
                  <div className="mk-stack">
                    <div className="mk-row">
                      <Field label="나이">
                        <Stepper label="나이" value={d.age} text={`만 ${d.age}세`} min={19} max={70} onChange={set("age")} />
                      </Field>
                      <Field label="세대주 여부">
                        <Options value={d.householder} options={[[true, "세대주"], [false, "세대원"]]} onPick={set("householder")} />
                      </Field>
                    </div>
                    <Field label="혼인 상태">
                      <Options value={d.marital} options={[["single", "미혼"], ["newlywed", "신혼 (혼인 7년 이내)"], ["married", "기혼 (7년 초과)"]]} onPick={set("marital")} />
                    </Field>
                    <Field label="현재 거주지">
                      <Options value={d.region} options={["서울", "인천", "경기", "기타 광역시", "기타 시·군"].map((r) => [r, r])} onPick={set("region")} />
                    </Field>
                  </div>
                )}

                {step === 2 && (
                  <div className="mk-stack">
                    <Field label="세대 전원의 주택 소유">
                      <Options value={d.homeOwn} options={[["none", "무주택"], ["one", "1주택"], ["multi", "2주택 이상"]]} onPick={set("homeOwn")} />
                    </Field>
                    <Field label="무주택 기간" hint="만 30세부터 산정해요 (30세 전에 혼인했다면 혼인신고일부터)">
                      <Stepper
                        label="무주택 기간"
                        value={d.noHouseYears}
                        text={d.noHouseYears === 0 ? "1년 미만" : d.noHouseYears >= 15 ? "15년 이상" : `${d.noHouseYears}년 이상`}
                        min={0}
                        max={15}
                        onChange={set("noHouseYears")}
                      />
                    </Field>
                    <Field label="생애최초 주택 구입인가요?">
                      <Options value={d.firstTime} options={[[true, "소유 이력 없음"], [false, "과거 소유 이력 있음"]]} onPick={set("firstTime")} />
                    </Field>
                  </div>
                )}

                {step === 3 && (
                  <div className="mk-stack">
                    <div className="mk-row">
                      <Field label="부양가족 수" sub="(본인 제외)">
                        <Stepper label="부양가족" value={d.dependents} text={d.dependents >= 6 ? "6명 이상" : `${d.dependents}명`} min={0} max={6} onChange={set("dependents")} />
                      </Field>
                      <Field label="미성년 자녀 수">
                        <Stepper label="미성년 자녀" value={d.minorKids} text={`${d.minorKids}명`} min={0} max={5} onChange={set("minorKids")} />
                      </Field>
                    </div>
                    <Field label="2년 이내에 출생한 자녀가 있나요?">
                      <Options value={d.newborn} options={[[true, "있음"], [false, "없음"]]} onPick={set("newborn")} />
                    </Field>
                    <Field label="만 65세 이상 부모님을 3년 이상 모시고 있나요?">
                      <Options value={d.parentSupport} options={[[true, "예"], [false, "아니오"]]} onPick={set("parentSupport")} />
                    </Field>
                  </div>
                )}

                {step === 4 && (
                  <div className="mk-stack">
                    <Field label="통장 종류">
                      <Options
                        value={d.accountType}
                        options={[["total", "주택청약종합저축"], ["saving", "청약저축"], ["deposit", "청약예금"], ["install", "청약부금"]]}
                        onPick={set("accountType")}
                      />
                    </Field>
                    <div className="mk-row">
                      <Field label="가입 기간">
                        <Stepper
                          label="가입 기간"
                          value={d.accountYears}
                          text={d.accountYears === 0 ? "1년 미만" : d.accountYears >= 15 ? "15년 이상" : `${d.accountYears}년`}
                          min={0}
                          max={15}
                          onChange={set("accountYears")}
                        />
                      </Field>
                      <Field label="납입 인정 회차">
                        <Stepper label="납입 회차" value={d.payments} text={`${d.payments}회`} min={0} max={240} step={6} onChange={set("payments")} />
                      </Field>
                    </div>
                    <Field label="예치금" sub="(민영주택 1순위 기준)">
                      <Stepper label="예치금" value={d.deposit} text={`${d.deposit.toLocaleString()}만원`} min={0} max={2000} step={50} onChange={set("deposit")} />
                    </Field>
                  </div>
                )}

                {step === 5 && (
                  <div className="mk-stack">
                    <Field label="월평균 소득" hint="전년도 도시근로자 가구원수별 월평균소득 대비">
                      <Options
                        value={d.income}
                        options={[[100, "100% 이하"], [130, "130% 이하"], [160, "160% 이하"], [200, "200% 이하"], [999, "200% 초과"]]}
                        onPick={set("income")}
                      />
                    </Field>
                    <Field label="가용 자산" sub="(부동산·금융자산 등 순자산)" hint="공공분양 자산 기준 비교와 대출 매칭에 사용해요">
                      <Stepper label="자산" value={d.assets} text={`${(d.assets / 10).toFixed(1)}억원`} min={0} max={100} step={5} onChange={set("assets")} />
                    </Field>
                  </div>
                )}

                {step === 6 && (
                  <div className="mk-stack">
                    <Field label="희망 지역" sub="(여러 개 선택)">
                      <MultiOptions values={d.wantRegions} options={["서울", "경기", "인천", "대전", "대구", "부산", "기타"]} onChange={set("wantRegions")} />
                    </Field>
                    <Field label="공급 유형" sub="(여러 개 선택)">
                      <MultiOptions values={d.supply} options={["공공분양", "민간분양", "공공임대", "매입·전세임대"]} onChange={set("supply")} />
                    </Field>
                    <Field label="희망 전용면적">
                      <Options value={d.size} options={[["small", "60㎡ 이하"], ["mid", "60~85㎡"], ["large", "85㎡ 초과"]]} onPick={set("size")} />
                    </Field>
                  </div>
                )}

                <div className="mk-step-foot">
                  <button type="button" className="mk-btn-line" style={{ visibility: step === 1 ? "hidden" : "visible" }} onClick={() => setStep(Math.max(1, step - 1))}>
                    이전
                  </button>
                  <span>{step} / 6</span>
                  <button type="button" className="mk-btn" onClick={next}>
                    {step < 6 ? "다음" : "결과 보기"}
                  </button>
                </div>
              </div>

              {/* 가점 스택 바 */}
              <aside className="mk-score-side" aria-label="현재 예상 가점">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#3A4556" }}>현재 예상 가점</div>
                  <div className="mk-score-big">
                    <b>{stackTotal}</b>
                    <span>/ 84점</span>
                  </div>
                  <div className="mk-sub">{step === 1 ? "STEP 2부터 가점이 쌓여요" : step < 4 ? "입력할수록 막대가 쌓여요" : "가점 항목 입력 완료"}</div>
                </div>
                <div className="mk-stackbar" role="img" aria-label={`현재 예상 가점 ${stackTotal}점, 비슷한 조건 평균 ${PEER_AVG}점, 희망 지역 당첨선 ${CUTLINE}점`}>
                  {[0, 20, 40, 60, 84].map((v) => (
                    <span key={v} className="tick" style={{ bottom: pct(v) }}>
                      {v}
                    </span>
                  ))}
                  <div className="track">
                    <div className="seg" style={{ bottom: pct(0), height: pct(r1), background: "#0A2B5E" }} />
                    <div className="seg" style={{ bottom: pct(r1), height: pct(r2), background: "#1D5BD8", boxShadow: r2 ? "inset 0 2px 0 #fff" : "none" }} />
                    <div className="seg" style={{ bottom: pct(r1 + r2), height: pct(r3), background: "#8DB0F2", boxShadow: r3 ? "inset 0 2px 0 #fff" : "none" }} />
                  </div>
                  <div className="line" style={{ bottom: pct(PEER_AVG), borderTop: "2px dashed #B35300" }} />
                  <div className="label" style={{ bottom: pct(PEER_AVG) }}>
                    <b style={{ color: "#8F4300", fontSize: 14 }}>{PEER_AVG}점</b>
                    <br />
                    비슷한 조건 평균
                  </div>
                  <div className="line" style={{ bottom: pct(CUTLINE), borderTop: "2px solid #0A2B5E" }} />
                  <div className="label" style={{ bottom: pct(cutPos) }}>
                    <b style={{ color: "#0A2B5E", fontSize: 14 }}>{CUTLINE}점</b>
                    <br />
                    희망 지역 당첨선
                  </div>
                </div>
                <ul className="mk-legend">
                  {legend.map(([label, v, max, need, color]) => (
                    <li key={label} className={step === need ? "cur" : step < need ? "todo" : ""}>
                      <span className="dot" style={{ background: color }} />
                      <span style={{ flex: 1 }}>{label}</span>
                      <b>{step >= need ? `${v} / ${max}` : "입력 전"}</b>
                    </li>
                  ))}
                </ul>
                <div className="mk-note-yellow">
                  {step < 4
                    ? "STEP 4까지 입력하면 비슷한 조건 평균과 비교해 드려요"
                    : diff >= 0
                    ? `비슷한 조건 평균보다 ${diff}점 높아요`
                    : `비슷한 조건 평균보다 ${-diff}점 낮아요 · 특별공급을 함께 노려보세요`}
                  <br />
                  <small>비교 그룹: {peerGroup(d)}</small>
                </div>
                <div className="mk-fine">평균·당첨선은 예시값이에요 (사용자 통계 · 청약홈 당첨가점 API 연결 전)</div>
              </aside>
            </section>
            <p className="mk-hero-title" style={{ fontSize: 13 }}>
              입력한 정보는 결과를 보기 전까지 저장되지 않아요
            </p>
          </div>
        )}

        {/* ===== 결과 미리보기 ===== */}
        {screen === "result" && (
          <div className="mk-result">
            <div className="mk-hero-title">
              <span className="mk-badge-glass mk-glass-dark">진단 완료</span>
              <h1 style={{ fontSize: 38 }}>내 청약 진단 결과</h1>
            </div>
            <section className="mk-glass mk-result-card">
              <div style={{ flex: "1 1 240px" }}>
                <div className="mk-field-label">예상 청약 가점</div>
                <div className="mk-score-big" style={{ margin: "8px 0 8px" }}>
                  <b style={{ fontSize: 56, lineHeight: 1 }}>{score.total}</b>
                  <span style={{ fontSize: 18 }}>/ 84점</span>
                </div>
                <div style={{ margin: "0 0 14px", fontSize: 13, color: "#8F4300", fontWeight: 600 }}>
                  비슷한 조건 평균({PEER_AVG}점)보다 {Math.abs(resultDiff)}점 {resultDiff >= 0 ? "높아요" : "낮아요"}{" "}
                  <span style={{ color: "#6B7585", fontWeight: 400 }}>(예시값)</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {score.rows.map((r) => (
                    <div key={r.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 4 }}>
                        <span>{r.label}</span>
                        <span>
                          <b>{r.score}</b> / {r.max}
                        </span>
                      </div>
                      <div className="mk-bar">
                        <div style={{ width: `${Math.round((r.score / r.max) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="mk-field-label" style={{ margin: 0 }}>
                    1순위 요건
                  </span>
                  <span className={`mk-pill mk-tone-${rank1.badge.tone}`}>{rank1.badge.text}</span>
                </div>
                <ul className="mk-checklist">
                  {rank1.items.map((c) => (
                    <li key={c.label}>
                      <span>{c.label}</span>
                      <span className={`mk-text-${c.status}`}>{STATUS_TEXT[c.status]}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 10 }}>
                <span className="mk-field-label" style={{ margin: 0 }}>
                  특별공급 자격
                </span>
                <div className="mk-opts">
                  {special.map((c) => (
                    <span key={c.label} className={`mk-special mk-tone-${c.status === "no" ? "none" : c.status}`}>
                      {c.label} · {SPECIAL_TEXT[c.status]}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="mk-glass mk-locked">
              <div className="mk-locked-blur" aria-hidden="true">
                <div>
                  <b>맞춤 추천 공고</b>
                  <div style={{ fontSize: 13 }}>자격 충족 · 희망 지역</div>
                </div>
                <div>
                  <b>계약금으로 갈 수 있는 공고</b>
                  <div style={{ fontSize: 13 }}>보유 자산 기준</div>
                </div>
                <div>
                  <b>AI 전략 리포트</b>
                  <div style={{ fontSize: 13 }}>추천 전략 3개</div>
                </div>
              </div>
              <div className="mk-locked-cover">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="5" y="10.5" width="14" height="10" rx="2.5" stroke="#0A2B5E" strokeWidth="1.8" />
                  <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#0A2B5E" strokeWidth="1.8" />
                </svg>
                <div style={{ fontWeight: 700, fontSize: 17 }}>맞춤 공고와 AI 전략 리포트는 저장 후 볼 수 있어요</div>
                {user.id ? (
                  <button type="button" className="mk-btn" onClick={() => navigate("/portal")}>
                    청약 홈으로 가기
                  </button>
                ) : (
                  <button type="button" className="mk-btn" onClick={() => setModal(true)}>
                    저장하고 AI 맞춤 추천 받기
                  </button>
                )}
              </div>
            </section>
            <div style={{ textAlign: "center" }}>
              <button
                type="button"
                className="mk-link-white"
                onClick={() => {
                  setScreen("step");
                  setStep(6);
                }}
              >
                입력 다시 수정하기
              </button>
            </div>
          </div>
        )}

        {/* ===== AI 추가 요구사항 ===== */}
        {screen === "ai" && (
          <div className="mk-ai">
            <div className="mk-hero-title">
              <span className="mk-badge-glass mk-glass-dark">
                <SparkIcon color="#FFFFFF" size={14} />
                마지막 단계 · AI 맞춤 조건
              </span>
              <h1 style={{ fontSize: 38 }}>원하는 조건을 편하게 적어주세요</h1>
              <p>진단 정보는 저장됐어요. 폼으로 담기 어려운 조건은 AI가 정리해 추천에 반영해요.</p>
            </div>
            <section className="mk-glass mk-card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="mk-opts" style={{ alignItems: "center", fontSize: 12.5 }}>
                <span style={{ fontWeight: 700, color: "#3A4556", marginRight: 4 }}>저장된 진단</span>
                {profileChips(d).slice(0, 6).map((label) => (
                  <span key={label} className="mk-tag">
                    {label}
                  </span>
                ))}
              </div>
              <label className="mk-field-label" style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0 }}>
                추가 요구사항
                <textarea className="mk-textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              <div className="mk-opts" style={{ alignItems: "center" }}>
                <span className="mk-sub">예시</span>
                {EXAMPLES.map(([label, add]) => (
                  <button key={label} type="button" className="mk-chip-btn" onClick={() => setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${add}`)}>
                    + {label}
                  </button>
                ))}
              </div>
              <button type="button" className="mk-btn violet" style={{ alignSelf: "flex-end", minHeight: 50, fontSize: 15 }} onClick={analyze}>
                AI로 조건 정리하기
              </button>

              {d.requestText && (
                <div style={{ borderTop: "1px solid #EEF1F5", paddingTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700 }}>AI가 정리한 조건</h2>
                    <span className="mk-sub">틀린 조건은 지워주세요 · 지금은 키워드 규칙으로 정리 (LLM 연결 전)</span>
                  </div>
                  {conds.length === 0 && <div className="mk-empty">정리할 조건을 찾지 못했어요. 위치·자금·입주 시기 등을 적어 주세요.</div>}
                  <div className="mk-cond-grid">
                    {conds.map((c) => (
                      <div key={c.id} className="mk-cond">
                        <span className="mk-tag-violet" style={{ marginTop: 2 }}>
                          {c.cat}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{c.text}</div>
                          <div style={{ fontSize: 12.5, color: "#4A5568" }}>{c.how}</div>
                        </div>
                        <button type="button" className="mk-icon-btn" style={{ width: 36, height: 36 }} aria-label={`${c.text} 조건 지우기`} onClick={() => setRemoved([...removed, c.id])}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path d="m3 3 8 8M11 3l-8 8" stroke="#5B6576" strokeWidth="1.7" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mk-ask-more">
                    <div style={{ fontSize: 14 }}>
                      <b>AI가 하나 더 물어볼게요.</b> 맞벌이 가구인가요? 소득 기준이 달라져요.
                    </div>
                    <Options value={d.dualIncome} options={[[true, "맞벌이"], [false, "외벌이"]]} onPick={set("dualIncome")} />
                  </div>
                  <button type="button" className="mk-btn block" style={{ minHeight: 54 }} onClick={makeReport}>
                    이 조건으로 AI 전략 리포트 만들기
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* ===== 가입 모달 ===== */}
      {modal && (
        <div className="mk-modal-bg" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <form className="mk-modal" role="dialog" aria-modal="true" aria-label="진단 정보 저장하기" onSubmit={signup}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <h2 style={{ fontSize: 21, fontWeight: 700 }}>진단 정보 저장하기</h2>
                <p style={{ marginTop: 4, fontSize: 14, color: "#4A5568" }}>가입하면 방금 입력한 정보가 그대로 저장돼요.</p>
              </div>
              <button type="button" className="mk-icon-btn" style={{ border: 0, background: "#F3F5F9" }} aria-label="닫기" onClick={() => setModal(false)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="m3 3 8 8M11 3l-8 8" stroke="#3A4556" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="mk-summary-box">
              <div>
                <span>예상 가점</span>
                <b>{score.total}점</b>
              </div>
              <div>
                <span>1순위</span>
                <b>{rank1.badge.text}</b>
              </div>
              <div>
                <span>저장 항목</span>
                <b>6개 영역 · 22개 값</b>
              </div>
            </div>
            <button type="button" className="mk-btn-line" disabled title="소셜 로그인은 준비 중이에요">
              카카오로 계속하기 (준비 중)
            </button>
            <button type="button" className="mk-btn-line" disabled title="소셜 로그인은 준비 중이에요">
              네이버로 계속하기 (준비 중)
            </button>
            <div className="mk-divider">또는</div>
            <label className="mk-field-label" style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, fontSize: 13.5 }}>
              이메일
              <input type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {user.saveStatus === "failed" && <p className="mk-error">{user.saveError}</p>}
            <button type="submit" className="mk-btn" disabled={user.saveStatus === "loading"} style={{ minHeight: 50, fontSize: 15 }}>
              {user.saveStatus === "loading" ? "저장 중…" : "이메일로 가입하고 저장"}
            </button>
            <p style={{ fontSize: 12, color: "#5B6576", textAlign: "center" }}>가입 시 이용약관 및 개인정보 처리방침에 동의하게 됩니다</p>
          </form>
        </div>
      )}
    </MockupShell>
  );
}
