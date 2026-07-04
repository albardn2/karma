"""trip inventory snapshots + link vehicle events to order items

Revision ID: c7e1a2b9f4d3
Revises: b1f3a7c9d2e4
Create Date: 2026-06-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c7e1a2b9f4d3'
down_revision: Union[str, None] = 'b1f3a7c9d2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('trip', sa.Column('start_inventory', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('trip', sa.Column('end_inventory', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    op.add_column(
        'vehicle_inventory_event',
        sa.Column('customer_order_item_uuid', sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        'fk_vehicle_inventory_event_coi',
        'vehicle_inventory_event',
        'customer_order_item',
        ['customer_order_item_uuid'],
        ['uuid'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_vehicle_inventory_event_coi', 'vehicle_inventory_event', type_='foreignkey')
    op.drop_column('vehicle_inventory_event', 'customer_order_item_uuid')
    op.drop_column('trip', 'end_inventory')
    op.drop_column('trip', 'start_inventory')
