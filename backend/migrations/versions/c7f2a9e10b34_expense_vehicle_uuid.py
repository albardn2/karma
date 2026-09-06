"""Add expense.vehicle_uuid.

An expense may now carry the vehicle the cost belongs to. It is set directly on
a standalone vehicle expense, and derived from the trip's assigned vehicle when
the expense belongs to a distribution trip (the expense domain overrides it from
trip.vehicle_uuid so the two can never disagree). Nullable — ordinary overheads
have no vehicle.

Revision ID: c7f2a9e10b34
Revises: a4e91c7f6d20
"""
import sqlalchemy as sa
from alembic import op

revision = 'c7f2a9e10b34'
down_revision = 'a4e91c7f6d20'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'expense',
        sa.Column('vehicle_uuid', sa.String(length=36), nullable=True),
    )
    op.create_index(
        op.f('ix_expense_vehicle_uuid'), 'expense', ['vehicle_uuid'], unique=False
    )
    op.create_foreign_key(
        'fk_expense_vehicle_uuid', 'expense', 'vehicle', ['vehicle_uuid'], ['uuid']
    )


def downgrade():
    op.drop_constraint('fk_expense_vehicle_uuid', 'expense', type_='foreignkey')
    op.drop_index(op.f('ix_expense_vehicle_uuid'), table_name='expense')
    op.drop_column('expense', 'vehicle_uuid')
