import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

import apiClient from "../api/client";

// 기획안 4장 '입력 폼' 필드 그대로 초기 상태로 사용
const initialState = {
  id: null,
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
  saveStatus: "idle",
  saveError: null,
};

export function toUserPayload(user) {
  return {
    email: (user.email || "").trim(),
    no_house_period_months: Number(user.noHousePeriodMonths) || 0,
    is_householder: Boolean(user.isHouseholder),
    dependents_count: Number(user.dependentsCount) || 0,
    subscription_account_type: user.subscriptionAccountType || null,
    subscription_joined_at: user.subscriptionJoinedAt || null,
    subscription_payment_count: Number(user.subscriptionPaymentCount) || 0,
    available_assets: Number(user.availableAssets) || 0,
    desired_region_code: user.desiredRegionCode || null,
    is_newlywed: Boolean(user.isNewlywed),
    is_first_time_buyer: Boolean(user.isFirstTimeBuyer),
  };
}

export const saveUserProfile = createAsyncThunk(
  "user/saveUserProfile",
  async (user, { rejectWithValue }) => {
    try {
      const response = await apiClient.post("/users/", toUserPayload(user));
      return response.data;
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === "string" ? detail : "프로필 저장에 실패했습니다.";
      return rejectWithValue(message);
    }
  }
);

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
  extraReducers: (builder) => {
    builder
      .addCase(saveUserProfile.pending, (state) => {
        state.saveStatus = "loading";
        state.saveError = null;
      })
      .addCase(saveUserProfile.fulfilled, (state, action) => {
        state.saveStatus = "succeeded";
        state.id = action.payload.id;
      })
      .addCase(saveUserProfile.rejected, (state, action) => {
        state.saveStatus = "failed";
        state.saveError = action.payload || action.error.message;
      });
  },
});

export const { setUserField, resetUser } = userSlice.actions;
export default userSlice.reducer;
