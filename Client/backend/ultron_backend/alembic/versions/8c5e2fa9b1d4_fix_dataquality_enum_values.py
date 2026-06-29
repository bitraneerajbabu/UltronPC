"""Fix DataQuality enum values — migrate historical bad/uncertain data

Revision ID: 8c5e2fa9b1d4
Revises: 94ebb3c8a897
Create Date: 2026-06-29

DataQuality enum was changed:
  bad:        "U" → "B"
  uncertain:  "U" → "I"
  sensor_fail:"E" → "F"
  maintenance:"U" → "M"

This migration heuristically re-classifies existing rows based on
value patterns to approximate the correct quality flag.

Assumptions:
  - Rows where value IS NULL → bad (B) — missing data is always bad
  - Rows where value < 0  → uncertain (I) — negative was flagged "U" before
  - Rows where quality = "E" and value IS NULL → sensor_fail (F)
  - Rows where quality = "E" and value IS NOT NULL → comms_fail stays "E"
  - All other "U" rows are genuinely good — leave as "U"
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8c5e2fa9b1d4"
down_revision: Union[str, Sequence[str], None] = "94ebb3c8a897"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Bad data: rows where value IS NULL were stored as "U" but are truly bad
    op.execute(
        "UPDATE historical_data SET quality = 'B' "
        "WHERE quality = 'U' AND value IS NULL"
    )

    # Uncertain data: negative values were stored as "U" but are dubious
    op.execute(
        "UPDATE historical_data SET quality = 'I' "
        "WHERE quality = 'U' AND value < 0"
    )

    # Sensor failures: "E" with NULL value reclassify as sensor_fail "F"
    op.execute(
        "UPDATE historical_data SET quality = 'F' "
        "WHERE quality = 'E' AND value IS NULL"
    )

    # Same for averages tables
    op.execute(
        "UPDATE averages SET quality = 'B' "
        "WHERE quality = 'U' AND value IS NULL"
    )
    op.execute(
        "UPDATE averages SET quality = 'I' "
        "WHERE quality = 'U' AND value < 0"
    )
    op.execute(
        "UPDATE averages SET quality = 'F' "
        "WHERE quality = 'E' AND value IS NULL"
    )


def downgrade() -> None:
    # Reverse: put everything back to "U" (the original broken state)
    op.execute("UPDATE historical_data SET quality = 'U'")
    op.execute("UPDATE averages SET quality = 'U'")
