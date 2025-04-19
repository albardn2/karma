# models/base.py
from sqlalchemy.orm import declarative_base

from .mixins import UpdateMixin

class BaseModel(UpdateMixin):
    __abstract__ = True

Base = declarative_base(cls=BaseModel)

