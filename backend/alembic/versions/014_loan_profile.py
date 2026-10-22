"""대출 추천용 진단 (선택): 추천 희망 여부·목적·필요 금액·상환 기간, 지금 받고 있는 대출의 종류·금리·잔액

Revision ID: 014_loan_profile
Revises: 013_asset_detail
Create Date: 2026-10-22

모두 선택 입력. 지금 대출이 있으면 소득 기준 한도(DSR)에서 그 상환액을 빼고, 금리를 비교해 더 낮은 상품을 알려 준다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014_loan_profile"
down_revision: Union[str, None] = "013_asset_detail"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ("loan_wanted", sa.Boolean()),
    ("loan_purpose", sa.String(20)),
    ("loan_need_amount", sa.Numeric(14, 0)),
    ("loan_term_years", sa.Integer()),
    ("current_loan_type", sa.String(30)),
    ("current_loan_rate", sa.Numeric(4, 2)),
    ("current_loan_balance", sa.Numeric(14, 0)),
)


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    for name, type_ in COLUMNS:
        if name not in existing:
            op.add_column("user_profiles", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(COLUMNS):
        op.drop_column("user_profiles", name)
