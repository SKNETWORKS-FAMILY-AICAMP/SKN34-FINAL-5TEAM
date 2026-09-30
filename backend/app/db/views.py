"""가공 레이어: 원본 테이블(listings, historical_results …)은 그대로 두고, 서비스에서 쓰기 좋게 계산한 뷰를 만든다.

  listing_features        (구체화 뷰) 전체 공고 + 평형 구간·시군구·계약금·민영 여부
                          + 전용/공급 탭용 평 단위 면적·평당 분양가 (1평 = 3.3058㎡)
                          + API에 없는 공급면적 보완 (unit_size_source: API / 같은 단지 APT). 추정값은 넣지 않음
  recommendable_listings  (일반 뷰)   listing_features 중 접수 예정·접수 중인 공고만 (조회 시점의 한국 날짜 기준)
  cutoff_stats            (구체화 뷰) APT 당첨가점 커트라인 통계: 지역 x 시군구 x 평형 구간 x 민영 여부 x 거주구분 x 연도
  competition_stats       (구체화 뷰) 경쟁률 통계: 주택 유형 x 지역 x 시군구 x 평형 구간 x 세부구분 x 연도

구체화 뷰는 수집이 끝날 때 save_listings.py가 refresh_views()로 다시 계산한다.
뷰 정의를 바꾼 뒤에는 다시 만들어야 한다:  cd backend && python -m app.db.views
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine

AREA_BAND = """CASE WHEN {col} IS NULL THEN NULL
       WHEN {col} <= 60 THEN '60㎡ 이하'
       WHEN {col} <= 85 THEN '60~85㎡'
       ELSE '85㎡ 초과' END"""

# 공급면적 보완 순서 (원본 listings.unit_size_sqm은 API 값 그대로 둔다). 실제 값만 쓰고 추정값은 넣지 않는다
#   1) API 값
#   2) 같은 단지 APT 공고의 같은 주택형 값 — 무순위·임의공급은 대부분 APT 분양의 남은 세대라서 실제 값이 있다
#      (검증: API 값이 있는 무순위 74행 중 72행 일치)
#   둘 다 없으면 비워 둔다 (오피스텔은 API에 공급면적이 없음)
LISTING_FEATURES = f"""
CREATE MATERIALIZED VIEW IF NOT EXISTS listing_features AS
WITH apt_by_address AS (
    SELECT DISTINCT ON (unit_type, address) unit_type, address, unit_size_sqm
    FROM listings
    WHERE house_type = 'APT' AND unit_size_sqm > 0
    ORDER BY unit_type, address, recruit_date DESC
),
apt_by_name AS (
    SELECT DISTINCT ON (unit_type, replace(complex_name, ' ', '')) unit_type,
           replace(complex_name, ' ', '') AS name_key, unit_size_sqm
    FROM listings
    WHERE house_type = 'APT' AND unit_size_sqm > 0
    ORDER BY unit_type, replace(complex_name, ' ', ''), recruit_date DESC
),
filled AS (
    SELECT l.*,
           {AREA_BAND.format(col="l.exclusive_area_sqm")} AS area_band,
           coalesce(l.unit_size_sqm, a1.unit_size_sqm, a2.unit_size_sqm) AS filled_unit_size_sqm,
           CASE WHEN l.unit_size_sqm IS NOT NULL THEN 'API'
                WHEN a1.unit_size_sqm IS NOT NULL OR a2.unit_size_sqm IS NOT NULL THEN '같은 단지 APT'
           END AS unit_size_source
    FROM listings l
    LEFT JOIN apt_by_address a1
           ON l.unit_size_sqm IS NULL AND a1.unit_type = l.unit_type AND a1.address = l.address
    LEFT JOIN apt_by_name a2
           ON l.unit_size_sqm IS NULL AND a1.unit_size_sqm IS NULL
          AND a2.unit_type = l.unit_type AND a2.name_key = replace(l.complex_name, ' ', '')
)
SELECT
    l.id, l.source, l.external_id, l.model_no, l.unit_type, l.house_type, l.complex_name,
    l.region_code, l.region_name,
    CASE WHEN split_part(l.address, ' ', 2) ~ '[시군구]$' THEN split_part(l.address, ' ', 2) END AS sigungu,
    l.supply_type,
    coalesce(l.supply_type LIKE '%민영%', false) AS is_private,
    l.exclusive_area_sqm,
    l.area_band,
    l.filled_unit_size_sqm AS unit_size_sqm,
    l.unit_size_source,
    round(l.exclusive_area_sqm / 3.3058, 1) AS exclusive_pyeong,
    round(l.filled_unit_size_sqm / 3.3058, 1) AS supply_pyeong,
    l.sale_price,
    round(l.sale_price / nullif(l.exclusive_area_sqm, 0)) AS price_per_exclusive_sqm,
    round(l.sale_price / nullif(l.exclusive_area_sqm, 0) * 3.3058) AS price_per_exclusive_pyeong,
    round(l.sale_price / nullif(l.filled_unit_size_sqm, 0) * 3.3058) AS price_per_supply_pyeong,
    round(l.sale_price * 0.1) AS contract_deposit_10pct,
    l.unit_count, l.general_supply_count, l.special_supply_count, l.special_supply_detail,
    l.recruit_date, l.special_receipt_start, l.special_receipt_end, l.receipt_start, l.receipt_end,
    l.announce_date, l.contract_start, l.contract_end, l.move_in_date,
    l.is_speculative_area, l.is_adjusted_area, l.is_price_capped,
    l.notice_url, l.notice_status
FROM filled l
"""

RECOMMENDABLE_LISTINGS = """
CREATE OR REPLACE VIEW recommendable_listings AS
SELECT
    f.*,
    CASE WHEN (now() AT TIME ZONE 'Asia/Seoul')::date < coalesce(f.special_receipt_start, f.receipt_start)
         THEN '접수 예정' ELSE '접수 중' END AS receipt_status,
    coalesce(f.special_receipt_start, f.receipt_start) - (now() AT TIME ZONE 'Asia/Seoul')::date AS days_until_receipt
FROM listing_features f
WHERE f.receipt_end >= (now() AT TIME ZONE 'Asia/Seoul')::date
"""

# 경쟁률·가점 행에 공고의 시군구·평형 구간·민영 여부를 붙이기 위한 주택형 단위 목록
_UNITS = """
units AS (
    SELECT DISTINCT ON (external_id, unit_type) external_id, unit_type, sigungu, area_band, is_private
    FROM listing_features
    WHERE source = 'applyhome'
    ORDER BY external_id, unit_type, id
)"""

CUTOFF_STATS = f"""
CREATE MATERIALIZED VIEW IF NOT EXISTS cutoff_stats AS
WITH {_UNITS}
SELECT
    h.region_code,
    u.sigungu,
    coalesce(u.area_band, {AREA_BAND.format(col="h.exclusive_area_sqm")}) AS area_band,
    u.is_private,
    h.category_label AS reside_label,
    h.year,
    count(*) AS sample_count,
    count(DISTINCT h.external_id) AS notice_count,
    round(avg(h.cutoff_score), 2) AS avg_cutoff,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY h.cutoff_score) AS median_cutoff,
    min(h.cutoff_score) AS min_cutoff,
    max(h.cutoff_score) AS max_cutoff,
    round(avg(h.avg_score), 2) AS avg_winner_score
FROM historical_results h
LEFT JOIN units u USING (external_id, unit_type)
WHERE h.result_type = '당첨가점' AND h.cutoff_score IS NOT NULL
GROUP BY 1, 2, 3, 4, 5, 6
"""

COMPETITION_STATS = f"""
CREATE MATERIALIZED VIEW IF NOT EXISTS competition_stats AS
WITH {_UNITS}
SELECT
    h.house_type,
    h.region_code,
    u.sigungu,
    coalesce(u.area_band, {AREA_BAND.format(col="h.exclusive_area_sqm")}) AS area_band,
    h.category_label,
    h.year,
    count(*) AS sample_count,
    count(DISTINCT h.external_id) AS notice_count,
    sum(h.supply_count) AS total_supply,
    sum(h.apply_count) AS total_apply,
    round(sum(h.apply_count)::numeric / nullif(sum(h.supply_count), 0), 2) AS overall_rate,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY h.competition_rate) AS median_rate,
    round(avg(h.is_undersubscribed::int), 3) AS undersubscribed_ratio
FROM historical_results h
LEFT JOIN units u USING (external_id, unit_type)
WHERE h.result_type = '경쟁률'
GROUP BY 1, 2, 3, 4, 5, 6
"""

MATERIALIZED = ("listing_features", "cutoff_stats", "competition_stats")


def create_views(engine: Engine) -> None:
    """없으면 만든다 (이미 있으면 그대로 둠)."""
    with engine.begin() as conn:
        conn.execute(text(LISTING_FEATURES))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_listing_features_id ON listing_features (id)"))
        conn.execute(text(RECOMMENDABLE_LISTINGS))
        conn.execute(text(CUTOFF_STATS))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cutoff_stats_lookup ON cutoff_stats (region_code, area_band, year)"))
        conn.execute(text(COMPETITION_STATS))


def refresh_views(engine: Engine) -> None:
    """원본 테이블이 바뀐 뒤 구체화 뷰를 다시 계산한다."""
    with engine.begin() as conn:
        for name in MATERIALIZED:
            conn.execute(text(f"REFRESH MATERIALIZED VIEW {name}"))


def rebuild_views(engine: Engine) -> None:
    """뷰 정의를 바꿨을 때: 지우고 다시 만든다 (원본 테이블은 건드리지 않음)."""
    with engine.begin() as conn:
        conn.execute(text("DROP VIEW IF EXISTS recommendable_listings"))
        for name in reversed(MATERIALIZED):
            conn.execute(text(f"DROP MATERIALIZED VIEW IF EXISTS {name} CASCADE"))
    create_views(engine)


if __name__ == "__main__":
    from app.db.session import engine as _engine

    rebuild_views(_engine)
    print("가공 레이어를 다시 만들었습니다.")
