"""진단 기록 표 추가 (날짜별 진단 결과 저장·비교)

Revision ID: 009_diagnosis_records
Revises: 008_saved_community_savings
Create Date: 2026-10-20

이미 있으면 건너뛴다 (여러 번 실행해도 안전).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_diagnosis_records"
down_revision: Union[str, None] = "008_saved_community_savings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "diagnosis_records" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "diagnosis_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("answers", sa.JSON(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("recommend_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("eligible_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_diagnosis_records_user_id", "diagnosis_records", ["user_id"])
    op.create_index("ix_diagnosis_records_created_at", "diagnosis_records", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_diagnosis_records_created_at", table_name="diagnosis_records")
    op.drop_index("ix_diagnosis_records_user_id", table_name="diagnosis_records")
    op.drop_table("diagnosis_records")
