"""사용자가 '사용 중'으로 고른 진단 기록

Revision ID: 011_active_diagnosis
Revises: 010_user_first_priority
Create Date: 2026-10-21

user_profiles.active_diagnosis_id (선택, 없으면 가장 최근 진단 기록을 사용 중으로 본다).
외래키는 걸지 않는다: 회원 탈퇴 때 user_profiles ↔ diagnosis_records 가 서로를 지우며 꼬이지 않게. 기록을 지우면 API가 비운다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011_active_diagnosis"
down_revision: Union[str, None] = "010_user_first_priority"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    if "active_diagnosis_id" not in existing:
        op.add_column("user_profiles", sa.Column("active_diagnosis_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_profiles", "active_diagnosis_id")
