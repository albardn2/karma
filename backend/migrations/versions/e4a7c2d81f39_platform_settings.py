"""platform_setting key/value table (default account permissions etc.)

Revision ID: e4a7c2d81f39
Revises: d7f2b9c65e18
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = 'e4a7c2d81f39'
down_revision = 'd7f2b9c65e18'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'platform_setting',
        sa.Column('key', sa.String(length=64), primary_key=True),
        sa.Column('value', JSONB, nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('platform_setting')
