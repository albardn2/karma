"""attribute payments to a trip stop (for trip expected_cash)

Revision ID: d8f2c1a4b6e5
Revises: c7e1a2b9f4d3
Create Date: 2026-06-30 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd8f2c1a4b6e5'
down_revision: Union[str, None] = 'c7e1a2b9f4d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('payment', sa.Column('trip_stop_uuid', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_payment_trip_stop', 'payment', 'trip_stop', ['trip_stop_uuid'], ['uuid'])
    op.create_index('ix_payment_trip_stop_uuid', 'payment', ['trip_stop_uuid'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_payment_trip_stop_uuid', table_name='payment')
    op.drop_constraint('fk_payment_trip_stop', 'payment', type_='foreignkey')
    op.drop_column('payment', 'trip_stop_uuid')
