"""Add the in-app assistant's tables: conversations, usage, action log, per-company settings.

Revision ID: a7e4c2b9d1f3
Revises: c3d9e2a1f7b4
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "a7e4c2b9d1f3"
down_revision = "c3d9e2a1f7b4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "assistant_conversation",
        sa.Column("owner_key", sa.String(80), primary_key=True),
        sa.Column("user_uuid", sa.String(36), sa.ForeignKey("user.uuid"), nullable=False),
        sa.Column("account_uuid", sa.String(36), sa.ForeignKey("account.uuid"), nullable=True),
        sa.Column("conv_id", sa.String(64), nullable=False),
        sa.Column("model_id", sa.String(80), nullable=False),
        sa.Column("messages", JSONB(), nullable=False),
        sa.Column("transcript", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_assistant_conversation_user_uuid", "assistant_conversation", ["user_uuid"])
    op.create_index("ix_assistant_conversation_account_uuid", "assistant_conversation", ["account_uuid"])

    op.create_table(
        "assistant_usage",
        sa.Column("uuid", sa.String(36), primary_key=True),
        sa.Column("account_uuid", sa.String(36), sa.ForeignKey("account.uuid"), nullable=True),
        sa.Column("user_uuid", sa.String(36), sa.ForeignKey("user.uuid"), nullable=False),
        sa.Column("conv_id", sa.String(64), nullable=False),
        sa.Column("model_id", sa.String(80), nullable=False),
        sa.Column("outcome", sa.String(16), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_write_tokens", sa.Integer(), nullable=False),
        sa.Column("seconds", sa.Float(), nullable=False),
        sa.Column("model_calls", sa.Integer(), nullable=False),
        sa.Column("tool_calls", sa.Integer(), nullable=False),
        sa.Column("voice", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_assistant_usage_account_created", "assistant_usage", ["account_uuid", "created_at"])
    op.create_index("ix_assistant_usage_user_created", "assistant_usage", ["user_uuid", "created_at"])

    op.create_table(
        "assistant_action",
        sa.Column("uuid", sa.String(36), primary_key=True),
        sa.Column("account_uuid", sa.String(36), sa.ForeignKey("account.uuid"), nullable=True),
        sa.Column("user_uuid", sa.String(36), sa.ForeignKey("user.uuid"), nullable=False),
        sa.Column("conv_id", sa.String(64), nullable=False),
        sa.Column("tier", sa.String(16), nullable=False),
        sa.Column("method", sa.String(8), nullable=False),
        sa.Column("path", sa.String(255), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("summary", JSONB(), nullable=True),
        sa.Column("body", JSONB(), nullable=True),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_assistant_action_account_created", "assistant_action", ["account_uuid", "created_at"])
    op.create_index("ix_assistant_action_user_uuid", "assistant_action", ["user_uuid"])

    op.create_table(
        "assistant_account_setting",
        sa.Column("account_uuid", sa.String(36), sa.ForeignKey("account.uuid"), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=True),
        sa.Column("monthly_budget_usd", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("assistant_account_setting")
    op.drop_index("ix_assistant_action_user_uuid", table_name="assistant_action")
    op.drop_index("ix_assistant_action_account_created", table_name="assistant_action")
    op.drop_table("assistant_action")
    op.drop_index("ix_assistant_usage_user_created", table_name="assistant_usage")
    op.drop_index("ix_assistant_usage_account_created", table_name="assistant_usage")
    op.drop_table("assistant_usage")
    op.drop_index("ix_assistant_conversation_account_uuid", table_name="assistant_conversation")
    op.drop_index("ix_assistant_conversation_user_uuid", table_name="assistant_conversation")
    op.drop_table("assistant_conversation")
