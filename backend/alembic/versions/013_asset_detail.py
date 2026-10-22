"""공공임대 총자산 판정용 상세 자산 (부동산·자동차·기타 금융자산·부채)

Revision ID: 013_asset_detail
Revises: 012_household_welfare
Create Date: 2026-10-22

국민임대·행복주택 등은 총자산(부동산+자동차+금융자산-부채)과 자동차 가액으로 자격을 본다. 모두 선택 입력.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_asset_detail"
down_revision: Union[str, None] = "012_household_welfare"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = ("real_estate_value", "car_value", "other_financial_assets", "debt_amount")


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    for name in COLUMNS:
        if name not in existing:
            op.add_column("user_profiles", sa.Column(name, sa.Numeric(14, 0), nullable=True))


def downgrade() -> None:
    for name in reversed(COLUMNS):
        op.drop_column("user_profiles", name)
