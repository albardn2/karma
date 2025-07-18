"""make invoice uuid nullable in payments

Revision ID: 2b2bd7c0ae3f
Revises: 63c28be9765c
Create Date: 2025-05-14 15:08:19.708726

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b2bd7c0ae3f'
down_revision: Union[str, None] = '63c28be9765c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.alter_column('payment', 'invoice_uuid',
               existing_type=sa.VARCHAR(length=36),
               nullable=True)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.alter_column('payment', 'invoice_uuid',
               existing_type=sa.VARCHAR(length=36),
               nullable=False)
    # ### end Alembic commands ###
