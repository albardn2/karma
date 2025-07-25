"""add is fulfilled to po

Revision ID: ccd581b06886
Revises: 6f1608ecbf08
Create Date: 2025-05-11 15:08:33.959300

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ccd581b06886'
down_revision: Union[str, None] = '6f1608ecbf08'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('purchase_order', sa.Column('is_fulfilled', sa.Boolean(), nullable=True))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('purchase_order', 'is_fulfilled')
    # ### end Alembic commands ###
