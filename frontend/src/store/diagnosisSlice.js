import { createSlice } from "@reduxjs/toolkit";

// 청약 진단(목업 ⓪ 홈) 입력값. AI 상담·공고 분석·전략 리포트 화면이 같이 쓴다.
const initialState = {
  done: false, // 결과까지 본 적이 있는지
  age: 32,
  marital: "newlywed", // single | newlywed | married
  householder: true,
  region: "서울",
  homeOwn: "none", // none | one | multi
  noHouseYears: 3,
  firstTime: true,
  dependents: 1,
  minorKids: 0,
  newborn: false,
  parentSupport: false,
  accountType: "total", // total | saving | deposit | install
  accountYears: 4,
  payments: 48,
  deposit: 300, // 예치금(만원)
  income: 130, // 도시근로자 월평균소득 대비 %
  assets: 25, // 가용 자산(0.1억 단위, 25 = 2.5억)
  wantRegions: ["서울", "경기"],
  supply: ["공공분양", "민간분양"],
  size: "mid", // small | mid | large
  requestText: "",
  conditions: [],
  dualIncome: null,
};

const diagnosisSlice = createSlice({
  name: "diagnosis",
  initialState,
  reducers: {
    setDiagnosisField: (state, action) => {
      const { field, value } = action.payload;
      state[field] = value;
    },
    resetDiagnosis: () => initialState,
  },
});

export const { setDiagnosisField, resetDiagnosis } = diagnosisSlice.actions;
export default diagnosisSlice.reducer;
