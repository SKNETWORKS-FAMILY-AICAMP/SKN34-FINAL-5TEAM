// 금액·날짜 표시용 공통 함수

// 원 단위 금액을 "4억 6,000만" 형태로 표시한다.
export function formatWon(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return "-";
  const n = Math.round(Number(amount));
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const eok = Math.floor(abs / 100000000);
  const man = Math.floor((abs % 100000000) / 10000);
  if (eok && man) return `${sign}${eok}억 ${man.toLocaleString()}만`;
  if (eok) return `${sign}${eok}억`;
  if (man) return `${sign}${man.toLocaleString()}만`;
  return `${sign}${abs.toLocaleString()}원`;
}

// "2026-10-05" → "10.05" (올해가 아니면 "2028.03.01")
export function formatShortDate(value) {
  if (!value) return "-";
  const [y, m, d] = String(value).split("-");
  if (!m || !d) return String(value);
  return Number(y) === new Date().getFullYear() ? `${m}.${d}` : `${y}.${m}.${d}`;
}

// 공고의 접수 상태를 D-day 라벨로 바꾼다.
export function ddayLabel(listing) {
  const start = listing.days_until_receipt_start;
  const end = listing.days_until_receipt_end;
  if (start != null && start > 0) return { text: `접수 D-${start}`, urgent: start <= 7 };
  if (end != null && end > 0) return { text: `마감 D-${end}`, urgent: true };
  if (end === 0) return { text: "오늘 마감", urgent: true };
  if (end != null && end < 0) return { text: "접수 마감", urgent: false };
  return { text: "일정 미정", urgent: false };
}

// 정렬용: 접수 마감까지 남은 일수 (마감·미정은 뒤로)
export function daysLeft(listing) {
  const end = listing.days_until_receipt_end;
  return end == null || end < 0 ? Number.MAX_SAFE_INTEGER : end;
}

// "2026-10-05" → "2026-10-05" 형태의 로컬 날짜 키 (Date → 문자열)
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 공고의 접수 상태: 예정 / 접수중 / 마감 / 미정
export function receiptStatus(listing) {
  const start = listing.days_until_receipt_start;
  const end = listing.days_until_receipt_end;
  if (start == null && end == null) return "미정";
  if (end != null && end < 0) return "마감";
  if (start != null && start > 0) return "예정";
  return "접수중";
}
