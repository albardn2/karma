"""Add the routing_strategy table.

A saved priority-routing recipe (name + JSONB config of ordered priorities),
tenant-scoped, offered by name in the trip setup form's strategy dropdown
alongside the built-in 'manual'. See models.common.RoutingStrategy and
app/dto/routing_strategy.py for the config shape.

Revision ID: b5d8f3a71c26
Revises: e7b3f9c25a84
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = 'b5d8f3a71c26'
down_revision = 'e7b3f9c25a84'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'routing_strategy',
        sa.Column('uuid', sa.String(length=36), nullable=False),
        sa.Column('account_uuid', sa.String(length=36), nullable=False),
        sa.Column('created_by_uuid', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('config', JSONB(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(['account_uuid'], ['account.uuid']),
        sa.ForeignKeyConstraint(['created_by_uuid'], ['user.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )
    op.create_index(
        op.f('ix_routing_strategy_account_uuid'), 'routing_strategy',
        ['account_uuid'], unique=False,
    )
    # names are matched case-insensitively (find_by_name_ci), so uniqueness
    # must be enforced the same way AND in the database — the app-level
    # check-then-insert alone loses the race between two concurrent creates,
    # after which the route step resolves an arbitrary duplicate. Partial:
    # a soft-deleted strategy's name is reusable.
    op.execute(
        "CREATE UNIQUE INDEX uq_routing_strategy_account_lower_name "
        "ON routing_strategy (account_uuid, lower(name)) WHERE NOT is_deleted"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS uq_routing_strategy_account_lower_name")
    op.drop_index(op.f('ix_routing_strategy_account_uuid'), table_name='routing_strategy')
    op.drop_table('routing_strategy')
