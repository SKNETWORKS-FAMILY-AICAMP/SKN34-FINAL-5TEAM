import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { fetchListings } from "../api/client";
import { REGIONS, regionName } from "../constants/regions";
import { SAMPLE_LISTINGS } from "../constants/sampleListings";
import { daysLeft, ddayLabel, formatShortDate, formatWon, receiptStatus } from "../utils/format";
import "../styles/listings.css";

const PER_PAGE = 12;
const FETCH_SIZE = 100; // 서버 최대치. 접수 상태는 서버에서 거르고, 보기 전환·정렬은 화면에서 처리한다.

// 보기 방식: A안 카드형 / C안 지도형 / D안 일정형 / E안 표형
const VIEWS = [
  { key: "card", label: "카드형" },
  { key: "map", label: "지역 지도" },
  { key: "timeline", label: "마감 일정" },
  { key: "table", label: "비교 표" },
];

const SUPPLY_OPTIONS = [
  ["", "전체"],
  ["APT", "APT 분양"],
  ["임대", "임대"],
  ["신혼희망", "신혼희망타운"],
  ["오피스텔", "오피스텔·도시형"],
];

const STATUS_OPTIONS = ["접수중", "예정", "마감", "미정"];

// 빠른 선택: 접수 상태 + 기간 + 정렬을 한 번에 바꾼다.
const PRESETS = [
  { key: "active", label: "진행 중·예정", statuses: ["접수중", "예정"], recentDays: null, sort: "deadline" },
  { key: "recent", label: "최근 30일", statuses: ["접수중", "예정", "마감"], recentDays: 30, sort: "recent" },
  { key: "all", label: "마감 포함 전체", statuses: ["접수중", "예정", "마감", "미정"], recentDays: null, sort: "latest" },
];

const SORTS = {
  deadline: { label: "마감 임박 순", fn: (a, b) => daysLeft(a) - daysLeft(b) },
  recent: {
    label: "최근 접수 시작 순",
    fn: (a, b) => String(b.receipt_start || "").localeCompare(String(a.receipt_start || "")),
  },
  latest: { label: "최신 등록 순", fn: (a, b) => b.id - a.id },
  priceLow: { label: "분양가 낮은 순", fn: (a, b) => (a.sale_price ?? Infinity) - (b.sale_price ?? Infinity) },
  units: { label: "세대수 많은 순", fn: (a, b) => b.unit_count - a.unit_count },
};

// 전체 공고 둘러보기: 로그인 없이 누구나 볼 수 있다. (메인 검색창에서 넘어온 조건을 이어받는다)
export default function ListingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = VIEWS.some((v) => v.key === searchParams.get("view")) ? searchParams.get("view") : "card";

  const [region, setRegion] = useState(searchParams.get("region") || "");
  const [supply, setSupply] = useState(searchParams.get("supply") || "");
  const [keyword, setKeyword] = useState(searchParams.get("q") || "");
  const [statuses, setStatuses] = useState(PRESETS[0].statuses);
  const [recentDays, setRecentDays] = useState(PRESETS[0].recentDays);
  const [sort, setSort] = useState(PRESETS[0].sort);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [status, setStatus] = useState("loading"); // loading | ok | sample

  // 메인 검색창에서 다시 들어오면 주소의 조건으로 갱신한다.
  const queryString = searchParams.toString();
  useEffect(() => {
    setRegion(searchParams.get("region") || "");
    setSupply(searchParams.get("supply") || "");
    setKeyword(searchParams.get("q") || "");
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  useEffect(() => {
    setStatus("loading");
    fetchListings({
      page: 1,
      per_page: FETCH_SIZE,
      region_code: region || undefined,
      supply_type: supply || undefined,
      keyword: keyword || undefined,
      status: statuses, // 접수중·예정만 고르면 진행 중인 공고 전체를 마감 임박 순으로 받는다.
      recent_days: recentDays || undefined,
    })
      .then((res) => {
        setData(res.data);
        setStatus("ok");
      })
      .catch(() => {
        // 서버가 꺼져 있으면 화면 확인용 예시 데이터를 같은 조건으로 걸러 보여준다.
        const items = SAMPLE_LISTINGS.filter(
          (l) =>
            (!region || l.region_code === region) &&
            (!supply || l.supply_type.includes(supply)) &&
            (!keyword || l.complex_name.includes(keyword)) &&
            (!recentDays || (l.days_until_receipt_start != null && l.days_until_receipt_start >= -recentDays))
        );
        setData({ items, total: items.length });
        setStatus("sample");
      });
  }, [region, supply, keyword, statuses, recentDays]);

  // 지금 조건과 같은 빠른 선택 버튼을 켜진 상태로 보여준다.
  const activePreset = PRESETS.find(
    (p) => p.recentDays === recentDays && p.statuses.length === statuses.length && p.statuses.every((s) => statuses.includes(s))
  )?.key;
  const applyPreset = (p) => {
    setStatuses(p.statuses);
    setRecentDays(p.recentDays);
    setSort(p.sort);
    setPage(1);
  };

  // 접수 상태 필터 + 정렬은 화면에서 적용한다.
  const items = useMemo(
    () => data.items.filter((l) => statuses.includes(receiptStatus(l))).sort(SORTS[sort].fn),
    [data.items, statuses, sort]
  );

  const setView = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set("view", key);
    setSearchParams(next, { replace: true });
  };
  const change = (setter) => (value) => {
    setter(value);
    setPage(1);
  };
  const toggleStatus = (s) =>
    change(setStatuses)(statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s]);

  return (
    <div className="lp">
      <div className="lp-head">
        <h2 className="section-title">
          전체 공고 {status !== "loading" ? <span className="lp-count">{items.length}건</span> : ""}
        </h2>
        {status === "ok" && data.total > data.items.length && (
          <span className="muted small">
            전체 {data.total.toLocaleString()}건 중 {data.items.length}건 표시 · 조건을 좁혀 보세요
          </span>
        )}
        {status === "sample" && (
          <span className="chip mid" title="백엔드 서버(localhost:8000)에 연결하지 못해 예시 공고를 보여줍니다.">
            예시 데이터 · 서버 미연결
          </span>
        )}
        <div className="lp-tabs" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              className={view === v.key ? "on" : ""}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lp-body">
        {/* A안: 왼쪽 필터 사이드바 (모든 보기가 함께 쓴다) */}
        <aside className="lp-side">
          <div className="lp-group">
            <h4>빠르게 보기</h4>
            <div className="lp-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={activePreset === p.key ? "on" : ""}
                  aria-pressed={activePreset === p.key}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {recentDays && (
              <p className="muted small lp-note">
                최근 {recentDays}일 안에 접수를 시작한 공고
                <button type="button" className="lp-link" onClick={() => change(setRecentDays)(null)}>
                  기간 해제
                </button>
              </p>
            )}
          </div>
          <div className="lp-group">
            <h4>단지명</h4>
            <input
              id="lp-keyword"
              placeholder="단지명 검색"
              value={keyword}
              onChange={(e) => change(setKeyword)(e.target.value)}
            />
          </div>
          <div className="lp-group">
            <h4>지역</h4>
            <select id="lp-region" value={region} onChange={(e) => change(setRegion)(e.target.value)}>
              <option value="">전체 지역</option>
              {REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="lp-group">
            <h4>공급 유형</h4>
            {SUPPLY_OPTIONS.map(([value, label]) => (
              <label key={value || "all"} className="lp-opt">
                <input
                  type="radio"
                  name="lp-supply"
                  checked={supply === value}
                  onChange={() => change(setSupply)(value)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="lp-group">
            <h4>접수 상태</h4>
            {STATUS_OPTIONS.map((s) => (
              <label key={s} className="lp-opt">
                <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} />
                {s}
              </label>
            ))}
          </div>
          <div className="lp-group">
            <h4>정렬</h4>
            <select id="lp-sort" value={sort} onChange={(e) => change(setSort)(e.target.value)}>
              {Object.entries(SORTS).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <Link to="/dashboard" className="btn ghost small-btn">
            내 자격으로 맞는 공고만 보기
          </Link>
        </aside>

        <section className="lp-main">
          {status === "loading" && <p className="muted">불러오는 중...</p>}
          {status !== "loading" && items.length === 0 && (
            <div className="card empty">조건에 맞는 공고가 없습니다. 왼쪽 필터를 넓혀 보세요.</div>
          )}
          {status !== "loading" && items.length > 0 && (
            <>
              {view === "card" && <CardView items={items} page={page} setPage={setPage} />}
              {view === "map" && <MapView items={items} region={region} onPick={change(setRegion)} />}
              {view === "timeline" && <TimelineView items={items} />}
              {view === "table" && <TableView items={items} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// 접수 상태 → 칩 색
const STATUS_CHIP = { 접수중: "ok", 예정: "hi", 마감: "lo", 미정: "lo" };

function StatusChip({ listing }) {
  const s = receiptStatus(listing);
  return <span className={`chip ${STATUS_CHIP[s]}`}>{s}</span>;
}

function DdayChip({ listing }) {
  const d = ddayLabel(listing);
  return <span className={d.urgent ? "chip dday" : "chip lo"}>{d.text}</span>;
}

/* ---------- A안: 카드형 ---------- */
function CardView({ items, page, setPage }) {
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const current = Math.min(page, totalPages);
  const shown = items.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  return (
    <>
      <div className="lp-grid">
        {shown.map((l) => (
          <Link key={l.id} to={`/listings/${l.id}`} className="lp-card">
            <div className="lp-thumb">
              <DdayChip listing={l} />
            </div>
            <div className="lp-card-in">
              <div className="row">
                <span className="chip lo">{l.supply_type}</span>
                <StatusChip listing={l} />
              </div>
              <h3>{l.complex_name}</h3>
              <div className="muted small">
                {regionName(l.region_code)}
                {l.unit_size_sqm ? ` · ${Math.round(l.unit_size_sqm)}㎡` : ""} · 총 {l.unit_count}세대
              </div>
              <dl className="kv">
                <dt>분양가</dt>
                <dd className="num">{l.sale_price ? formatWon(l.sale_price) : "미정"}</dd>
                <dt>접수</dt>
                <dd>
                  {formatShortDate(l.receipt_start)} ~ {formatShortDate(l.receipt_end)}
                </dd>
              </dl>
            </div>
          </Link>
        ))}
      </div>
      <div className="pager">
        <button type="button" className="btn ghost" disabled={current <= 1} onClick={() => setPage(current - 1)}>
          이전
        </button>
        <span>
          {current} / {totalPages}
        </span>
        <button
          type="button"
          className="btn ghost"
          disabled={current >= totalPages}
          onClick={() => setPage(current + 1)}
        >
          다음
        </button>
      </div>
    </>
  );
}

/* ---------- C안: 지역 지도 + 목록 ---------- */
// 공고에 좌표가 없어서 시·도 위치를 격자로 배치한 분포 지도로 보여준다. [열, 행]
const TILE_POS = {
  "400": [1, 1], "100": [2, 1], "200": [3, 1], "410": [2, 2], "360": [3, 2],
  "312": [1, 3], "338": [2, 3], "712": [3, 3], "300": [2, 4], "700": [3, 4],
  "560": [1, 5], "621": [3, 5], "680": [4, 5], "500": [1, 6], "513": [2, 6],
  "600": [4, 6], "690": [1, 8],
};

function MapView({ items, region, onPick }) {
  const byRegion = useMemo(() => {
    const m = {};
    items.forEach((l) => {
      m[l.region_code] = m[l.region_code] || { count: 0, urgent: 0 };
      m[l.region_code].count += 1;
      if (receiptStatus(l) === "접수중" && daysLeft(l) <= 3) m[l.region_code].urgent += 1;
    });
    return m;
  }, [items]);
  const max = Math.max(1, ...Object.values(byRegion).map((r) => r.count));
  const listed = region ? items.filter((l) => l.region_code === region) : items;

  return (
    <div className="lp-split">
      <div className="lp-split-list">
        <div className="muted small">
          {region ? `${regionName(region)} 공고` : "전체 지역 공고"} <b className="ink">{listed.length}건</b>
          {region && (
            <button type="button" className="lp-link" onClick={() => onPick("")}>
              전체 보기
            </button>
          )}
        </div>
        {listed.slice(0, 30).map((l) => (
          <div key={l.id} className="lp-litem">
            <div className="lp-litem-thumb" />
            <div className="lp-litem-in">
              <Link to={`/listings/${l.id}`}>
                <b>{l.complex_name}</b>
              </Link>
              <span className="muted small">
                {regionName(l.region_code)} · {l.sale_price ? formatWon(l.sale_price) : "분양가 미정"}
              </span>
              <span className="row lp-left">
                <DdayChip listing={l} />
                <Link to="/commute" className="lp-link small">
                  출퇴근 시간 보기
                </Link>
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="lp-map">
        <div className="lp-map-grid">
          {REGIONS.map((r) => {
            const pos = TILE_POS[r.code];
            const info = byRegion[r.code];
            const level = info ? 0.15 + 0.85 * (info.count / max) : 0;
            return (
              <button
                key={r.code}
                type="button"
                className={`lp-tile${region === r.code ? " sel" : ""}${info ? "" : " empty"}${level > 0.55 ? " strong" : ""}`}
                style={{ gridColumn: pos[0], gridRow: pos[1], "--level": level }}
                onClick={() => onPick(region === r.code ? "" : r.code)}
                title={`${r.name} 공고 ${info?.count || 0}건`}
              >
                <span className="lp-tile-name">{r.name}</span>
                <span className="lp-tile-count">{info?.count || 0}</span>
                {info?.urgent > 0 && <span className="lp-tile-hot">마감임박 {info.urgent}</span>}
              </button>
            );
          })}
        </div>
        <div className="lp-legend">
          <span>
            <i className="lp-sw" style={{ "--level": 0.2 }} /> 적음
          </span>
          <span>
            <i className="lp-sw" style={{ "--level": 1 }} /> 많음
          </span>
          <span>
            <i className="lp-sw hot" /> 3일 내 마감 포함
          </span>
          <span className="muted">지역을 누르면 왼쪽 목록이 바뀝니다</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- D안: 마감 임박 일정 ---------- */
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function TimelineView({ items }) {
  // 공고마다 접수 시작·접수 마감·당첨 발표를 날짜별 일정으로 펼친다. (오늘 이후만)
  const days = useMemo(() => {
    const events = [];
    items.forEach((l) => {
      const add = (date, offset, kind) => {
        if (date && offset != null && offset >= 0) events.push({ date, offset, kind, l });
      };
      add(l.receipt_start, l.days_until_receipt_start, "접수 시작");
      add(l.receipt_end, l.days_until_receipt_end, "접수 마감");
      add(l.announce_date, l.days_until_announce, "당첨 발표");
    });
    const grouped = {};
    events.forEach((e) => {
      grouped[e.date] = grouped[e.date] || { date: e.date, offset: e.offset, list: [] };
      grouped[e.date].list.push(e);
    });
    return Object.values(grouped).sort((a, b) => a.offset - b.offset);
  }, [items]);

  const thisWeek = items.filter((l) => receiptStatus(l) === "접수중" && daysLeft(l) <= 7);
  const kindChip = { "접수 마감": "no", "접수 시작": "hi", "당첨 발표": "lo" };

  return (
    <div className="lp-tl-wrap">
      <div className="lp-tl card">
        {days.length === 0 && <p className="muted">다가오는 일정이 없습니다.</p>}
        {days.slice(0, 40).map((d) => {
          const dt = new Date(d.date);
          const tone = d.offset <= 3 ? "urgent" : d.offset <= 7 ? "soon" : "";
          return (
            <div key={d.date} className="lp-day">
              <div className="lp-day-date">
                {formatShortDate(d.date)} ({WEEKDAYS[dt.getDay()]})
                <small>{d.offset === 0 ? "오늘" : `D-${d.offset}`}</small>
              </div>
              <div className={`lp-ev ${tone}`}>
                {d.list.map((e) => (
                  <Link key={`${e.kind}-${e.l.id}`} to={`/listings/${e.l.id}`} className="lp-evi">
                    <span className={`chip ${kindChip[e.kind]}`}>{e.kind}</span>
                    <b>{e.l.complex_name}</b>
                    <span className="muted small lp-r">
                      {regionName(e.l.region_code)} · {e.l.sale_price ? formatWon(e.l.sale_price) : "분양가 미정"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="lp-tl-side">
        <div className="card">
          <div className="card-title">7일 안에 마감</div>
          <div className="summary-value bad">{thisWeek.length}건</div>
          {thisWeek.slice(0, 4).map((l) => (
            <div key={l.id} className="row small lp-week">
              <span title={l.complex_name}>{l.complex_name}</span>
              <DdayChip listing={l} />
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">청약 준비 서류</div>
          <ul className="lp-docs">
            <li>주민등록등본</li>
            <li>가족관계증명서</li>
            <li>소득금액증명원</li>
            <li>청약통장 가입 확인서</li>
          </ul>
          <p className="muted small">공고마다 필요한 서류는 상세 화면에서 확인하세요.</p>
        </div>
        <div className="card card-warm">
          <div className="card-title">자금도 같이 준비하세요</div>
          <p className="small">분양가에 맞는 대출·지원금을 미리 계산해 볼 수 있습니다.</p>
          <Link to="/loans" className="btn small-btn">
            자금 시뮬레이션
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------- E안: 비교 표 ---------- */
const COLUMNS = [
  { key: "complex_name", label: "단지명", get: (l) => l.complex_name },
  { key: "region", label: "지역", get: (l) => regionName(l.region_code) },
  { key: "supply_type", label: "유형", get: (l) => l.supply_type },
  { key: "unit_size_sqm", label: "전용면적", num: true, get: (l) => l.unit_size_sqm, show: (v) => (v ? `${Math.round(v)}㎡` : "-") },
  { key: "sale_price", label: "분양가", num: true, get: (l) => l.sale_price, show: (v) => (v ? formatWon(v) : "미정") },
  { key: "contract_deposit", label: "계약금", num: true, get: (l) => l.contract_deposit, show: (v) => (v ? formatWon(v) : "-") },
  { key: "unit_count", label: "세대수", num: true, get: (l) => l.unit_count, show: (v) => v.toLocaleString() },
  { key: "receipt", label: "접수 기간", get: (l) => l.receipt_start, show: (_, l) => `${formatShortDate(l.receipt_start)} ~ ${formatShortDate(l.receipt_end)}` },
  { key: "announce_date", label: "발표일", get: (l) => l.announce_date, show: (v) => formatShortDate(v) },
  { key: "move_in_date", label: "입주 예정", get: (l) => l.move_in_date, show: (v) => formatShortDate(v) },
  { key: "dday", label: "마감", num: true, get: (l) => daysLeft(l) },
];

function TableView({ items }) {
  const [sortKey, setSortKey] = useState("dday");
  const [asc, setAsc] = useState(true);
  const [picked, setPicked] = useState([]);

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey);
    return [...items].sort((a, b) => {
      const x = col.get(a);
      const y = col.get(b);
      if (x == null) return 1;
      if (y == null) return -1;
      const r = x < y ? -1 : x > y ? 1 : 0;
      return asc ? r : -r;
    });
  }, [items, sortKey, asc]);

  const sortBy = (key) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };
  const togglePick = (id) =>
    setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < 3 ? [...picked, id] : picked);
  const compared = items.filter((l) => picked.includes(l.id));

  return (
    <div className="col">
      <p className="muted small">열 이름을 누르면 정렬됩니다. 왼쪽 칸을 체크하면 최대 3개를 아래에서 나란히 비교합니다.</p>
      <div className="lp-table-wrap">
        <table className="lp-table">
          <thead>
            <tr>
              <th aria-label="비교 선택" />
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.num ? "n" : ""}>
                  <button type="button" onClick={() => sortBy(c.key)}>
                    {c.label}
                    {sortKey === c.key ? (asc ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className={picked.includes(l.id) ? "on" : ""}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${l.complex_name} 비교에 추가`}
                    checked={picked.includes(l.id)}
                    disabled={!picked.includes(l.id) && picked.length >= 3}
                    onChange={() => togglePick(l.id)}
                  />
                </td>
                {COLUMNS.map((c) => {
                  const v = c.get(l);
                  let content = c.show ? c.show(v, l) : v;
                  if (c.key === "complex_name") content = <Link to={`/listings/${l.id}`}>{v}</Link>;
                  if (c.key === "dday") content = <DdayChip listing={l} />;
                  return (
                    <td key={c.key} className={c.num ? "n" : ""}>
                      {content}
                    </td>
                  );
                })}
                <td>
                  <StatusChip listing={l} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {compared.length > 0 && (
        <div className="card">
          <div className="card-title">선택한 공고 비교 ({compared.length}/3)</div>
          <div className="lp-compare" style={{ "--cols": compared.length }}>
            <span />
            {compared.map((l) => (
              <b key={l.id}>{l.complex_name}</b>
            ))}
            {COLUMNS.filter((c) => c.key !== "complex_name").map((c) => (
              <CompareRow key={c.key} col={c} list={compared} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CompareRow({ col, list }) {
  return (
    <>
      <span className="muted">{col.label}</span>
      {list.map((l) => {
        const v = col.get(l);
        return (
          <span key={l.id} className="num">
            {col.key === "dday" ? ddayLabel(l).text : col.show ? col.show(v, l) : v}
          </span>
        );
      })}
    </>
  );
}
