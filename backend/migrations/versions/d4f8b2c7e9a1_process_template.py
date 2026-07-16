"""Process templates

Revision ID: d4f8b2c7e9a1
Revises: c7e2a9d4f1b8
Create Date: 2026-07-16

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'd4f8b2c7e9a1'
down_revision = 'c7e2a9d4f1b8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'process_template',
        sa.Column('uuid', sa.String(length=36), nullable=False),
        sa.Column('created_by_uuid', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=120), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(['created_by_uuid'], ['user.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )


def downgrade():
    op.drop_table('process_template')
