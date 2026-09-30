"""가공 레이어: 원본 테이블(listings, historical_results …)은 그대로 두고, 서비스에서 쓰기 좋게 계산한 뷰를 만든다.

  listing_features        (구체화 뷰) 전체 공고 + 평형 구간·시군구·㎡당/평당 분양가·계약금·민영 여부
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

LISTING_FEATURES = f"""
CREATE MATERIALIZED VIEW IF NOT EXISTS listing_features AS
SELECT
    l.id, l.source, l.external_id, l.model_no, l.unit_type, l.house_type, l.complex_name,
    l.region_code, l.region_name,
    CASE WHEN split_part(l.address, ' ', 2) ~ '[시군구]$' THEN split_part(l.address, ' ', 2) END AS sigungu,
    l.supply_type,
    coalesce(l.supply_type LIKE '%민영%', false) AS is_private,
    l.exclusive_area_sqm,
    {AREA_BAND.format(col="l.exclusive_area_sqm")} AS area_band,
    l.unit_size_sqm,
    l.sale_price,
    round(l.sale_price / nullif(l.exclusive_area_sqm, 0)) AS price_per_exclusive_sqm,
    round(l.sale_price / nullif(l.unit_size_sqm, 0) * 3.3058) AS price_per_pyeong,
    round(l.sale_price * 0.1) AS contract_deposit_10pct,
    l.unit_count, l.general_supply_count, l.special_supply_count, l.special_supply_detail,
    l.recruit_date, l.special_receipt_start, l.special_receipt_end, l.receipt_start, l.receipt_end,
    l.announce_date, l.contract_start, l.contract_end, l.move_in_date,
    l.is_speculative_area, l.is_adjusted_area, l.is_price_capped,
    l.notice_url, l.notice_status
FROM listings l
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
