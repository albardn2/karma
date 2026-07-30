"""Require a new company to be verified before it can use anything.

A company that signs up now lands unverified: its users can sign in, but every
resource endpoint refuses them and both clients show a notice asking them to
contact an administrator. A platform owner flips the flag from the super-admin
console and the account works normally.

THE ORDER OF OPERATIONS BELOW IS THE WHOLE POINT. `is_verified` defaults to false
so that NEW signups are gated, and a naive `add_column(..., server_default=false,
nullable=False)` would therefore mark every EXISTING account unverified — locking
out the live company and every other tenant the instant this migration ran, with
the deploy already having taken the stack down. So the column arrives nullable,
every existing row is set true, and only then does the default that governs future
inserts get attached.

Read that as: existing accounts are grandfathered in, because they were admitted
before there was anything to admit them through. Verification is a gate on the
front door, not a re-audit of everyone already inside.

Revision ID: d5a17c93e8b4
Revises: c3e81f5a29b7
"""
import sqlalchemy as sa
from alembic import op

revision = 'd5a17c93e8b4'
down_revision = 'c3e81f5a29b7'
branch_labels = None
depends_on = None


def upgrade():
    # 1. nullable, and with NO default: every existing row gets NULL rather than
    #    false, so there is no instant at which a live tenant reads as unverified.
    op.add_column('account', sa.Column('is_verified', sa.Boolean(), nullable=True))

    # 2. grandfather everyone already here. Deliberately unconditional — including
    #    soft-deleted accounts, so that restoring one does not silently lock it out.
    op.execute("UPDATE account SET is_verified = true")

    # 3. now attach the default that governs new signups, and close the column.
    #    server_default (not just the Python-side default) so a row inserted by
    #    raw SQL or a fixture is gated too.
    op.alter_column(
        'account',
        'is_verified',
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.false(),
    )


def downgrade():
    op.drop_column('account', 'is_verified')
