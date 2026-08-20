from typing import Optional

from sqlalchemy import or_, select

from app.adapters.repositories._abstract_repo import AbstractRepository, Pagination
from models.common import Task, TaskExecution

class TaskRepository(AbstractRepository[Task]):
    """The task table holds two populations with different tenancy rules:

    - definitions (workflow_uuid IS NOT NULL): platform-global, superuser-
      managed, readable by every tenant. The model has no account_uuid on
      purpose (migration f8c3d5a27e91).
    - dynamic per-trip tasks (workflow_uuid IS NULL): minted by the trip flow
      with the customer's full contact snapshot in task_inputs — tenant data
      that must never cross accounts.

    The generic scoping in AbstractRepository keys off an account_uuid column,
    so it treats this table as unscoped. Tenancy for the dynamic rows is
    instead derived here: every dynamic task gets a task_execution in the same
    transaction, and task_execution.account_uuid is non-nullable. A scoped
    read may therefore see definitions plus its own account's dynamic rows;
    an unscoped repo (workers, scripts) sees everything, matching every other
    repository. Dynamic rows whose execution is missing are visible to no
    tenant — an orphan belongs to nobody rather than to everybody.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Task

    def _scope_filters(self, filters: Optional[list]) -> list:
        filters = list(filters) if filters else []
        if self._account_uuid is not None:
            filters.append(or_(
                Task.workflow_uuid.isnot(None),
                Task.uuid.in_(
                    select(TaskExecution.task_uuid).where(
                        TaskExecution.account_uuid == self._account_uuid,
                        TaskExecution.task_uuid.isnot(None),
                    )
                ),
            ))
        return filters

    # The kwargs-based finders in the base class scope through filter_by,
    # which cannot express the OR above — route them through the filter
    # path so no read bypasses the derived scoping.

    def _kwargs_filters(self, kwargs: dict) -> list:
        return [getattr(Task, key) == value for key, value in kwargs.items()]

    def find_first(self, **kwargs) -> Optional[Task]:
        self._is_allowed(kwargs.keys())
        return self._find_first_by_filters(self._kwargs_filters(kwargs))

    def find_one(self, **kwargs) -> Optional[Task]:
        self._is_allowed(kwargs.keys())
        return self._find_one_by_filters(self._kwargs_filters(kwargs))

    def find_all(self, limit: Optional[int] = None, **kwargs) -> list[Task]:
        self._is_allowed(kwargs.keys())
        query = self._find_all_by_filters_query(self._kwargs_filters(kwargs))
        if limit is not None:
            query = query.limit(limit)
        return query.all()

    def find_all_paginated(self, page: int, per_page: int, **kwargs) -> Pagination[Task]:
        self._is_allowed(kwargs.keys())
        return self.find_all_by_filters_paginated(
            filters=self._kwargs_filters(kwargs),
            page=page,
            per_page=per_page,
        )
