"""account-level feature permissions (tenant-wide cap)

Revision ID: d7f2b9c65e18
Revises: c2e8f4a91b56
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = 'd7f2b9c65e18'
down_revision = 'c2e8f4a91b56'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL = all features enabled
    op.add_column('account', sa.Column('permissions', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('account', 'permissions')
