from sqlalchemy import inspect

class UpdateMixin:
    __abstract__ = True
    def update(self, **kwargs):
        mapper = inspect(self).mapper
        cols = {c.key for c in mapper.columns if not c.primary_key}
        for k, v in kwargs.items():
            if k in cols:
                setattr(self, k, v)
        return self