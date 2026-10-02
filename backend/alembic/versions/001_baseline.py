"""baseline: 로컬은 create_all 로 표를 만든 상태. 이후 스키마 변경은 여기부터 버전을 쌓는다.

Revision ID: 001_baseline
Revises:
Create Date: 2026-09-28
"""

from typing import Sequence, Union

revision: str = "001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
