"""Add the live-map freshness window to the location tracking config.

location_tracking_config.live_fresh_minutes is how recent a driver's last
position must be for the live maps to show it as live (green) rather than
stale (gray). Server default 5.

Revision ID: d4e7a1c9b2f3
Revises: c3d9e2a1f7b4
"""
import sqlalchemy as sa
from alembic import op

revision = 'd4e7a1c9b2f3'
down_revision = 'c3d9e2a1f7b4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'location_tracking_config',
        sa.Column('live_fresh_minutes', sa.Integer(), nullable=False, server_default='5'),
    )


def downgrade():
    op.drop_column('location_tracking_config', 'live_fresh_minutes')
