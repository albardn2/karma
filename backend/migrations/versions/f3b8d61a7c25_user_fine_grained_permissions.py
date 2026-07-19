"""user fine-grained permissions JSON (modules + per-endpoint CRUD)

Revision ID: f3b8d61a7c25
Revises: e7a1c9d24b83
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = 'f3b8d61a7c25'
down_revision = 'e7a1c9d24b83'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL = legacy role-scope behavior; a JSON object = fine-grained ACL
    op.add_column('user', sa.Column('permissions', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('user', 'permissions')
