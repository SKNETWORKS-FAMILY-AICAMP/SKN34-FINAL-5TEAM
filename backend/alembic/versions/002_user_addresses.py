"""user_profiles에 직장 주소·현재 집 주소 추가 (출퇴근 경로 비교용)

Revision ID: 002_user_addresses
Revises: 001_baseline
Create Date: 2026-10-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_user_addresses"
down_revision: Union[str, None] = "001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_profiles", sa.Column("workplace_address", sa.String(length=255), nullable=True))
    op.add_column("user_profiles", sa.Column("home_address", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("user_profiles", "home_address")
    op.drop_column("user_profiles", "workplace_address")
