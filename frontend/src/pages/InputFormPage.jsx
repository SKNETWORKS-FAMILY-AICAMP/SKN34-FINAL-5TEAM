import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import { REGIONS, regionName } from "../constants/regions";
import { saveUserProfile, setUserField } from "../store/userSlice";
import { formatWon } from "../utils/format";

const STEPS = ["기본 정보", "청약 자격", "자금·지역"];
const DEPENDENT_OPTIONS = [0, 1, 2, 3, 4];

function Field({ label, hint, children }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

// 기획안 4장 화면 ① 입력 폼 (PC 시안 01: 좌우 분할형 온보딩)
export default function InputFormPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.user);
  const [step, setStep] = useState(0);

  const setField = (field, value) => dispatch(setUserField({ field, value }));
  const handleChange = (field) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setField(field, value);
  };

  const isLast = step === STEPS.length - 1;
  const assets = Number(user.availableAssets) || 0;
  const months = Number(user.noHousePeriodMonths) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLast) {
      setStep(step + 1);
      return;
    }
    const saved = await dispatch(saveUserProfile(user));
    if (saveUserProfile.fulfilled.match(saved)) {
      navigate("/dashboard");
    }
  };

  return (
    <div className="onboarding">
      <aside className="onboarding-hero">
        <div className="hero-brand">청약 전략 플랫폼</div>
        <h1>
          내 돈으로 갈 수 있는 청약,
          <br />한 번에 찾아드려요
        </h1>
        <p>
          청약홈·LH·SH 공고를 한곳에 모으고, 내 자격과 자금에 맞는 공고와 대출까지 연결해
          드립니다.
        </p>
        <ul className="hero-points">
          <li>✔ 자격 되는 공고만 골라 보기</li>
          <li>✔ 내 자산으로 낼 수 있는 계약금 확인</li>
          <li>✔ 부족한 금액에 맞는 대출 안내</li>
        </ul>
        <p className="hero-notice">자격·위치(상/중/하)는 참고용이며 당첨을 보장하지 않습니다.</p>
      </aside>

      <section className="onboarding-main">
        <form className="onboarding-form" onSubmit={handleSubmit}>
          <ol className="stepper">
            {STEPS.map((name, i) => (
              <li key={name} className={i === step ? "active" : i < step ? "done" : ""}>
                {i < step ? "✔" : i + 1}. {name}
              </li>
            ))}
          </ol>

          {step === 0 && (
            <>
              <h2>먼저 기본 정보를 알려주세요</h2>
              <Field
                label="이메일"
                hint="내 정보를 저장하고 다시 불러올 때 사용합니다. 같은 이메일이면 정보가 갱신됩니다."
              >
                <input
                  type="email"
                  required
                  placeholder="example@email.com"
                  value={user.email}
                  onChange={handleChange("email")}
                />
              </Field>
              <Field label="해당되는 항목을 모두 선택하세요">
                <div className="toggle-group">
                  {[
                    ["isHouseholder", "세대주"],
                    ["isNewlywed", "신혼부부"],
                    ["isFirstTimeBuyer", "생애최초"],
                  ].map(([field, text]) => (
                    <button
                      type="button"
                      key={field}
                      className={user[field] ? "toggle on" : "toggle"}
                      onClick={() => setField(field, !user[field])}
                    >
                      {user[field] ? "✔ " : ""}
                      {text}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <h2>청약 가점에 필요한 정보예요</h2>
              <div className="field-row">
                <Field label="무주택 기간 (개월)" hint="만 30세 또는 혼인신고 이후 집이 없던 기간. 예: 3년 → 36">
                  <input
                    type="number"
                    min="0"
                    value={user.noHousePeriodMonths || ""}
                    placeholder="0"
                    onChange={handleChange("noHousePeriodMonths")}
                  />
                </Field>
                <Field label="청약통장 가입일" hint="모르면 비워두세요.">
                  <input
                    type="date"
                    value={user.subscriptionJoinedAt}
                    onChange={handleChange("subscriptionJoinedAt")}
                  />
                </Field>
              </div>
              <Field label="부양가족 수" hint="배우자를 제외한 직계존속·비속 등 부양하는 가족 수">
                <div className="toggle-group">
                  {DEPENDENT_OPTIONS.map((n) => (
                    <button
                      type="button"
                      key={n}
                      className={Number(user.dependentsCount) === n ? "toggle on" : "toggle"}
                      onClick={() => setField("dependentsCount", n)}
                    >
                      {n === 4 ? "4명 이상" : `${n}명`}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <h2>자금과 희망 지역을 알려주세요</h2>
              <Field
                label="가용자산 (원)"
                hint="계약금으로 바로 쓸 수 있는 현금입니다."
              >
                <input
                  type="number"
                  min="0"
                  step="1000000"
                  value={user.availableAssets || ""}
                  placeholder="예: 50000000"
                  onChange={handleChange("availableAssets")}
                />
                <span className="money">{formatWon(assets)}</span>
              </Field>
              <Field label="희망 지역" hint="이 지역의 공고를 추천해 드립니다.">
                <select value={user.desiredRegionCode} onChange={handleChange("desiredRegionCode")}>
                  <option value="">지역을 선택하세요</option>
                  {REGIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="field-row">
                <Field label="직장 주소 (선택)" hint="공고 단지에서 직장까지 대중교통 시간을 계산해 드려요.">
                  <input
                    placeholder="예: 서울 강남구 테헤란로 152"
                    value={user.workplaceAddress}
                    onChange={handleChange("workplaceAddress")}
                  />
                </Field>
                <Field label="현재 집 주소 (선택)" hint="지금 출퇴근 시간과 비교해 드려요.">
                  <input
                    placeholder="예: 서울 관악구 신림로 330"
                    value={user.homeAddress}
                    onChange={handleChange("homeAddress")}
                  />
                </Field>
              </div>
            </>
          )}

          <div className="actions">
            {step > 0 && (
              <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
                이전
              </button>
            )}
            <button type="submit" className="btn" disabled={user.saveStatus === "loading"}>
              {isLast
                ? user.saveStatus === "loading"
                  ? "저장 중..."
                  : "추천 받기"
                : `다음: ${STEPS[step + 1]}`}
            </button>
          </div>
          {user.saveStatus === "failed" && <p className="error">저장 실패: {user.saveError}</p>}
        </form>

        <div className="onboarding-summary">
          <div className="card">
            <div className="card-title">입력 요약</div>
            <dl className="kv">
              <dt>무주택 기간</dt>
              <dd>{months ? `${Math.floor(months / 12)}년 ${months % 12}개월` : "-"}</dd>
              <dt>부양가족</dt>
              <dd>{user.dependentsCount}명</dd>
              <dt>통장 가입일</dt>
              <dd>{user.subscriptionJoinedAt || "-"}</dd>
              <dt>희망 지역</dt>
              <dd>{user.desiredRegionCode ? regionName(user.desiredRegionCode) : "-"}</dd>
              <dt>직장</dt>
              <dd>{user.workplaceAddress ? "입력함" : "-"}</dd>
            </dl>
            <p className="field-hint">청약 가점은 저장 후 추천 화면에서 계산됩니다.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
