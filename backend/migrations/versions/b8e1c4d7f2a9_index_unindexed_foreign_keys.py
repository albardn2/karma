"""Index every foreign key that had no index on its leading column.

Postgres does NOT create an index for a foreign key — only for the PRIMARY
KEY and UNIQUE constraints. 103 of this schema's 154 foreign keys had none,
across 39 tables, so every join across them and every referential check on
DELETE fell back to a sequential scan of the child table.

WHAT THIS IS AND IS NOT WORTH. Honest framing, because the cost is real and
the benefit today is modest:

  * Measured on this schema, inserting 8,320 rows into a table went from
    10.5ms with no indexes to 46.0ms with its eight FK indexes — +340%.
    That sounds alarming and is not: it is ~4 MICROseconds of extra work
    per row, and the one genuinely write-hot table in this system
    (location_ping, fed by the drivers' MQTT stream) was already fully
    indexed and is untouched here.
  * At the current data volume the read win is also modest — the worst
    unindexed scan measured 8.3ms at 100x today's row counts. The reason to
    do it anyway is that it is the cheap half of a problem that only grows,
    and that a missing FK index is invisible until the table is big enough
    for it to hurt.

NOTHING HERE SPEEDS ANYTHING UP TODAY, and the obvious candidate does not
either. customer_repository.fetch_priority_routing_pool anti-joins the
WHOLE trip_stop table on every routing run, which looks like the textbook
case for ix_trip_stop_customer_uuid — but EXPLAIN ANALYZE with the index
in place still chooses a Hash Anti Join over a sequential scan, because at
266 rows a seq scan genuinely is cheaper and the planner is right. These
indexes are insurance against growth, not a fix for current latency. The
API's current slowness is queueing, not query cost (see PR #159).

Two costs measured rather than assumed, because "add indexes" is usually
waved through:
  * Query PLANNING time, with 103 more paths to consider: 0.16ms -> 0.21ms
    warm, on a three-table join. Negligible.
  * Disk: 1.9 MB total for all 103.

39 of the 103 are created_by_uuid, which nothing filters on today. They are
included anyway rather than hand-picked: the set is derived mechanically
from the catalog, so there is no judgement call to get wrong, and they make
a user delete cheap instead of a 39-table scan.

CONCURRENTLY, so no table is ever locked against reads or writes while an
index builds. Two consequences, both deliberate:

  * It cannot run inside a transaction, hence the autocommit_block. This
    migration is therefore NOT atomic — if it fails halfway, the indexes
    created so far remain.
  * That is why every statement is IF NOT EXISTS: re-running after a
    partial failure is safe and simply finishes the job.

A failed CONCURRENTLY build leaves an INVALID index behind, which is inert
but wastes space. Find any with:

    SELECT i.relname FROM pg_class i JOIN pg_index x ON x.indexrelid = i.oid
    WHERE NOT x.indisvalid;

and DROP INDEX CONCURRENTLY them before re-running.

Revision ID: b8e1c4d7f2a9
Revises: f4a7c2e9b183
"""
from alembic import op

revision = "b8e1c4d7f2a9"
down_revision = "f4a7c2e9b183"
branch_labels = None
depends_on = None


# (table, column) for every FK lacking an index on its leading column,
# generated from pg_constraint/pg_index rather than written by hand.
FK_COLUMNS = [
    ("account_ledger_entry", "created_by_uuid"),
    ("credit_note_item", "created_by_uuid"),
    ("credit_note_item", "customer_order_item_uuid"),
    ("credit_note_item", "customer_uuid"),
    ("credit_note_item", "invoice_item_uuid"),
    ("credit_note_item", "purchase_order_item_uuid"),
    ("credit_note_item", "vendor_uuid"),
    ("customer", "created_by_uuid"),
    ("customer_order", "created_by_uuid"),
    ("customer_order", "customer_uuid"),
    ("customer_order", "trip_stop_uuid"),
    ("customer_order_item", "created_by_uuid"),
    ("customer_order_item", "customer_order_uuid"),
    ("customer_order_item", "material_uuid"),
    ("customer_tag_event", "created_by_uuid"),
    ("debit_note_item", "created_by_uuid"),
    ("debit_note_item", "customer_order_item_uuid"),
    ("debit_note_item", "customer_uuid"),
    ("debit_note_item", "invoice_item_uuid"),
    ("debit_note_item", "purchase_order_item_uuid"),
    ("debit_note_item", "vendor_uuid"),
    ("employee", "created_by_uuid"),
    ("exchange_rate", "created_by_uuid"),
    ("expense", "created_by_uuid"),
    ("expense", "vendor_uuid"),
    ("financial_account", "created_by_uuid"),
    ("fixed_asset", "created_by_uuid"),
    ("fixed_asset", "material_uuid"),
    ("fixed_asset", "purchase_order_item_uuid"),
    ("inventory", "created_by_uuid"),
    ("inventory", "material_uuid"),
    ("inventory", "warehouse_uuid"),
    ("inventory_event", "created_by_uuid"),
    ("inventory_event", "credit_note_item_uuid"),
    ("inventory_event", "customer_order_item_uuid"),
    ("inventory_event", "debit_note_item_uuid"),
    ("inventory_event", "inventory_uuid"),
    ("inventory_event", "material_uuid"),
    ("inventory_event", "process_uuid"),
    ("inventory_event", "purchase_order_item_uuid"),
    ("invoice", "created_by_uuid"),
    ("invoice", "customer_order_uuid"),
    ("invoice", "customer_uuid"),
    ("invoice_item", "created_by_uuid"),
    ("invoice_item", "customer_order_item_uuid"),
    ("invoice_item", "invoice_uuid"),
    ("material", "created_by_uuid"),
    ("payment", "created_by_uuid"),
    ("payment", "debit_note_item_uuid"),
    ("payment", "financial_account_uuid"),
    ("payment", "invoice_uuid"),
    ("payout", "created_by_uuid"),
    ("payout", "credit_note_item_uuid"),
    ("payout", "employee_uuid"),
    ("payout", "expense_uuid"),
    ("payout", "financial_account_uuid"),
    ("payout", "purchase_order_uuid"),
    ("pricing", "created_by_uuid"),
    ("pricing", "material_uuid"),
    ("process", "created_by_uuid"),
    ("process", "workflow_execution_uuid"),
    ("process_template", "created_by_uuid"),
    ("purchase_order", "created_by_uuid"),
    ("purchase_order", "vendor_uuid"),
    ("purchase_order_item", "created_by_uuid"),
    ("purchase_order_item", "material_uuid"),
    ("purchase_order_item", "purchase_order_uuid"),
    ("quality_control", "created_by_uuid"),
    ("quality_control", "process_uuid"),
    ("routing_strategy", "created_by_uuid"),
    ("service_area", "created_by_uuid"),
    ("task", "created_by_uuid"),
    ("task", "parent_task_uuid"),
    ("task", "workflow_uuid"),
    ("task_execution", "completed_by_uuid"),
    ("task_execution", "created_by_uuid"),
    ("task_execution", "parent_task_execution_uuid"),
    ("task_execution", "task_uuid"),
    ("task_execution", "workflow_execution_uuid"),
    ("transaction", "created_by_uuid"),
    ("transaction", "from_account_uuid"),
    ("transaction", "to_account_uuid"),
    ("trip", "audited_by_uuid"),
    ("trip", "created_by_uuid"),
    ("trip", "end_warehouse_uuid"),
    ("trip", "start_warehouse_uuid"),
    ("trip", "vehicle_uuid"),
    ("trip", "workflow_execution_uuid"),
    ("trip_stop", "created_by_uuid"),
    ("trip_stop", "customer_uuid"),
    ("trip_stop", "task_execution_uuid"),
    ("trip_stop", "trip_uuid"),
    ("vehicle", "created_by_uuid"),
    ("vehicle_inventory", "created_by_uuid"),
    ("vehicle_inventory", "material_uuid"),
    ("vehicle_inventory_event", "created_by_uuid"),
    ("vehicle_inventory_event", "customer_order_item_uuid"),
    ("vehicle_inventory_event", "material_uuid"),
    ("vendor", "created_by_uuid"),
    ("warehouse", "created_by_uuid"),
    ("workflow", "created_by_uuid"),
    ("workflow_execution", "created_by_uuid"),
    ("workflow_execution", "workflow_uuid"),
]


def _index_name(table: str, column: str) -> str:
    # postgres truncates identifiers at 63 bytes; every name here was checked
    # to fit, and the assert keeps a future addition honest
    name = f"ix_{table}_{column}"
    assert len(name) <= 63, name
    return name


def upgrade():
    with op.get_context().autocommit_block():
        for table, column in FK_COLUMNS:
            op.execute(
                f'CREATE INDEX CONCURRENTLY IF NOT EXISTS {_index_name(table, column)} '
                f'ON "{table}" ("{column}")'
            )


def downgrade():
    with op.get_context().autocommit_block():
        for table, column in FK_COLUMNS:
            op.execute(f'DROP INDEX CONCURRENTLY IF EXISTS {_index_name(table, column)}')
