"""Give a subscription charge an explicit coverage window.

`period` is a String(7) holding 'YYYY-MM'. That was enough while charges were
raised by hand from the super-admin console, but a daily job has to ask which
periods an account has and has not been billed for, and a month label cannot answer
that: periods are anchored on the account's CREATION DATE, so an account created on
the 18th is billed 18th-to-18th and its windows do not line up with calendar months
at all.

So charges gain a real half-open range, [period_start, period_end). `period` stays
and keeps holding the month each period opens in, because the console displays it
and nothing about this change should alter what an owner already reads.

THE BACKFILL IS NOT COSMETIC. The daily job decides whether to bill from
MAX(period_end) over an account's live charges, and SQL MAX ignores NULLs — so a
charge row left without a range is invisible to it. An account already charged for
next month would look completely unbilled and be charged AGAIN on the job's first
run, on top of a charge it already has. Existing rows are therefore given the range
their month label always implied: the first of that month, to the first of the
next.

Nullable rather than NOT NULL: `period` itself is nullable today (payments and
adjustments carry no period at all), and a payment row has no coverage window to
describe. Only charges are expected to have one.

Revision ID: e7b41d20fa96
Revises: d5a17c93e8b4
"""
import sqlalchemy as sa
from alembic import op

revision = 'e7b41d20fa96'
down_revision = 'd5a17c93e8b4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('account_ledger_entry', sa.Column('period_start', sa.Date(), nullable=True))
    op.add_column('account_ledger_entry', sa.Column('period_end', sa.Date(), nullable=True))

    # Existing charges get the window their 'YYYY-MM' label always meant: the
    # calendar month, because that is what an operator typing into a month picker
    # meant. Those windows will not sit on any account's anniversary grid, which is
    # exactly why the job treats a period as covered when a charge OVERLAPS it
    # rather than when one starts on the same day — otherwise these rows would be
    # invisible and their months billed a second time. Guarded
    # on the label actually parsing: `period` is free-form text, so anything that
    # is not exactly YYYY-MM is left alone rather than crashing the deploy — the
    # stack is down while this runs.
    op.execute(
        """
        UPDATE account_ledger_entry
           SET period_start = to_date(period || '-01', 'YYYY-MM-DD'),
               period_end   = (to_date(period || '-01', 'YYYY-MM-DD') + INTERVAL '1 month')::date
         WHERE entry_type = 'charge'
           AND period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        """
    )

    # Fail the deploy rather than let a row through that would be billed twice. A
    # charge whose `period` is not YYYY-MM cannot be backfilled, and MAX ignores
    # NULLs, so such a row would make its account read as never-billed exactly once
    # — one wrong money row, appearing silently, then self-healing. Better to stop
    # here and have someone fix the label by hand.
    leftover = op.get_bind().execute(sa.text(
        "SELECT count(*) FROM account_ledger_entry "
        "WHERE entry_type = 'charge' AND period_end IS NULL"
    )).scalar()
    if leftover:
        raise RuntimeError(
            f"{leftover} charge row(s) still have no period_end: their `period` is "
            f"not a YYYY-MM label. Fix them by hand — left as NULL, the daily job "
            f"bills those accounts a second time."
        )

    # The lookup the daily job makes for every account, every day.
    op.create_index(
        'ix_ledger_account_period_end',
        'account_ledger_entry',
        ['account_uuid', 'period_end'],
    )

    # Make the dangerous state unrepresentable instead of trusting two call sites
    # to remember: a charge always has a window, and nothing else ever does. The
    # second half matters as much as the first — a payment carrying a sentinel
    # window would be read as coverage by any MAX(period_end) that forgot to filter
    # on entry_type.
    op.create_check_constraint(
        'ck_ledger_charge_period',
        'account_ledger_entry',
        "(entry_type = 'charge' AND period_start IS NOT NULL "
        " AND period_end IS NOT NULL AND period_end > period_start) "
        "OR (entry_type <> 'charge' AND period_start IS NULL AND period_end IS NULL)",
    )

    # Database-level backstop against a double charge. The job reads
    # MAX(period_end) then inserts, which is not safe under READ COMMITTED if two
    # runners overlap — a restart near the firing time, or someone running it by
    # hand alongside the service. Keyed on period_start (a date) rather than
    # `period`, because two rolling windows can legitimately open in one month.
    op.create_index(
        'uq_ledger_charge_period_start',
        'account_ledger_entry',
        ['account_uuid', 'period_start'],
        unique=True,
        postgresql_where=sa.text("entry_type = 'charge' AND is_deleted IS NOT TRUE"),
    )


def downgrade():
    op.drop_index('uq_ledger_charge_period_start', table_name='account_ledger_entry')
    op.drop_constraint('ck_ledger_charge_period', 'account_ledger_entry', type_='check')
    op.drop_index('ix_ledger_account_period_end', table_name='account_ledger_entry')
    op.drop_column('account_ledger_entry', 'period_end')
    op.drop_column('account_ledger_entry', 'period_start')
