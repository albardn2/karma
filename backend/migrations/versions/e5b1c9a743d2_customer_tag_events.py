"""Log customer tag changes.

An append-only table recording, per key that changed in one save, its old and
new value on a customer — the substrate for "how many customers moved from
interest:interested to interest:not_interested" analytics. Forward-only: there
is no prior history to backfill, so counts start accumulating from deploy.

Single-valued per key (enforced at the DTO), so old_value -> new_value fully
describes a key's change; NULL means the key was absent, '' means a bare key was
present. Indexed on the columns the two read paths filter/group by: (account,
key, created_at) for the transitions rollup, (customer, created_at) for a
per-customer timeline.

Revision ID: e5b1c9a743d2
Revises: d7f2a94c81e3
"""
import sqlalchemy as sa
from alembic import op

revision = 'e5b1c9a743d2'
down_revision = 'd7f2a94c81e3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'customer_tag_event',
        sa.Column('uuid', sa.String(length=36), primary_key=True),
        sa.Column('account_uuid', sa.String(length=36), sa.ForeignKey('account.uuid'), nullable=False),
        sa.Column('customer_uuid', sa.String(length=36), sa.ForeignKey('customer.uuid'), nullable=False),
        sa.Column('created_by_uuid', sa.String(length=36), sa.ForeignKey('user.uuid'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('change_group_uuid', sa.String(length=36), nullable=False),
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('old_value', sa.String(length=64), nullable=True),
        sa.Column('new_value', sa.String(length=64), nullable=True),
    )
    # the transitions rollup filters account + key + created_at window
    op.create_index(
        'ix_customer_tag_event_account_key_created',
        'customer_tag_event',
        ['account_uuid', 'key', 'created_at'],
    )
    # a per-customer timeline reads by customer, newest first
    op.create_index(
        'ix_customer_tag_event_customer_created',
        'customer_tag_event',
        ['customer_uuid', 'created_at'],
    )


def downgrade():
    op.drop_index('ix_customer_tag_event_customer_created', table_name='customer_tag_event')
    op.drop_index('ix_customer_tag_event_account_key_created', table_name='customer_tag_event')
    op.drop_table('customer_tag_event')
