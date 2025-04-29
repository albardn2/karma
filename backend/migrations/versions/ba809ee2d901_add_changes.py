"""add changes

Revision ID: ba809ee2d901
Revises: 2a4ad163dafa
Create Date: 2025-04-28 20:41:20.009463

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ba809ee2d901'
down_revision: Union[str, None] = '2a4ad163dafa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # add your new FK column
    op.add_column('inventory_event',
                  sa.Column('process_uuid', sa.String(length=36), nullable=True),
                  )

    # drop the old batch fk and column
    op.drop_constraint('inventory_event_batch_uuid_fkey',
                       'inventory_event', type_='foreignkey')
    op.drop_column('inventory_event', 'batch_uuid')

    # create the new fk
    op.create_foreign_key(
        None,
        'inventory_event', 'process',
        ['process_uuid'], ['uuid']
    )

    # alter `process.data` from TEXT → JSON, telling PG how to convert it
    op.alter_column(
        'process',
        'data',
        existing_type=sa.TEXT(),
        type_=sa.JSON(),
        existing_nullable=True,
        postgresql_using='data::json'
    )

    # drop the old batch_id column
    op.drop_column('process', 'batch_id')


def downgrade() -> None:
    # re-add the batch_id column
    op.add_column('process',
                  sa.Column('batch_id', sa.VARCHAR(length=120), nullable=False)
                  )

    # convert JSON back to TEXT
    op.alter_column(
        'process',
        'data',
        existing_type=sa.JSON(),
        type_=sa.TEXT(),
        existing_nullable=True,
        postgresql_using='data::text'
    )

    # re-add the old batch fk column & constraint
    op.add_column('inventory_event',
                  sa.Column('batch_uuid', sa.VARCHAR(length=36), nullable=True)
                  )
    op.drop_constraint(None, 'inventory_event', type_='foreignkey')
    op.create_foreign_key(
        'inventory_event_batch_uuid_fkey',
        'inventory_event', 'process',
        ['batch_uuid'], ['uuid']
    )

    # drop the new process_uuid FK
    op.drop_column('inventory_event', 'process_uuid')
