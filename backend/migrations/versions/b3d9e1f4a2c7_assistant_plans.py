"""Assistant plans: a per-company price and margin replace the raw monthly budget.

Existing budgets carry over as a price with a 0% margin, so every company keeps
exactly the model-cost cap it had. Plans are not invoiced until an owner turns
`invoice_plans` on in the console.

Revision ID: b3d9e1f4a2c7
Revises: a7e4c2b9d1f3
"""
import json

import sqlalchemy as sa
from alembic import op

revision = "b3d9e1f4a2c7"
down_revision = "a7e4c2b9d1f3"
branch_labels = None
depends_on = None

SETTING_KEY = "assistant"


def _rewrite_platform(convert):
    bind = op.get_bind()
    row = bind.execute(sa.text("SELECT value FROM platform_setting WHERE key = :k"),
                       {"k": SETTING_KEY}).first()
    if row is None or row[0] is None:
        return
    value = row[0] if isinstance(row[0], dict) else json.loads(row[0])
    bind.execute(sa.text("UPDATE platform_setting SET value = CAST(:v AS JSONB) WHERE key = :k"),
                 {"v": json.dumps(convert(dict(value))), "k": SETTING_KEY})


def _budget_to_plan(value: dict) -> dict:
    if "monthly_budget_usd" in value:
        value["plan_price_usd"] = value.pop("monthly_budget_usd")
        value["margin_pct"] = 0.0
    return value


def _plan_to_budget(value: dict) -> dict:
    price = value.pop("plan_price_usd", None)
    margin = value.pop("margin_pct", 0.0) or 0.0
    value.pop("invoice_plans", None)
    value["monthly_budget_usd"] = None if price is None else price * (1 - margin / 100)
    return value


def upgrade():
    op.add_column("assistant_account_setting", sa.Column("plan_price_usd", sa.Float(), nullable=True))
    op.add_column("assistant_account_setting", sa.Column("margin_pct", sa.Float(), nullable=True))
    op.execute("UPDATE assistant_account_setting SET plan_price_usd = monthly_budget_usd, margin_pct = 0 "
               "WHERE monthly_budget_usd IS NOT NULL")
    op.drop_column("assistant_account_setting", "monthly_budget_usd")
    _rewrite_platform(_budget_to_plan)


def downgrade():
    op.add_column("assistant_account_setting", sa.Column("monthly_budget_usd", sa.Float(), nullable=True))
    op.execute("UPDATE assistant_account_setting "
               "SET monthly_budget_usd = plan_price_usd * (1 - COALESCE(margin_pct, 0) / 100) "
               "WHERE plan_price_usd IS NOT NULL")
    op.drop_column("assistant_account_setting", "margin_pct")
    op.drop_column("assistant_account_setting", "plan_price_usd")
    _rewrite_platform(_plan_to_budget)
