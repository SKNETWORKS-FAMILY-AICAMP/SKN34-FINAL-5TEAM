import { configureStore } from "@reduxjs/toolkit";

import userReducer from "./userSlice";
import listingsReducer from "./listingsSlice";
import loansReducer from "./loansSlice";

export const store = configureStore({
  reducer: {
    user: userReducer,
    listings: listingsReducer,
    loans: loansReducer,
  },
});
