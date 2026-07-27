"""Tie an expense to a trip.

Trip costs (fuel, tolls, a driver's meal) are expenses that belong to a
particular run, and until now there was nowhere to record which one. Nullable
because the overwhelming majority of expenses — rent, salaries, utilities —
have nothing to do with a trip, and every existing row is one of those.

Indexed because the natural query is "what did this trip cost", i.e. a lookup
by trip_uuid.

Revision ID: b4e9c1d78a26
Revises: c9f4a2e6b813
"""
import sqlalchemy as sa
from alembic import op

revision = 'b4e9c1d78a26'
down_revision = 'c9f4a2e6b813'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('expense', sa.Column('trip_uuid', sa.String(length=36), nullable=True))
    op.create_index('ix_expense_trip_uuid', 'expense', ['trip_uuid'])
    op.create_foreign_key(
        'fk_expense_trip_uuid', 'expense', 'trip', ['trip_uuid'], ['uuid']
    )


def downgrade():
    op.drop_constraint('fk_expense_trip_uuid', 'expense', type_='foreignkey')
    op.drop_index('ix_expense_trip_uuid', table_name='expense')
    op.drop_column('expense', 'trip_uuid')
