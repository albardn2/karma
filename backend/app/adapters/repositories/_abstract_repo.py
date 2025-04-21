from __future__ import annotations

from typing import Any, Generic, Iterable, Optional, TypeVar, List
import math
import pandas as pd
from sqlalchemy import UniqueConstraint, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, scoped_session, Query
from models.base import Base

BASE = TypeVar("BASE", bound=Base)


class NotAllowedQueryNonIndexedFields(Exception):
    """Raise Exception when query without an index is not allowed."""
    pass


class Pagination(Generic[BASE]):
    """
    Simple pagination result.
    """
    def __init__(self, items: List[BASE], total: int, page: int, per_page: int) -> None:
        self.items = items
        self.total = total
        self.page = page
        self.per_page = per_page
        self.pages = math.ceil(total / per_page) if per_page else 0


class AbstractRepository(Generic[BASE]):
    """Abstract repository that implements common methods, including pagination."""

    def __init__(
            self,
            session: scoped_session[Session],
            query_only_by_indices: bool = False
    ) -> None:
        self._session: Session = session
        self._type = Base  # should be overridden in subclass
        self._query_only_by_indices = query_only_by_indices
        self._indices: Optional[list[list[str]]] = None

    def _is_allowed(self, column_names: Iterable[str]) -> bool:
        if not self._query_only_by_indices:
            return True
        if self._indices is None:
            self._indices = self._get_indices()
        for idx in self._indices:
            if all(col in column_names for col in idx):
                return True
        raise NotAllowedQueryNonIndexedFields(
            f"Fields {column_names} don't belong to any index on {self._type}"
        )

    def _get_indices(self) -> list[list[str]]:
        indices: list[list[str]] = []
        for idx in self._type.__table__.indexes:
            indices.append([col.name for col in idx.columns])
        indices.append([col.name for col in self._type.__table__.primary_key.columns])
        for constr in self._type.__table__.constraints:
            if isinstance(constr, UniqueConstraint):
                indices.append([col.name for col in constr.columns])
        return indices

    def commit(self) -> None:
        try:
            self._session.commit()
        except IntegrityError:
            self._session.rollback()
            raise

    def save(self, model: BASE, commit: bool = False) -> None:
        try:
            self._session.add(model)
            self._session.flush()
            if commit:
                self._session.commit()
        except IntegrityError:
            self._session.rollback()
            raise

    def merge(self, model: BASE, commit: bool = False) -> None:
        try:
            self._session.merge(model)
            self._session.flush()
            if commit:
                self._session.commit()
        except IntegrityError:
            self._session.rollback()
            raise

    def batch_save(self, models: list[BASE], commit: bool = False) -> None:
        self._session.add_all(models)
        self._session.flush()
        if commit:
            self._session.commit()

    def delete(self, model: BASE, commit: bool = False) -> None:
        self._session.delete(model)
        if commit:
            self._session.commit()

    def batch_delete(self, models: list[BASE], commit: bool = False) -> None:
        for model in models:
            self._session.delete(model)
        if models and commit:
            self._session.commit()

    def find_first(self, **kwargs) -> Optional[BASE]:
        self._is_allowed(kwargs.keys())
        return self._session.query(self._type).filter_by(**kwargs).first()

    def find_one(self, **kwargs) -> Optional[BASE]:
        self._is_allowed(kwargs.keys())
        return self._session.query(self._type).filter_by(**kwargs).one_or_none()

    def find_all(self, limit: Optional[int] = None, **kwargs) -> list[BASE]:
        self._is_allowed(kwargs.keys())
        query = self._session.query(self._type).filter_by(**kwargs)
        if limit is not None:
            query = query.limit(limit)
        return query.all()

    def find_all_paginated(
            self,
            page: int,
            per_page: int,
            **kwargs
    ) -> Pagination[BASE]:
        """
        Paginate results of a simple filter_by query.
        """
        self._is_allowed(kwargs.keys())
        query = self._session.query(self._type).filter_by(**kwargs)
        total = query.count()
        offset = (page - 1) * per_page
        items = query.offset(offset).limit(per_page).all()
        return Pagination(items, total, page, per_page)

    def find_all_by_filters_paginated(
            self,
            filters: list[Any],
            page: int,
            per_page: int,
            ordering: Optional[list[Any]] = None,
    ) -> Pagination[BASE]:
        """
        Paginate results of a complex filtered query.
        """
        query: Query = self._session.query(self._type)
        if filters:
            query = query.filter(*filters)
        if ordering:
            query = query.order_by(*ordering)
        total = query.count()
        offset = (page - 1) * per_page
        items = query.offset(offset).limit(per_page).all()
        return Pagination(items, total, page, per_page)

    def _find_all_by_filters(
            self,
            filters: list[Any] = None,
            ordering: list[Any] = None
    ) -> list[BASE]:
        if ordering:
            return self._find_all_by_filters_query(filters).order_by(*ordering).all()
        return self._find_all_by_filters_query(filters).all()

    def _find_first_by_filters(
            self,
            filters: list[Any] = None,
            ordering: list[Any] = None
    ) -> Optional[BASE]:
        if ordering:
            return self._find_all_by_filters_query(filters).order_by(*ordering).first()
        return self._find_all_by_filters_query(filters).first()

    def _find_one_by_filters(
            self,
            filters: list[Any] = None
    ) -> Optional[BASE]:
        return self._find_all_by_filters_query(filters).one_or_none()

    def _find_all_by_filters_query(
            self,
            filters: list[Any] = None,
            ordering: list[Any] = None
    ) -> Query:
        if ordering:
            return self._session.query(self._type).filter(*filters).order_by(*ordering)
        if filters:
            return self._session.query(self._type).filter(*filters)
        return self._session.query(self._type)

    def execute_sql_to_df(self, query_file_path: str) -> pd.DataFrame:
        with open(query_file_path, "r") as file:
            sql = text(file.read())
            return pd.read_sql_query(sql, self._session.bind)

    def execute_sql_query_to_df(self, query: str) -> pd.DataFrame:
        return pd.read_sql_query(query, self._session.bind)
