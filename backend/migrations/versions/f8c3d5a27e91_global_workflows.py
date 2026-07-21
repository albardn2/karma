"""workflow/task definitions become platform-global (drop tenant scoping)

Every account shares the same workflow and task definitions, managed by
the platform owner — a single source of truth that can never go out of
sync between tenants. Executions stay tenant-scoped.

Revision ID: f8c3d5a27e91
Revises: e4a7c2d81f39
Create Date: 2026-07-20
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'f8c3d5a27e91'
down_revision = 'e4a7c2d81f39'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ('workflow', 'task'):
        op.drop_index(f'ix_{table}_account_uuid', table_name=table)
        op.drop_constraint(f'fk_{table}_account_uuid', table, type_='foreignkey')
        op.drop_column(table, 'account_uuid')


def downgrade() -> None:
    # not reversible without choosing an owner account for every row
    raise NotImplementedError("global workflows cannot be re-tenantized automatically")
