import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import { setUserField } from "../store/userSlice";

// 기획안 4장 화면 ① 입력 폼
export default function InputFormPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.user);

  const handleChange = (field) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    dispatch(setUserField({ field, value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: 백엔드 /users 엔드포인트에 저장 후 발급받은 user_id로 이동
    navigate("/dashboard");
  };

  return (
    <div>
      <h2>내 정보 입력</h2>
      <p>자격 필터링과 가점 계산에 필요한 정보입니다. (기획안 4장 참고)</p>
      <form onSubmit={handleSubmit}>
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
        <button type="submit">추천 받기</button>
      </form>
    </div>
  );
}
