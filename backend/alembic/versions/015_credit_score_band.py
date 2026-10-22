"""대출 추천용 신용점수 구간 (선택, 사용자가 직접 고름)

Revision ID: 015_credit_score_band
Revises: 014_loan_profile
Create Date: 2026-10-22

신용대출은 신용점수 구간별 금리(파인 공시)로 추천한다. 실제 점수 조회(NICE·KCB)는 하지 않고 대략의 구간만 받는다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015_credit_score_band"
down_revision: Union[str, None] = "014_loan_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    if "credit_score_band" not in existing:
        op.add_column("user_profiles", sa.Column("credit_score_band", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("user_profiles", "credit_score_band")
