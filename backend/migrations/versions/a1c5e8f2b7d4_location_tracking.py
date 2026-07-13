"""location tracking: user flags, location_ping timeseries, global config

Revision ID: a1c5e8f2b7d4
Revises: f4b8d2e6a1c9
Create Date: 2026-07-12

"""
import uuid

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision = 'a1c5e8f2b7d4'
down_revision = 'f4b8d2e6a1c9'
branch_labels = None
depends_on = None


def upgrade():
    # user: master switch + live publish cadence
    op.add_column('user', sa.Column('track_location', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('user', sa.Column('location_ping_seconds', sa.Integer(), nullable=False, server_default='15'))

    # stored location samples (trip points kept forever; history points windowed)
    op.create_table(
        'location_ping',
        sa.Column('uuid', sa.String(length=36), nullable=False),
        sa.Column('user_uuid', sa.String(length=36), nullable=False),
        sa.Column('trip_uuid', sa.String(length=36), nullable=True),
        # spatial_index=False: we query by user/trip + time, not by area, and
        # create_table would otherwise add a GiST index we don't need yet
        sa.Column('coordinates', Geometry('POINT', srid=4326, spatial_index=False), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), nullable=False),
        sa.Column('speed', sa.Float(), nullable=True),
        sa.Column('heading', sa.Float(), nullable=True),
        sa.Column('accuracy', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_uuid'], ['user.uuid']),
        sa.ForeignKeyConstraint(['trip_uuid'], ['trip.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )
    op.create_index('ix_location_ping_user_recorded', 'location_ping', ['user_uuid', 'recorded_at'])
    op.create_index('ix_location_ping_trip_recorded', 'location_ping', ['trip_uuid', 'recorded_at'])

    # single-row global config, seeded with defaults
    config = op.create_table(
        'location_tracking_config',
        sa.Column('uuid', sa.String(length=36), nullable=False),
        sa.Column('trip_cadence_seconds', sa.Integer(), nullable=False),
        sa.Column('history_cadence_seconds', sa.Integer(), nullable=False),
        sa.Column('history_retention_days', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('uuid'),
    )
    op.bulk_insert(config, [{
        'uuid': str(uuid.uuid4()),
        'trip_cadence_seconds': 30,
        'history_cadence_seconds': 120,
        'history_retention_days': 14,
    }])


def downgrade():
    op.drop_table('location_tracking_config')
    op.drop_index('ix_location_ping_trip_recorded', table_name='location_ping')
    op.drop_index('ix_location_ping_user_recorded', table_name='location_ping')
    op.drop_table('location_ping')
    op.drop_column('user', 'location_ping_seconds')
    op.drop_column('user', 'track_location')
