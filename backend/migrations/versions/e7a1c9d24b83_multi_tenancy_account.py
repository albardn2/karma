"""multi-tenancy: account table + account_uuid on every business table

Creates the `account` tenant table, backfills ALL existing rows to a single
default account (the current company, name via env MIGRATION_DEFAULT_COMPANY,
default "Karma Group"), then locks the column down (NOT NULL + FK + index).

Revision ID: e7a1c9d24b83
Revises: d4f8b2c7e9a1
Create Date: 2026-07-18
"""
import os
import uuid as uuid_lib

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e7a1c9d24b83'
down_revision = 'd4f8b2c7e9a1'
branch_labels = None
depends_on = None

# every tenant-scoped table (all business tables incl. user)
TABLES = [
    'location_tracking_config', 'user', 'customer', 'employee',
    'financial_account', 'material', 'process_template', 'service_area',
    'vehicle', 'vendor', 'warehouse', 'workflow', 'expense', 'inventory',
    'pricing', 'purchase_order', 'task', 'transaction', 'vehicle_inventory',
    'workflow_execution', 'process', 'purchase_order_item', 'task_execution',
    'trip', 'fixed_asset', 'location_ping', 'quality_control', 'trip_stop',
    'customer_order', 'customer_order_item', 'invoice', 'invoice_item',
    'vehicle_inventory_event', 'credit_note_item', 'debit_note_item',
    'inventory_event', 'payment', 'payout',
]


def upgrade() -> None:
    conn = op.get_bind()

    # 1. tenant table
    op.create_table(
        'account',
        sa.Column('uuid', sa.String(length=36), primary_key=True),
        sa.Column('company_name', sa.String(length=256), nullable=False),
        sa.Column('email', sa.String(length=120), nullable=True),
        sa.Column('phone_number', sa.String(length=256), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.false()),
    )

    # 2. default account for all pre-tenancy data
    default_uuid = str(uuid_lib.uuid4())
    company = os.environ.get('MIGRATION_DEFAULT_COMPANY', 'Karma Group')
    conn.execute(
        sa.text(
            "INSERT INTO account (uuid, company_name, created_at, is_deleted) "
            "VALUES (:uuid, :name, now(), false)"
        ),
        {'uuid': default_uuid, 'name': company},
    )

    # 3. add + backfill + lock down account_uuid on every table
    for table in TABLES:
        op.add_column(
            table, sa.Column('account_uuid', sa.String(length=36), nullable=True)
        )
        conn.execute(
            sa.text(f'UPDATE "{table}" SET account_uuid = :uuid'),
            {'uuid': default_uuid},
        )
        op.alter_column(table, 'account_uuid', nullable=False)
        op.create_foreign_key(
            f'fk_{table}_account_uuid', table, 'account',
            ['account_uuid'], ['uuid'],
        )
        op.create_index(f'ix_{table}_account_uuid', table, ['account_uuid'])


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_index(f'ix_{table}_account_uuid', table_name=table)
        op.drop_constraint(f'fk_{table}_account_uuid', table, type_='foreignkey')
        op.drop_column(table, 'account_uuid')
    op.drop_table('account')
