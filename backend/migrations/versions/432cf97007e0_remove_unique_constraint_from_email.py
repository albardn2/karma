"""remove unique constraint from email

Revision ID: 432cf97007e0
Revises: f098357dfd8f
Create Date: 2025-06-17 14:47:51.857736

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '432cf97007e0'
down_revision: Union[str, None] = 'f098357dfd8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_constraint(op.f('customer_email_address_key'), 'customer', type_='unique')
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_unique_constraint(op.f('customer_email_address_key'), 'customer', ['email_address'], postgresql_nulls_not_distinct=False)

