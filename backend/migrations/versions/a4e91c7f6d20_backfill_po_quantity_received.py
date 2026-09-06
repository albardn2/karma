"""Backfill quantity_received on already-fulfilled purchase-order items.

quantity_received was never written by the fulfilment path — it set is_fulfilled
and fulfilled_at and nothing else — so every fulfilled line ever recorded reads
0.0 in the Received column while sitting behind a green Fulfilled badge. The
fulfilment code now records it (quantity_received = quantity, since fulfilment
here is all-or-nothing — there is no partial receipt), and this repairs the rows
that predate that.

The rule matches the live code exactly: a fulfilled line received what was
ordered, and an un-fulfilled line received nothing. There is no partial receipt
in this model, so a fulfilled line's received must equal its quantity and an
un-fulfilled line's must be 0; both directions are repaired here. Deleted rows
are left alone, and only rows whose recorded receipt is already wrong are
touched, so re-running is a no-op.

Revision ID: a4e91c7f6d20
Revises: b5d8f3a71c26
"""
from alembic import op

revision = 'a4e91c7f6d20'
down_revision = 'b5d8f3a71c26'
branch_labels = None
depends_on = None


_BACKFILL_FULFILLED = """
UPDATE purchase_order_item
SET quantity_received = quantity
WHERE is_fulfilled = TRUE
  AND is_deleted = FALSE
  AND quantity_received IS DISTINCT FROM quantity
"""

# an un-fulfilled line has received nothing; a non-zero receipt on one is a
# stale value from before fulfilment wrote the column
_BACKFILL_UNFULFILLED = """
UPDATE purchase_order_item
SET quantity_received = 0
WHERE is_fulfilled = FALSE
  AND is_deleted = FALSE
  AND quantity_received <> 0
"""


def upgrade():
    op.execute(_BACKFILL_FULFILLED)
    op.execute(_BACKFILL_UNFULFILLED)


def downgrade():
    # Deliberately a no-op. The prior value was uniformly 0.0 for every fulfilled
    # line (the column was never written), so zeroing them back would restore a
    # known-wrong state, not a meaningful one — and it is indistinguishable from
    # lines the fixed code has since fulfilled correctly.
    pass
