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

export default apiClient;
