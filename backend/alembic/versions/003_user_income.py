"""user_profiles에 연 소득 추가 (대출 상환능력 계산용)

Revision ID: 003_user_income
Revises: 002_user_addresses
Create Date: 2026-10-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_user_income"
down_revision: Union[str, None] = "002_user_addresses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL 허용: 기존 사용자는 소득을 입력한 적이 없으므로 값 없음(NULL)으로 둔다 (0원이 아니다)
    op.add_column("user_profiles", sa.Column("annual_income", sa.Numeric(14, 0), nullable=True))


def downgrade() -> None:
    op.drop_column("user_profiles", "annual_income")
