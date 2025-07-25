"""add is del to payout

Revision ID: 8fa102f5093e
Revises: 1db2210197dc
Create Date: 2025-04-27 20:25:50.921445

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8fa102f5093e'
down_revision: Union[str, None] = '1db2210197dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('payout', sa.Column('is_deleted', sa.Boolean(), nullable=True))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('payout', 'is_deleted')
    # ### end Alembic commands ###
