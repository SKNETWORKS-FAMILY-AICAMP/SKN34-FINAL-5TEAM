import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";

import { fetchListings } from "../api/client";
import { REGIONS, regionName } from "../constants/regions";
import { ddayLabel, formatShortDate, formatWon, receiptStatus, toDateKey } from "../utils/format";

const QUICK = [
  ["🏠", "공고 둘러보기", "/listings"],
  ["🎯", "맞춤 추천", "/dashboard"],
  ["💰", "자금 계획", "/loans"],
  ["💬", "공고 질문", "/chat"],
];
const TABS = ["접수중", "예정", "마감"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 슬라이드 배너: 최근 공고를 5초마다 넘겨 보여준다.
function HeroBanner({ items }) {
  const slides = items.slice(0, 5);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const current = slides[index];
  const move = (step) => setIndex((i) => (i + step + slides.length) % slides.length);

  return (
    <section className="banner">
      <div className="banner-text">
        <p className="banner-tag">내 집 마련, 공고부터 대출까지 한곳에서</p>
        {current ? (
          <>
            <div className="chip-group">
              <span className="chip hi">{current.supply_type}</span>
              <span className="chip lo">{receiptStatus(current)}</span>
            </div>
            <h1>{current.complex_name}</h1>
            <p className="banner-sub">
              {regionName(current.region_code)} · 총 {current.unit_count}세대 ·{" "}
              {current.sale_price ? `분양가 ${formatWon(current.sale_price)}` : "분양가 미정"}
              <br />
              접수 {formatShortDate(current.receipt_start)} ~ {formatShortDate(current.receipt_end)}
            </p>
            <Link to={`/listings/${current.id}`} className="btn light">
              자세히 보기
            </Link>
          </>
        ) : (
          <>
            <h1>청약 공고를 한눈에</h1>
            <p className="banner-sub">공고를 불러오면 이곳에 최근 공고가 표시됩니다.</p>
          </>
        )}
      </div>
      {slides.length > 1 && (
        <div className="banner-ctrl">
          <button type="button" onClick={() => move(-1)} aria-label="이전 공고">
            ‹
          </button>
          <span>
            {index + 1} / {slides.length}
          </span>
          <button type="button" onClick={() => move(1)} aria-label="다음 공고">
            ›
          </button>
        </div>
      )}
    </section>
  );
}

function SearchBar() {
  const navigate = useNavigate();
  const [region, setRegion] = useState("");
  const [supply, setSupply] = useState("");
  const [keyword, setKeyword] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (supply) params.set("supply", supply);
    if (keyword.trim()) params.set("q", keyword.trim());
    navigate(`/listings?${params.toString()}`);
  };

  return (
    <form className="search-bar" onSubmit={submit}>
      <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="지역">
        <option value="">전체 지역</option>
        {REGIONS.map((r) => (
          <option key={r.code} value={r.code}>
            {r.name}
          </option>
        ))}
      </select>
      <input
        value={supply}
        onChange={(e) => setSupply(e.target.value)}
        placeholder="공급유형 (예: APT, 공공임대)"
        aria-label="공급유형"
      />
      <input
        className="grow"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="단지명으로 검색"
        aria-label="단지명"
      />
      <button type="submit" className="btn">
        검색
      </button>
    </form>
  );
}

// 청약 일정 달력: 접수 시작·마감·발표일이 있는 날에 점을 찍는다.
function ScheduleCalendar({ items }) {
  const today = new Date();
  const [selected, setSelected] = useState(toDateKey(today));
  const year = today.getFullYear();
  const month = today.getMonth();

  const events = useMemo(() => {
    const map = {};
    const add = (date, label, listing) => {
      if (!date) return;
      (map[date] = map[date] || []).push({ label, listing });
    };
    items.forEach((l) => {
      add(l.receipt_start, "접수 시작", l);
      add(l.receipt_end, "접수 마감", l);
      add(l.announce_date, "당첨자 발표", l);
    });
    return map;
  }, [items]);

  const firstWeekday = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: lastDate }, (_, i) => i + 1)];
  const dayEvents = events[selected] || [];

  return (
    <div className="calendar">
      <div className="card-title">
        청약 일정 <span className="muted small">{year}년 {month + 1}월</span>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-head">
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <span key={`e${i}`} />;
          const key = toDateKey(new Date(year, month, day));
          return (
            <button
              type="button"
              key={key}
              className={`cal-day${key === selected ? " on" : ""}${key === toDateKey(today) ? " today" : ""}`}
              onClick={() => setSelected(key)}
            >
              {day}
              {events[key] && <i />}
            </button>
          );
        })}
      </div>
      <div className="cal-list">
        <div className="small muted">
          {selected === toDateKey(today) ? "오늘" : selected}의 청약 일정
        </div>
        {dayEvents.length === 0 && <p className="muted small">예정된 일정이 없습니다.</p>}
        {dayEvents.map((ev, i) => (
          <Link key={i} to={`/listings/${ev.listing.id}`} className="cal-item">
            <span className="chip lo">{ev.label}</span>
            <span>{ev.listing.complex_name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// 메인 화면: 로그인 없이 누구나 볼 수 있다.
export default function HomePage() {
  const userId = useSelector((state) => state.user.id);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [tab, setTab] = useState("접수중");

  useEffect(() => {
    fetchListings({ page: 1, per_page: 40 })
      .then((res) => {
        setItems(res.data.items || []);
        setStatus("ok");
      })
      .catch(() => setStatus("failed"));
  }, []);

  const tabItems = items.filter((l) => receiptStatus(l) === tab).slice(0, 8);

  return (
    <div className="home">
      <HeroBanner items={items} />
      <SearchBar />

      <section className="quick">
        {QUICK.map(([icon, label, to]) => (
          <Link key={to} to={to === "/dashboard" && !userId ? "/start" : to} className="quick-item">
            <span className="quick-icon">{icon}</span>
            {label}
          </Link>
        ))}
      </section>

      <div className="home-two">
        <section className="card">
          <div className="row">
            <h2 className="section-title">청약 공고</h2>
            <Link to="/listings" className="small">
              더보기 +
            </Link>
          </div>
          <div className="tabs">
            {TABS.map((t) => (
              <button type="button" key={t} className={t === tab ? "tab on" : "tab"} onClick={() => setTab(t)}>
                {t} {items.filter((l) => receiptStatus(l) === t).length}
              </button>
            ))}
          </div>
          {status === "loading" && <p className="muted">공고를 불러오는 중...</p>}
          {status === "failed" && (
            <p className="error">공고를 불러오지 못했습니다. 서버가 켜져 있는지 확인해 주세요.</p>
          )}
          {status === "ok" && tabItems.length === 0 && <p className="muted">해당하는 공고가 없습니다.</p>}
          <ul className="notice-list">
            {tabItems.map((l) => (
              <li key={l.id}>
                <Link to={`/listings/${l.id}`}>
                  <span className="chip lo">{l.supply_type}</span>
                  <span className="notice-name">{l.complex_name}</span>
                  <span className="muted small">{regionName(l.region_code)}</span>
                  <span className="muted small notice-date">
                    {formatShortDate(l.receipt_start)} ~ {formatShortDate(l.receipt_end)}
                  </span>
                  <span className={ddayLabel(l).urgent ? "chip dday" : "chip lo"}>{ddayLabel(l).text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <ScheduleCalendar items={items} />
        </section>
      </div>
    </div>
  );
}
