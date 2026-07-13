"""Soft delete for trips and workflow executions

Revision ID: c7e2a9d4f1b8
Revises: a1c5e8f2b7d4
Create Date: 2026-07-13

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c7e2a9d4f1b8'
down_revision = 'a1c5e8f2b7d4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'trip',
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'workflow_execution',
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column('workflow_execution', 'is_deleted')
    op.drop_column('trip', 'is_deleted')
