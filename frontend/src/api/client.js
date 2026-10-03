import axios from "axios";

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || "http://localhost:8000",
});

export function fetchListings(params) {
  return apiClient.get("/listings/", { params });
}

export function fetchListing(id) {
  return apiClient.get(`/listings/${id}`);
}

export function createUser(payload) {
  return apiClient.post("/users/", payload);
}

export function fetchRecommendations(userId) {
  return apiClient.get(`/recommendations/${userId}`);
}

export function matchLoans(userId, listingId) {
  return apiClient.post("/loans/match", { user_id: userId, listing_id: listingId });
}

export function askListingQuestion(question, listingId) {
  return apiClient.post("/chat/", { question, listing_id: listingId });
}

// 출발지(origin_address 또는 origin_listing_id) → 도착지(destination_address) 대중교통 경로
export function fetchCommute(payload) {
  return apiClient.post("/commute/", payload);
}

export default apiClient;
