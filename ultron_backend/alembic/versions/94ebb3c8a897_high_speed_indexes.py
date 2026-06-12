"""High-Speed Indexes

Revision ID: 94ebb3c8a897
Revises: 56ed187c1f02
Create Date: 2026-05-28 14:44:32.023719

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '94ebb3c8a897'
down_revision: Union[str, Sequence[str], None] = '56ed187c1f02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
