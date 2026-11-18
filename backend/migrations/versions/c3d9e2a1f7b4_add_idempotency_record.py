"""Add idempotency_record, so a retried client write replays instead of repeating.

Revision ID: c3d9e2a1f7b4
Revises: b8e1c4d7f2a9
"""
import sqlalchemy as sa
from alembic import op

revision = "c3d9e2a1f7b4"
down_revision = "b8e1c4d7f2a9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "idempotency_record",
        sa.Column("uuid", sa.String(36), primary_key=True),
        sa.Column("account_uuid", sa.String(36), sa.ForeignKey("account.uuid"), nullable=False),
        sa.Column("user_uuid", sa.String(36), sa.ForeignKey("user.uuid"), nullable=True),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("endpoint", sa.String(255), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("response_body", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("account_uuid", "key", name="uq_idempotency_record_account_key"),
    )
    op.create_index("ix_idempotency_record_account_uuid", "idempotency_record", ["account_uuid"])
    op.create_index("ix_idempotency_record_user_uuid", "idempotency_record", ["user_uuid"])


def downgrade():
    op.drop_index("ix_idempotency_record_user_uuid", table_name="idempotency_record")
    op.drop_index("ix_idempotency_record_account_uuid", table_name="idempotency_record")
    op.drop_table("idempotency_record")
