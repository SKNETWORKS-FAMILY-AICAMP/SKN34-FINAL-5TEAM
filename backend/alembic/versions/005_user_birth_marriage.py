"""user_profiles에 생년월일·혼인 여부 추가 (만 30세 미만 미혼의 무주택기간 0점 규칙용)

Revision ID: 005_user_birth_marriage
Revises: 004_listing_deposit_collect_runs
Create Date: 2026-10-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_user_birth_marriage"
down_revision: Union[str, None] = "004_listing_deposit_collect_runs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    if "birth_date" not in existing:
        # 기존 사용자는 생년월일을 입력한 적이 없으므로 NULL (이 경우 0점 규칙을 적용하지 않는다)
        op.add_column("user_profiles", sa.Column("birth_date", sa.Date(), nullable=True))
    if "is_married" not in existing:
        # 기존 사용자 행에도 값이 필요해서 server_default를 둔다
        op.add_column("user_profiles", sa.Column("is_married", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    for name in ("is_married", "birth_date"):
        if name in existing:
            op.drop_column("user_profiles", name)
