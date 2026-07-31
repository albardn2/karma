"""Let a payment say which charge it settles.

The platform ledger was a running balance: charges negative, payments positive,
balance a plain SUM. That answers "does this company owe me money" and cannot answer
"is July paid", which is the question an owner actually asks when a tenant queries an
invoice.

So a payment may now point at the charge it pays, and a charge derives paid/unpaid
from the payments pointing at it. This is the same shape the customer side already
uses — `payment.invoice_uuid` with `Invoice.is_paid` summing its payments — rather
than a separate allocation table, so there is one pattern in the codebase for "this
money settles that debt" instead of two.

A self-referencing FK on one table rather than a join table because the relationship
is genuinely many-payments-to-one-charge: several partial payments may settle a
month, but a single payment settles a single month. A company paying three months at
once records three payments, exactly as a customer paying three invoices does.

`settles_charge_uuid` stays NULL for a payment on account — money received without
being applied to a period yet. That is today's behaviour for every existing payment,
so nothing is backfilled: an old payment genuinely was not allocated, and inventing
an allocation for it would be a guess written into the ledger.

Revision ID: a4e81c37b295
Revises: f2c93a8b16d7
"""
import sqlalchemy as sa
from alembic import op

revision = 'a4e81c37b295'
down_revision = 'f2c93a8b16d7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'account_ledger_entry',
        sa.Column('settles_charge_uuid', sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        'fk_ledger_settles_charge',
        'account_ledger_entry', 'account_ledger_entry',
        ['settles_charge_uuid'], ['uuid'],
    )

    # The lookup every charge makes to decide whether it is paid.
    op.create_index(
        'ix_ledger_settles_charge',
        'account_ledger_entry',
        ['settles_charge_uuid'],
    )

    # Only a payment settles anything. Without this a CHARGE could point at another
    # charge, and the paid-amount sum — which does not filter by entry_type on the
    # paying side — would read a negative charge as a payment and report a debt as
    # settled by another debt.
    op.create_check_constraint(
        'ck_ledger_only_payments_settle',
        'account_ledger_entry',
        "entry_type = 'payment' OR settles_charge_uuid IS NULL",
    )


def downgrade():
    op.drop_constraint('ck_ledger_only_payments_settle', 'account_ledger_entry',
                       type_='check')
    op.drop_index('ix_ledger_settles_charge', table_name='account_ledger_entry')
    op.drop_constraint('fk_ledger_settles_charge', 'account_ledger_entry',
                       type_='foreignkey')
    op.drop_column('account_ledger_entry', 'settles_charge_uuid')
