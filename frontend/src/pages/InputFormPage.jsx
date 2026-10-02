import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import { saveUserProfile, setUserField } from "../store/userSlice";

// 기획안 4장 화면 ① 입력 폼
export default function InputFormPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.user);

  const handleChange = (field) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    dispatch(setUserField({ field, value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const saved = await dispatch(saveUserProfile(user));
    if (saveUserProfile.fulfilled.match(saved)) {
      navigate("/dashboard");
    }
  };

  return (
    <div>
      <h2>내 정보 입력</h2>
      <p>자격 필터링과 가점 계산에 필요한 정보입니다. (기획안 4장 참고)</p>
      <form onSubmit={handleSubmit}>
        <label>
          이메일
          <input
            type="email"
            required
            value={user.email}
            onChange={handleChange("email")}
          />
        </label>
        <br />
        <label>
          무주택 기간(개월)
          <input
            type="number"
            value={user.noHousePeriodMonths}
            onChange={handleChange("noHousePeriodMonths")}
          />
        </label>
        <br />
        <label>
          세대주 여부
          <input
            type="checkbox"
            checked={user.isHouseholder}
            onChange={handleChange("isHouseholder")}
          />
        </label>
        <br />
        <label>
          부양가족 수
          <input
            type="number"
            value={user.dependentsCount}
            onChange={handleChange("dependentsCount")}
          />
        </label>
        <br />
        <label>
          청약통장 가입일
          <input
            type="date"
            value={user.subscriptionJoinedAt}
            onChange={handleChange("subscriptionJoinedAt")}
          />
        </label>
        <br />
        <label>
          가용자산(원)
          <input
            type="number"
            value={user.availableAssets}
            onChange={handleChange("availableAssets")}
          />
        </label>
        <br />
        <label>
          희망 지역 코드
          <input
            type="text"
            placeholder="예: 11680 (강남구)"
            value={user.desiredRegionCode}
            onChange={handleChange("desiredRegionCode")}
          />
        </label>
        <br />
        <button type="submit" disabled={user.saveStatus === "loading"}>
          {user.saveStatus === "loading" ? "저장 중..." : "추천 받기"}
        </button>
        {user.saveStatus === "failed" && <p>저장 실패: {user.saveError}</p>}
      </form>
    </div>
  );
}
