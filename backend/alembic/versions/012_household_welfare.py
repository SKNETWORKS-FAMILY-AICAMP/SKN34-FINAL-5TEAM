"""임대 자격 판정용: 가구원 수, 수급·차상위 여부

Revision ID: 012_household_welfare
Revises: 011_active_diagnosis
Create Date: 2026-10-22

국민임대·행복주택 등 소득 기준이 가구원수별이고, 영구임대·매입임대는 수급자·차상위가 대상이라 두 칸을 더한다 (모두 선택 입력).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012_household_welfare"
down_revision: Union[str, None] = "011_active_diagnosis"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (("household_size", sa.Integer()), ("welfare_status", sa.String(20)))


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    for name, kind in COLUMNS:
        if name not in existing:
            op.add_column("user_profiles", sa.Column(name, kind, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(COLUMNS):
        op.drop_column("user_profiles", name)
