import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

import apiClient from "../api/client";

// 기획안 4장 '추천 대시보드' 데이터를 가져오는 비동기 액션
export const fetchRecommendations = createAsyncThunk(
  "listings/fetchRecommendations",
  async (userId) => {
    const response = await apiClient.get(`/recommendations/${userId}`);
    return response.data.items;
  }
);

const listingsSlice = createSlice({
  name: "listings",
  initialState: {
    items: [],
    status: "idle", // idle | loading | succeeded | failed
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecommendations.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchRecommendations.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload;
      })
      .addCase(fetchRecommendations.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message;
      });
  },
});

export default listingsSlice.reducer;
