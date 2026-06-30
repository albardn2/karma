"""add vehicle inventory (independent of warehouse inventory)

Revision ID: b1f3a7c9d2e4
Revises: fc6fa8ebb3e3
Create Date: 2026-06-30 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b1f3a7c9d2e4'
down_revision: Union[str, None] = 'fc6fa8ebb3e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'vehicle_inventory',
        sa.Column('uuid', sa.String(length=36), nullable=False),
        sa.Column('created_by_uuid', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('vehicle_uuid', sa.String(length=36), nullable=False),
        sa.Column('material_uuid', sa.String(length=36), nullable=False),
        sa.Column('unit', sa.String(length=120), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('currency', sa.String(length=120), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_uuid'], ['user.uuid']),
        sa.ForeignKeyConstraint(['vehicle_uuid'], ['vehicle.uuid']),
        sa.ForeignKeyConstraint(['material_uuid'], ['material.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )
    # one active stock row per (vehicle, material)
    op.create_index(
        'uq_vehicle_inventory_vehicle_material_active',
        'vehicle_inventory',
        ['vehicle_uuid', 'material_uuid'],
        unique=True,
        postgresql_where=sa.text('is_deleted = false'),
    )

    op.create_table(
        'vehicle_inventory_event',
        sa.Column('uuid', sa.String(length=36), nullable=False),
        sa.Column('created_by_uuid', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('vehicle_inventory_uuid', sa.String(length=36), nullable=False),
        sa.Column('material_uuid', sa.String(length=36), nullable=False),
        sa.Column('event_type', sa.String(length=120), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('cost_per_unit', sa.Float(), nullable=True),
        sa.Column('currency', sa.String(length=120), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_uuid'], ['user.uuid']),
        sa.ForeignKeyConstraint(['vehicle_inventory_uuid'], ['vehicle_inventory.uuid']),
        sa.ForeignKeyConstraint(['material_uuid'], ['material.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )
    op.create_index(
        'ix_vehicle_inventory_event_inventory_uuid',
        'vehicle_inventory_event',
        ['vehicle_inventory_uuid'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_vehicle_inventory_event_inventory_uuid', table_name='vehicle_inventory_event')
    op.drop_table('vehicle_inventory_event')
    op.drop_index('uq_vehicle_inventory_vehicle_material_active', table_name='vehicle_inventory')
    op.drop_table('vehicle_inventory')
