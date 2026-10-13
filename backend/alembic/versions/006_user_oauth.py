"""user_profiles에 소셜 로그인(oauth) 식별자 추가

Revision ID: 006_user_oauth
Revises: 005_user_birth_marriage
Create Date: 2026-10-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_user_oauth"
down_revision: Union[str, None] = "005_user_birth_marriage"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    if "oauth_provider" not in existing:
        op.add_column("user_profiles", sa.Column("oauth_provider", sa.String(20), nullable=True))
    if "oauth_id" not in existing:
        op.add_column("user_profiles", sa.Column("oauth_id", sa.String(128), nullable=True))
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.create_index(
            "ix_user_profiles_oauth_provider_id",
            "user_profiles",
            ["oauth_provider", "oauth_id"],
            unique=True,
            postgresql_where=sa.text("oauth_provider IS NOT NULL AND oauth_id IS NOT NULL"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_index("ix_user_profiles_oauth_provider_id", table_name="user_profiles")
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("user_profiles")}
    for name in ("oauth_id", "oauth_provider"):
        if name in existing:
            op.drop_column("user_profiles", name)
