"""account subscription_type: flat vs per_user

Revision ID: c2e8f4a91b56
Revises: a9c4e17f5d02
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c2e8f4a91b56'
down_revision = 'a9c4e17f5d02'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('account', sa.Column('subscription_type', sa.String(length=20),
                                       nullable=False, server_default='flat'))


def downgrade() -> None:
    op.drop_column('account', 'subscription_type')
