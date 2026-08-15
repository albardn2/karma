"""Move the live ping cadence from per-user to the global tracking config.

The cadence (how often the app publishes a live position while tracking) was a
per-user column, editable on every user's page. It is now one global setting on
location_tracking_config, set once by a super-admin and applied to everyone; the
per-user `track_location` switch (whether a user is tracked at all) stays.

Adds location_tracking_config.live_ping_seconds (server default 15, the previous
per-user default) and drops user.location_ping_seconds. No backfill: a single
global cadence replaces the per-user values by design; a super-admin sets it in
the UI if 15s isn't wanted. The downgrade restores the per-user column at its
old default.

Revision ID: f4a2d7c9e1b6
Revises: e5b1c9a743d2
"""
import sqlalchemy as sa
from alembic import op

revision = 'f4a2d7c9e1b6'
down_revision = 'e5b1c9a743d2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'location_tracking_config',
        sa.Column('live_ping_seconds', sa.Integer(), nullable=False, server_default='15'),
    )
    op.drop_column('user', 'location_ping_seconds')


def downgrade():
    op.add_column(
        'user',
        sa.Column('location_ping_seconds', sa.Integer(), nullable=False, server_default='15'),
    )
    op.drop_column('location_tracking_config', 'live_ping_seconds')
