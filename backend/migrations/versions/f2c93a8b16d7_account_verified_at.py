"""Record WHEN an account was verified, because billing starts from it.

`is_verified` is a bare boolean, so until now the platform knew that a company had
been admitted but not when. That is enough to gate access and not enough to bill:
subscription periods are anchored on a date, and anchoring them on creation charges
a company for however long it sat waiting for approval — months it was refused every
endpoint and could not use the product at all.

So this is the billing anchor, not an audit field, and two consequences follow from
that.

It is stamped only the FIRST time an account becomes verified and never overwritten.
Un-verifying and re-verifying an account must not move the anchor, because the whole
monthly grid hangs off it — shifting it would re-open periods that were already
charged, or skip ones that were not.

And existing accounts are backfilled to their `created_at`. They predate verification
entirely: migration d5a17c93e8b4 grandfathered them all to true precisely because
they were never gated, so the honest answer to "when were they admitted" is "when
they were created". It also keeps their billing grid exactly where the previous
revision put it, rather than silently re-anchoring every live tenant onto the day
this migration happened to run.

Revision ID: f2c93a8b16d7
Revises: e7b41d20fa96
"""
import sqlalchemy as sa
from alembic import op

revision = 'f2c93a8b16d7'
down_revision = 'e7b41d20fa96'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('account', sa.Column('verified_at', sa.DateTime(), nullable=True))

    # Grandfathered accounts were admitted the day they were created — they were
    # never held behind verification, so that is when their billing should start.
    # Left NULL for anything unverified: nothing to record yet, and an unverified
    # account is not billed at all.
    op.execute(
        "UPDATE account SET verified_at = created_at WHERE is_verified IS TRUE"
    )


def downgrade():
    op.drop_column('account', 'verified_at')
