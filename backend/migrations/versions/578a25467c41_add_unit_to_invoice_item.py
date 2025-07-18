"""add unit to invoice item

Revision ID: 578a25467c41
Revises: 511d9219c62a
Create Date: 2025-04-27 13:30:58.992444

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '578a25467c41'
down_revision: Union[str, None] = '511d9219c62a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('invoice_item', sa.Column('unit', sa.String(length=120), nullable=False))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('invoice_item', 'unit')
    # ### end Alembic commands ###
