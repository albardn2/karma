"""add coordinates to customer

Revision ID: 1969830413ab
Revises: acfbfa582f93
Create Date: 2025-06-06 17:32:47.971023

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

# revision identifiers, used by Alembic.
revision: str = '1969830413ab'
down_revision: Union[str, None] = 'acfbfa582f93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('customer', sa.Column('coordinates', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True))
    op.add_column('vendor', sa.Column('coordinates', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True))
    op.drop_column('warehouse', 'coordinates')
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('warehouse', sa.Column('coordinates', sa.VARCHAR(length=120), autoincrement=False, nullable=True))
    op.drop_column('vendor', 'coordinates')
    op.drop_column('customer', 'coordinates')
