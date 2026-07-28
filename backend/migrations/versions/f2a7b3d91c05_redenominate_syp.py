"""Restate every SYP amount in the new Syrian pound (100 old = 1 new).

Syria redenominated the pound, dropping two zeros. Everything in this database
was recorded in old pounds; from here on the business keeps its books in new
ones, so every stored SYP figure is divided by 100 and the exchange-rate source
switches units to match.

WHY THERE IS NO ROUNDING HERE
-----------------------------
Rounding each amount to 2dp would silently break the invariants that hold
between rows. An invoice's total is the sum of price_per_unit x quantity, and
quantities can be fractional (kilograms), so rounding prices independently can
move a total by a fraction of a pound — enough to flip a fully-paid invoice to
partially-paid against payments that were already recorded. Dividing by exactly
100 and leaving the precision alone scales every side of every comparison by the
same factor, so paid statuses, balances and reconciliations come out identical.
Display rounding stays where it belongs, in the UI.

WHAT IS AND IS NOT MONEY
------------------------
Several numeric columns sit next to a `currency` column without being amounts.
`inventory_event.quantity`, `purchase_order_item.quantity_received`,
`credit_note_item.inventory_change` and `inventory._cached_*_quantity` are
counts of goods and are deliberately left alone. Converting them would corrupt
stock levels.

`fixed_asset.price_per_unit` and `invoice_item.price_per_unit` carry no currency
of their own — they inherit it from the purchase-order item and the invoice
respectively, so both are converted through a join. A fixed asset with no
purchase-order link has no discoverable currency and is reported rather than
guessed at.

`account.subscription_rate` and `account_ledger_entry` rows that are not SYP
belong to platform billing and are untouched.

Reversible: downgrade multiplies the same columns by 100. Reversible in the
practical sense, not bit-exact — these are double-precision columns, so a
round-trip can leave float noise around the 11th decimal (a 300-row sum came
back as 36655.59999999999 instead of 36655.6). That is ~1e-13 relative and
invisible at any precision money is displayed or compared at.

Revision ID: f2a7b3d91c05
Revises: d5c8a1f3e924
"""
import sqlalchemy as sa
from alembic import op

revision = 'f2a7b3d91c05'
down_revision = 'd5c8a1f3e924'
branch_labels = None
depends_on = None

# (table, money columns) where the row itself says which currency it is in.
# Quantity columns on these same tables are intentionally absent.
PER_ROW_MONEY = [
    ('account_ledger_entry', ['amount']),
    ('credit_note_item', ['amount']),
    ('debit_note_item', ['amount']),
    ('expense', ['amount']),
    ('inventory', ['_cached_cost_per_unit']),
    ('inventory_event', ['cost_per_unit']),
    ('payment', ['amount']),
    ('payout', ['amount']),
    ('pricing', ['price_per_unit']),
    ('purchase_order_item', ['price_per_unit']),
    ('vehicle_inventory_event', ['cost_per_unit']),
]


def _apply(factor: str) -> None:
    """Scale every SYP amount by `factor` ('/ 100' or '* 100').

    Row counts are logged per statement: this rewrites production money, and the
    deploy output is the only audit trail of what it touched.
    """
    connection = op.get_bind()
    total = 0

    for table, columns in PER_ROW_MONEY:
        assignments = ', '.join(f"{c} = {c} {factor}" for c in columns)
        guard = ' OR '.join(f"{c} IS NOT NULL" for c in columns)
        result = connection.execute(
            sa.text(
                f"UPDATE {table} SET {assignments} "
                f"WHERE currency = 'SYP' AND ({guard})"
            )
        )
        print(f"[redenominate] {table}: {result.rowcount} rows")
        total += result.rowcount or 0

    # invoice_item takes its currency from the invoice it belongs to
    result = connection.execute(
        sa.text(
            "UPDATE invoice_item AS ii SET price_per_unit = ii.price_per_unit "
            f"{factor} FROM invoice AS i "
            "WHERE i.uuid = ii.invoice_uuid AND i.currency = 'SYP' "
            "AND ii.price_per_unit IS NOT NULL"
        )
    )
    print(f"[redenominate] invoice_item: {result.rowcount} rows")
    total += result.rowcount or 0

    # a fixed asset's currency comes from the purchase-order item it came from
    result = connection.execute(
        sa.text(
            "UPDATE fixed_asset AS fa SET price_per_unit = fa.price_per_unit "
            f"{factor} FROM purchase_order_item AS poi "
            "WHERE poi.uuid = fa.purchase_order_item_uuid AND poi.currency = 'SYP' "
            "AND fa.price_per_unit IS NOT NULL"
        )
    )
    print(f"[redenominate] fixed_asset: {result.rowcount} rows")
    total += result.rowcount or 0

    orphans = connection.execute(
        sa.text(
            "SELECT count(*) FROM fixed_asset "
            "WHERE purchase_order_item_uuid IS NULL AND price_per_unit IS NOT NULL"
        )
    ).scalar()
    if orphans:
        # not fatal: the asset may well have been bought in USD. Say so loudly
        # rather than assume a currency for it.
        print(
            f"[redenominate] WARNING: {orphans} fixed_asset row(s) have no "
            f"purchase_order_item link, so their currency is unknown and they "
            f"were left unchanged. Check them by hand."
        )

    # transactions name a currency per side
    result = connection.execute(
        sa.text(
            f"UPDATE transaction SET from_amount = from_amount {factor} "
            "WHERE from_currency = 'SYP' AND from_amount IS NOT NULL"
        )
    )
    print(f"[redenominate] transaction.from_amount: {result.rowcount} rows")
    total += result.rowcount or 0

    result = connection.execute(
        sa.text(
            f"UPDATE transaction SET to_amount = to_amount {factor} "
            "WHERE to_currency = 'SYP' AND to_amount IS NOT NULL"
        )
    )
    print(f"[redenominate] transaction.to_amount: {result.rowcount} rows")
    total += result.rowcount or 0

    # the rate is SYP per 1 USD, so it scales with SYP regardless of direction
    result = connection.execute(
        sa.text(
            "UPDATE transaction SET usd_to_syp_exchange_rate = "
            f"usd_to_syp_exchange_rate {factor} "
            "WHERE usd_to_syp_exchange_rate IS NOT NULL"
        )
    )
    print(f"[redenominate] transaction.usd_to_syp_exchange_rate: {result.rowcount} rows")
    total += result.rowcount or 0

    # recorded rates: quoted in units of to_currency, so only SYP-denominated ones move
    result = connection.execute(
        sa.text(
            "UPDATE exchange_rate SET "
            f"rate = rate {factor}, "
            f"buy_rate = buy_rate {factor}, "
            f"sell_rate = sell_rate {factor} "
            "WHERE to_currency = 'SYP'"
        )
    )
    print(f"[redenominate] exchange_rate: {result.rowcount} rows")
    total += result.rowcount or 0

    print(f"[redenominate] total rows rewritten: {total}")


def upgrade():
    _apply('/ 100')


def downgrade():
    _apply('* 100')
