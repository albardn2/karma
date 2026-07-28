"""Let a trip be marked as audited.

Someone reviews a finished trip — its collections, its expenses, the stock that
came back — and signs it off. Recorded as WHO and WHEN rather than a boolean,
because that is what an audit is: a bare flag cannot answer "who signed this
off", and after the fact that is usually the question. `Trip.is_audited` derives
from `audited_at`, so the two can never disagree.

Both columns are nullable and no existing row is touched: every trip starts
un-audited, which is the truth for anything that predates this.

The index carries the account scope because the only query is "this tenant's
audited (or un-audited) trips" — the list filter.

Revision ID: a1c7e4b98d52
Revises: f2a7b3d91c05
"""
import sqlalchemy as sa
from alembic import op

revision = 'a1c7e4b98d52'
down_revision = 'f2a7b3d91c05'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('trip', sa.Column('audited_at', sa.DateTime(), nullable=True))
    op.add_column('trip', sa.Column('audited_by_uuid', sa.String(length=36), nullable=True))
    op.create_foreign_key(
        'fk_trip_audited_by_uuid', 'trip', 'user', ['audited_by_uuid'], ['uuid']
    )
    op.create_index('ix_trip_account_audited_at', 'trip', ['account_uuid', 'audited_at'])


def downgrade():
    op.drop_index('ix_trip_account_audited_at', table_name='trip')
    op.drop_constraint('fk_trip_audited_by_uuid', 'trip', type_='foreignkey')
    op.drop_column('trip', 'audited_by_uuid')
    op.drop_column('trip', 'audited_at')
