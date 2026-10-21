"""사용자 프로필에 청약 1순위 판정용 항목 추가

Revision ID: 010_user_first_priority
Revises: 009_diagnosis_records
Create Date: 2026-10-21

거주 시·도, 세대 주택 수, 청약통장 잔액, 최근 5년 당첨 이력, 미성년 자녀 수 (모두 선택 입력, 없으면 NULL)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010_user_first_priority"
down_revision: Union[str, None] = "009_diagnosis_records"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ("residence_region_code", sa.String(20)),
    ("house_count", sa.Integer()),
    ("deposit_balance", sa.Numeric(14, 0)),
    ("won_within_5y", sa.Boolean()),
    ("minor_children", sa.Integer()),
)


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    for name, kind in COLUMNS:
        if name not in existing:
            op.add_column("user_profiles", sa.Column(name, kind, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(COLUMNS):
        op.drop_column("user_profiles", name)
