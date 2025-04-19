"""Abstract repository that implement common methods."""

from __future__ import annotations

from typing import Any, Generic, Iterable, Optional, TypeVar

import pandas as pd
from sqlalchemy import UniqueConstraint, orm, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.scoping import ScopedSession

from models.base import Base

BASE = TypeVar("BASE", bound=Base)


class NotAllowedQueryNonIndexedFields(Exception):
    """Raise Exception when query without an index is not allowed."""

    pass


class AbstractRepository(Generic[BASE]):
    """Abstract repository that implement common methods."""

    def __init__(self, session: orm.scoped_session = None, query_only_by_indices: bool = False) -> None:
        """Initialize the class.

        Args:
            session: SQLAlchemy session to be used. If None, the one from app.db would be used.
            query_only_by_indices: whether to allow only queries that use one of existing indices
        """
        self._session: Session = session
        self._type = Base
        self._query_only_by_indices = query_only_by_indices
        self._indices: Optional[list[list[str]]] = None

    def _is_allowed(self, column_names: Iterable[str]) -> bool:
        """Check whether querying a list of column names is allowed."""
        if not self._query_only_by_indices:
            return True
        if self._indices is None:
            self._indices = self._get_indices()
        index_found = False
        for index in self._indices:
            found = all(column in column_names for column in index)
            if found:
                index_found = True
                break
        if index_found:
            return True
        raise NotAllowedQueryNonIndexedFields(f"Fields {column_names} don't belong to any index at {self._type}")

    def _get_indices(self) -> list[list[str]]:
        """Get a list of indices that exist for a Model (i.e., an underlying physical table)."""
        indices = []
        for index in self._type.__table__.indexes:
            indices.append([column.name for column in index.columns])
        indices.append([column.name for column in self._type.__table__.primary_key.columns])
        for index in self._type.__table__.constraints:
            if isinstance(index, UniqueConstraint):
                indices.append([column.name for column in index.columns])
        return indices

    def commit(self):
        try:
            self._session.commit()
        except IntegrityError as e:
            self._session.rollback()
            print("IntegrityError", e)
            raise e

    def save(self, model: BASE, commit: bool = False) -> None:
        """Save a Model's instance.

        Args:
            model: a concrete model object
            commit: if True, commits the changes to the datasource. Defaults to False.
        """
        try:
            self._session.add(model)
            self._session.flush()
            if commit:
                self._session.commit()
        except IntegrityError as e:
            self._session.rollback()
            raise e

    def merge(self, model: BASE, commit: bool = False) -> None:
        """Merge a specific Model instance.

        Args:
            model: a concrete model object
            commit: if True, commits the changes to the datasource. Defaults to False.
        """
        try:
            self._session.merge(model)
            self._session.flush()
            if commit:
                self._session.commit()
        except IntegrityError as e:
            self._session.rollback()
            raise e

    def batch_save(self, models: list[BASE], commit: bool = False) -> None:
        """Save a collection of Model's instances.

        Args:
             models: A collection of concrete models.
             commit: if True, commits the changes to the datasource. Defaults to False.
        """
        self._session.add_all(models)
        self._session.flush()
        if commit:
            self._session.commit()

    def delete(self, model: BASE, commit: bool = False) -> None:
        """Delete an instance of a Model.

        Args:
             model: A Model's instance.
             commit: if True, commits the changes to the datasource. Defaults to False.
        """
        self._session.delete(model)
        if commit:
            self._session.commit()

    def batch_delete(self, models: list[BASE], commit: bool = False) -> None:
        """Delete all provided instances of a specific model.

        Args:
             models: A collection of Model's instances.
             commit: if True, commits the changes to the datasource. Defaults to False.
        """
        for model in models:
            self.delete(model)
        if models and commit:
            self._session.commit()

    def find_first(self, **kwargs) -> Optional[BASE]:
        """Find fist object according to named filters (e.g., service_area_uuid=1, name="NY")."""
        _ = self._is_allowed(kwargs.keys())
        return self._session.query(self._type).filter_by(**kwargs).first()

    def find_one(self, **kwargs) -> Optional[BASE]:
        """Find exactly one (or None) object according to named filters (e.g., service_area_uuid=1, name="NY")."""
        _ = self._is_allowed(kwargs.keys())
        return self._session.query(self._type).filter_by(**kwargs).one_or_none()

    def find_all(self, limit: int = None, **kwargs) -> list[BASE]:
        """Find all objects according to named filters (e.g., service_area_uuid=1, name="NY")."""
        _ = self._is_allowed(kwargs.keys())
        query = self._session.query(self._type).filter_by(**kwargs)
        return query.all() if limit is None else query.limit(limit).all()

    def _find_all_by_filters(self, filters: list[Any] = None, ordering: list[Any] = None) -> list[BASE]:
        """Find all elements from a query with filters and optional ordering."""
        if ordering:
            return self._find_all_by_filters_query(filters).order_by(*ordering).all()
        return self._find_all_by_filters_query(filters).all()

    def _find_first_by_filters(self, filters: list[Any] = None, ordering: list[Any] = None) -> Optional[BASE]:
        """Find a first element from a query with filters and optional ordering."""
        if ordering:
            return self._find_all_by_filters_query(filters).order_by(*ordering).first()
        return self._find_all_by_filters_query(filters).first()

    def _find_one_by_filters(self, filters: list = None) -> Optional[BASE]:
        """Find exactly one (or none) element from a query with filters and optional ordering."""
        return self._find_all_by_filters_query(filters).one_or_none()

    def _find_all_by_filters_query(self, filters: list = None, ordering: list[Any] = None):
        """Return a query based on filter, used for pagination."""
        if ordering:
            return self._session.query(self._type).filter(*filters).order_by(*ordering)
        if filters:
            return self._session.query(self._type).filter(*filters)
        return self._session.query(self._type)

    def execute_sql_to_df(self, query_file_path: str) -> pd.DataFrame:
        with open(query_file_path, "r") as file:
            return pd.read_sql_query(text(file.read()), self._session.bind)

    def execute_sql_query_to_df(self, query: str) -> pd.DataFrame:
        return pd.read_sql_query(query, self._session.bind)
