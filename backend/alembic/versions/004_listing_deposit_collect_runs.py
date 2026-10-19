"""listings에 계약금 컬럼 3개 추가, collect_runs 표 추가 (코드에는 있는데 10/02 덤프 DB에는 없던 것)

Revision ID: 004_listing_deposit_collect_runs
Revises: 003_user_income
Create Date: 2026-10-07

이미 있는 DB(수집을 돌려 create_all로 만들어진 DB)에서도 실패하지 않도록, 있으면 건너뛴다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_listing_deposit_collect_runs"
down_revision: Union[str, None] = "003_user_income"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (컬럼 이름, 타입). 모두 값이 없을 수 있다 (기존 공고는 계약금 정보를 아직 못 읽은 상태)
LISTING_COLUMNS = [
    ("deposit_rate", sa.Numeric(5, 4)),  # 계약금 비율. 0.10 = 10%
    ("deposit_amount_won", sa.Numeric(14, 0)),  # 공고에 적힌 계약금 총액(원)
    ("deposit_status", sa.String(length=20)),  # later = 추후공지, none = 숫자를 찾지 못함
]


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    existing = {c["name"] for c in inspector.get_columns("listings")}
    for name, column_type in LISTING_COLUMNS:
        if name not in existing:
            op.add_column("listings", sa.Column(name, column_type, nullable=True))

    if "collect_runs" not in inspector.get_table_names():
        op.create_table(
            "collect_runs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("trigger", sa.String(length=30), nullable=False),
            sa.Column("status", sa.String(length=10), nullable=False),
            sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("failed_steps", sa.JSON(none_as_null=True), nullable=True),
        )
        op.create_index("ix_collect_runs_started_at", "collect_runs", ["started_at"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "collect_runs" in inspector.get_table_names():
        op.drop_index("ix_collect_runs_started_at", table_name="collect_runs")
        op.drop_table("collect_runs")
    existing = {c["name"] for c in inspector.get_columns("listings")}
    for name, _ in reversed(LISTING_COLUMNS):
        if name in existing:
            op.drop_column("listings", name)
