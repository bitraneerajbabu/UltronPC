"""TimescaleDB Hypertables

Revision ID: 56ed187c1f02
Revises: 677aa04f40c4
Create Date: 2026-05-28 14:44:22.073378

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '56ed187c1f02'
down_revision: Union[str, Sequence[str], None] = '677aa04f40c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("SELECT create_hypertable('live_data', 'timestamp', if_not_exists => TRUE)")
    op.execute("SELECT create_hypertable('historical_data', 'timestamp', if_not_exists => TRUE)")
    op.execute("SELECT create_hypertable('averages', 'timestamp', if_not_exists => TRUE)")


def downgrade() -> None:
    """Downgrade schema."""
    pass
