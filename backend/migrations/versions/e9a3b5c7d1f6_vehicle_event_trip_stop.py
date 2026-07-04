"""attribute vehicle inventory sale events to a trip stop (for trip inventory reconciliation)

Revision ID: e9a3b5c7d1f6
Revises: d8f2c1a4b6e5
Create Date: 2026-07-04

"""
from alembic import op
import sqlalchemy as sa


revision = 'e9a3b5c7d1f6'
down_revision = 'd8f2c1a4b6e5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('vehicle_inventory_event', sa.Column('trip_stop_uuid', sa.String(length=36), nullable=True))
    op.create_foreign_key(
        'fk_vehicle_inventory_event_trip_stop',
        'vehicle_inventory_event', 'trip_stop',
        ['trip_stop_uuid'], ['uuid'],
    )
    op.create_index('ix_vehicle_inventory_event_trip_stop_uuid', 'vehicle_inventory_event', ['trip_stop_uuid'])


def downgrade():
    op.drop_index('ix_vehicle_inventory_event_trip_stop_uuid', table_name='vehicle_inventory_event')
    op.drop_constraint('fk_vehicle_inventory_event_trip_stop', 'vehicle_inventory_event', type_='foreignkey')
    op.drop_column('vehicle_inventory_event', 'trip_stop_uuid')
