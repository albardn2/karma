"""Give customers tags.

A tag is a short label, either a bare key ("vip") or a key:value pair
("region:malki"), and a customer can carry any number of them. They are stored
as a plain text[] rather than a join table or JSONB: the two shapes share one
column and one set of operators (`@>` for exact membership, prefix LIKE over
array_to_string for "any value of this key"), the workflow table already
established the ARRAY(String)+overlap pattern in this schema, and there is no
tag-level metadata that would earn rows of their own.

NOT NULL with a '{}' server default, and the same default stamped onto existing
rows by the ALTER itself — a customer without tags has an empty list, not a
NULL, so no client ever needs a null-guard before .map/.length.

Format (non-empty key/value, no commas or embedded colons, <= 64 chars) is
enforced at the DTO, not by a CHECK constraint: the rule is expected to evolve
(it already allows spaces for Arabic multi-word values) and a constraint would
turn every future loosening into another migration.

No index: tenants are small (hundreds of customers), the list route filters in
combination with other unindexed ilike columns anyway, and a GIN index on the
array can be added later without touching this migration.

Revision ID: d7f2a94c81e3
Revises: a4e81c37b295
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = 'd7f2a94c81e3'
down_revision = 'a4e81c37b295'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'customer',
        sa.Column(
            'tags',
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade():
    op.drop_column('customer', 'tags')
