"""One non-external financial account per currency, per tenant.

That single internal account is the DEFAULT for its currency: payments and
payouts already resolve it by currency when the caller does not name an
account (payment/domain.py, payout/domain.py). Those lookups use one_or_none(),
so a tenant holding two internal accounts in the same currency does not get an
arbitrary pick — it gets MultipleResultsFound, i.e. a 500 on every payment.
This index makes the invariant those lookups already assume enforceable.

is_external is nullable and was added without a backfill (d643260737c4), so
legacy rows can hold NULL. `is_external = false` does NOT match NULL, which
would leave those rows outside the index AND invisible to the default lookup,
so they are backfilled to false and the column is pinned NOT NULL first.

External accounts are deliberately excluded from the index: there can be any
number of them per currency.

Revision ID: c9f4a2e6b813
Revises: f8c3d5a27e91
"""
import sqlalchemy as sa
from alembic import op

revision = 'c9f4a2e6b813'
down_revision = 'f8c3d5a27e91'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1. close the three-state hole before anything relies on the flag
    conn.execute(sa.text(
        "UPDATE financial_account SET is_external = false WHERE is_external IS NULL"
    ))
    conn.execute(sa.text(
        "UPDATE financial_account SET is_deleted = false WHERE is_deleted IS NULL"
    ))
    op.alter_column(
        'financial_account', 'is_external',
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.text('false'),
    )

    # 2. fail loudly and early if any tenant would violate the new invariant,
    #    rather than letting Postgres raise a bare duplicate-key error
    dupes = conn.execute(sa.text(
        """
        SELECT account_uuid, currency, count(*) AS n
        FROM financial_account
        WHERE is_deleted = false AND is_external = false
        GROUP BY account_uuid, currency
        HAVING count(*) > 1
        """
    )).fetchall()
    if dupes:
        detail = ", ".join(f"{r[0]}/{r[1]}={r[2]}" for r in dupes)
        raise RuntimeError(
            "Cannot enforce one internal financial account per currency; "
            f"these tenant/currency pairs hold more than one: {detail}. "
            "Merge them (repoint payments/payouts/transactions to the survivor "
            "and soft-delete the rest) before running this migration."
        )

    # 3. the guarantee. Partial so external accounts stay unlimited, and so a
    #    soft-deleted account never blocks recreating one.
    op.create_index(
        'uq_financial_account_internal_currency',
        'financial_account',
        ['account_uuid', 'currency'],
        unique=True,
        postgresql_where=sa.text('is_external = false AND is_deleted = false'),
    )


def downgrade():
    op.drop_index('uq_financial_account_internal_currency', table_name='financial_account')
    op.alter_column(
        'financial_account', 'is_external',
        existing_type=sa.Boolean(),
        nullable=True,
        server_default=None,
    )
