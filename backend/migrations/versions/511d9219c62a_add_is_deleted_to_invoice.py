"""add is deleted to invoice

Revision ID: 511d9219c62a
Revises: 5e2b6dc79ec1
Create Date: 2025-04-27 11:30:37.509732

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '511d9219c62a'
down_revision: Union[str, None] = '5e2b6dc79ec1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('invoice', sa.Column('is_deleted', sa.Boolean(), nullable=True))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('invoice', 'is_deleted')
    # ### end Alembic commands ###
