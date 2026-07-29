"""Deactivation switch for users

Reversible "may not sign in", separate from the existing soft delete.
Existing users are all active: the column is NOT NULL with a true
server_default, so the backfill is implicit and no data pass is needed.

Revision ID: b4d9c2f7a651
Revises: a1c7e4b98d52
Create Date: 2026-07-29

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b4d9c2f7a651'
down_revision = 'a1c7e4b98d52'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'user',
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade():
    op.drop_column('user', 'is_active')
