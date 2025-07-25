"""rename batch to process

Revision ID: 2a4ad163dafa
Revises: aa7c9ead434a
Create Date: 2025-04-28 20:37:42.501417

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2a4ad163dafa'
down_revision: Union[str, None] = 'aa7c9ead434a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.rename_table("batch", "process")
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.rename_table("process", "batch")
