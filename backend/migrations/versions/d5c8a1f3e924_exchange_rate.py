"""Record exchange rates over time.

Until now a USD↔SYP conversion rate was typed in by hand on every transaction,
with nothing kept between them: no history to look back at, and no default to
offer. This table holds one rate per currency pair per day.

SYP amounts here are OLD pounds, matching every other SYP figure in the
database — see app/domains/exchange_rate/sp_today.py for why that matters when
pulling from a source that now headlines the redenominated pound.

The unique index is partial on is_deleted so a repeated pull for the same day
updates rather than stacking duplicates — `find_one` uses one_or_none() and
would 500 on the second row.

Revision ID: d5c8a1f3e924
Revises: b4e9c1d78a26
"""
import sqlalchemy as sa
from alembic import op

revision = 'd5c8a1f3e924'
down_revision = 'b4e9c1d78a26'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'exchange_rate',
        sa.Column('uuid', sa.String(length=36), primary_key=True),
        sa.Column('account_uuid', sa.String(length=36), sa.ForeignKey('account.uuid'), nullable=False),
        sa.Column('created_by_uuid', sa.String(length=36), sa.ForeignKey('user.uuid'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('from_currency', sa.String(length=12), nullable=False),
        sa.Column('to_currency', sa.String(length=12), nullable=False),
        sa.Column('rate', sa.Float(), nullable=False),
        sa.Column('buy_rate', sa.Float(), nullable=True),
        sa.Column('sell_rate', sa.Float(), nullable=True),
        sa.Column('rate_date', sa.Date(), nullable=False),
        sa.Column('source', sa.String(length=60), nullable=False, server_default='manual'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index('ix_exchange_rate_account_uuid', 'exchange_rate', ['account_uuid'])
    op.create_index(
        'ix_exchange_rate_pair_date',
        'exchange_rate',
        ['account_uuid', 'from_currency', 'to_currency', 'rate_date'],
    )
    op.create_index(
        'uq_exchange_rate_pair_date',
        'exchange_rate',
        ['account_uuid', 'from_currency', 'to_currency', 'rate_date'],
        unique=True,
        postgresql_where=sa.text('is_deleted = false'),
    )


def downgrade():
    op.drop_index('uq_exchange_rate_pair_date', table_name='exchange_rate')
    op.drop_index('ix_exchange_rate_pair_date', table_name='exchange_rate')
    op.drop_index('ix_exchange_rate_account_uuid', table_name='exchange_rate')
    op.drop_table('exchange_rate')
