"""관심 공고, 커뮤니티(게시글·댓글·공감), 예적금 상품 표 추가

Revision ID: 008_saved_community_savings
Revises: 007_user_nickname
Create Date: 2026-10-14

이미 있는 표는 건너뛴다 (여러 번 실행해도 안전).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_saved_community_savings"
down_revision: Union[str, None] = "007_user_nickname"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create(name: str, *columns, indexes=()):
    if name in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(name, *columns)
    for column in indexes:
        op.create_index(f"ix_{name}_{column}", name, [column])


def upgrade() -> None:
    now = sa.func.now()
    _create("saved_listings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False),
            sa.Column("listing_id", sa.Integer(), sa.ForeignKey("listings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=now),
            sa.UniqueConstraint("user_id", "listing_id", name="uq_saved_user_listing"),
            indexes=("user_id", "listing_id"))
    _create("posts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False),
            sa.Column("author", sa.String(50), nullable=False),
            sa.Column("scope", sa.String(10), nullable=False),
            sa.Column("region", sa.String(20)),
            sa.Column("board", sa.String(30), nullable=False),
            sa.Column("age", sa.String(20)),
            sa.Column("title", sa.String(100), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=now),
            indexes=("user_id", "scope", "region", "board", "created_at"))
    _create("post_comments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False),
            sa.Column("author", sa.String(50), nullable=False),
            sa.Column("body", sa.String(1000), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=now),
            indexes=("post_id",))
    _create("post_likes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False),
            sa.UniqueConstraint("post_id", "user_id", name="uq_like_post_user"),
            indexes=("post_id",))
    _create("savings_products",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("kind", sa.String(10), nullable=False),
            sa.Column("fin_group", sa.String(20)),
            sa.Column("fin_co_no", sa.String(20), nullable=False),
            sa.Column("fin_prdt_cd", sa.String(50), nullable=False),
            sa.Column("company_name", sa.String(100)),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("join_way", sa.String(255)),
            sa.Column("maturity_interest", sa.Text()),
            sa.Column("special_condition", sa.Text()),
            sa.Column("join_deny", sa.String(5)),
            sa.Column("join_member", sa.String(255)),
            sa.Column("etc_note", sa.Text()),
            sa.Column("max_limit", sa.Numeric(14, 0)),
            sa.Column("disclosure_month", sa.String(6)),
            sa.Column("rate_min", sa.Numeric(5, 2)),
            sa.Column("rate_max", sa.Numeric(5, 2)),
            sa.UniqueConstraint("kind", "fin_co_no", "fin_prdt_cd", name="uq_savings_kind_company_code"),
            indexes=("kind",))
    _create("savings_rate_options",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("savings_products.id", ondelete="CASCADE"), nullable=False),
            sa.Column("save_months", sa.Integer()),
            sa.Column("rate_type", sa.String(20)),
            sa.Column("reserve_type", sa.String(20)),
            sa.Column("rate", sa.Numeric(5, 2)),
            sa.Column("rate_best", sa.Numeric(5, 2)),
            indexes=("product_id",))


def downgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    for name in ("savings_rate_options", "savings_products", "post_likes", "post_comments", "posts", "saved_listings"):
        if name in existing:
            op.drop_table(name)
