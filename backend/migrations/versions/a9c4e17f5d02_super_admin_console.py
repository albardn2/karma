"""super-admin console: account blocking + subscription + ledger

Revision ID: a9c4e17f5d02
Revises: f3b8d61a7c25
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a9c4e17f5d02'
down_revision = 'f3b8d61a7c25'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('account', sa.Column('is_blocked', sa.Boolean(), nullable=False,
                                       server_default=sa.false()))
    op.add_column('account', sa.Column('subscription_rate', sa.Float(), nullable=True))
    op.add_column('account', sa.Column('subscription_currency', sa.String(length=10), nullable=True))

    op.create_table(
        'account_ledger_entry',
        sa.Column('uuid', sa.String(length=36), primary_key=True),
        sa.Column('account_uuid', sa.String(length=36),
                  sa.ForeignKey('account.uuid'), nullable=False, index=True),
        sa.Column('entry_type', sa.String(length=20), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(length=10), nullable=False),
        sa.Column('period', sa.String(length=7), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_uuid', sa.String(length=36),
                  sa.ForeignKey('user.uuid'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_table('account_ledger_entry')
    op.drop_column('account', 'subscription_currency')
    op.drop_column('account', 'subscription_rate')
    op.drop_column('account', 'is_blocked')
