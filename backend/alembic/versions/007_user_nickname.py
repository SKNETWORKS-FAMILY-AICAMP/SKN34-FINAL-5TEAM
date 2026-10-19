"""user_profiles에 닉네임 추가 (화면 로그인: 이메일 + 닉네임이 맞으면 로그인)

Revision ID: 007_user_nickname
Revises: 006_user_oauth
Create Date: 2026-10-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_user_nickname"
down_revision: Union[str, None] = "006_user_oauth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 이미 컬럼이 있으면 건너뛴다 (006과 같은 방식: 여러 번 실행해도 안전)
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    if "nickname" not in existing:
        op.add_column("user_profiles", sa.Column("nickname", sa.String(50), nullable=True))


def downgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    if "nickname" in existing:
        op.drop_column("user_profiles", "nickname")
