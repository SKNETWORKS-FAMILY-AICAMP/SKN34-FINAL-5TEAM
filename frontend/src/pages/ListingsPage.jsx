import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { fetchListings } from "../api/client";
import { REGIONS, regionName } from "../constants/regions";
import { ddayLabel, formatShortDate, formatWon } from "../utils/format";

const PER_PAGE = 12;

// 전체 공고 둘러보기: 로그인 없이 누구나 볼 수 있다. (메인 검색창에서 넘어온 조건을 이어받는다)
export default function ListingsPage() {
  const [searchParams] = useSearchParams();
  const [region, setRegion] = useState(searchParams.get("region") || "");
  const [supply, setSupply] = useState(searchParams.get("supply") || "");
  const [keyword, setKeyword] = useState(searchParams.get("q") || "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [status, setStatus] = useState("loading");

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
      page,
      per_page: PER_PAGE,
      region_code: region || undefined,
      supply_type: supply || undefined,
      keyword: keyword || undefined,
    })
      .then((res) => {
        setData(res.data);
        setStatus("ok");
      })
      .catch(() => setStatus("failed"));
  }, [region, supply, keyword, page]);

  const totalPages = Math.max(1, Math.ceil(data.total / PER_PAGE));
  const change = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div className="col">
      <div className="row wrap">
        <h2 className="section-title">전체 공고 {status === "ok" ? `${data.total}건` : ""}</h2>
        <div className="row">
          <select value={region} onChange={change(setRegion)}>
            <option value="">전체 지역</option>
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
          <input placeholder="공급유형 (예: APT)" value={supply} onChange={change(setSupply)} />
          <input placeholder="단지명 검색" value={keyword} onChange={change(setKeyword)} />
        </div>
      </div>
      {status === "loading" && <p className="muted">불러오는 중...</p>}
      {status === "failed" && <p className="error">불러오기 실패: 서버가 켜져 있는지 확인해 주세요.</p>}
      {status === "ok" && data.items.length === 0 && (
        <div className="card empty">조건에 맞는 공고가 없습니다.</div>
      )}
      <div className="card-grid">
        {data.items.map((l) => (
          <Link key={l.id} to={`/listings/${l.id}`} className="listing-card">
            <div className="row">
              <span className="chip lo">{l.supply_type}</span>
              <span className={ddayLabel(l).urgent ? "chip dday" : "chip lo"}>{ddayLabel(l).text}</span>
            </div>
            <h3>{l.complex_name}</h3>
            <div className="muted small">
              {regionName(l.region_code)} · 총 {l.unit_count}세대
            </div>
            <dl className="kv">
              <dt>분양가</dt>
              <dd>{l.sale_price ? formatWon(l.sale_price) : "미정"}</dd>
              <dt>접수</dt>
              <dd>
                {formatShortDate(l.receipt_start)} ~ {formatShortDate(l.receipt_end)}
              </dd>
            </dl>
          </Link>
        ))}
      </div>
      <div className="pager">
        <button type="button" className="btn ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          이전
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button type="button" className="btn ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          다음
        </button>
      </div>
    </div>
  );
}
