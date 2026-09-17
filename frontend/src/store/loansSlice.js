import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

import apiClient from "../api/client";

// 기획안 4장 '대출 시뮬레이션' 데이터를 가져오는 비동기 액션
export const fetchLoanMatches = createAsyncThunk(
  "loans/fetchLoanMatches",
  async ({ userId, listingId }) => {
    const response = await apiClient.post("/loans/match", {
      user_id: userId,
      listing_id: listingId,
    });
    return response.data;
  }
);

const loansSlice = createSlice({
  name: "loans",
  initialState: {
    matches: [],
    status: "idle",
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLoanMatches.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchLoanMatches.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.matches = action.payload;
      })
      .addCase(fetchLoanMatches.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message;
      });
  },
});

export default loansSlice.reducer;
