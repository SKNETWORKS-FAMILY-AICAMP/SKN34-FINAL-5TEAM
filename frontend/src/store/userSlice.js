import { createSlice } from "@reduxjs/toolkit";

// 기획안 4장 '입력 폼' 필드 그대로 초기 상태로 사용
const initialState = {
  email: "",
  noHousePeriodMonths: 0,
  isHouseholder: false,
  dependentsCount: 0,
  subscriptionAccountType: "",
  subscriptionJoinedAt: "",
  availableAssets: 0,
  desiredRegionCode: "",
  isNewlywed: false,
  isFirstTimeBuyer: false,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUserField: (state, action) => {
      const { field, value } = action.payload;
      state[field] = value;
    },
    resetUser: () => initialState,
  },
});

export const { setUserField, resetUser } = userSlice.actions;
export default userSlice.reducer;
