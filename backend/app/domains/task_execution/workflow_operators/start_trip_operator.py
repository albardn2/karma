from datetime import datetime, timedelta
from typing import Optional

from app.domains.task_execution.workflow_operators.operator_interface import OperatorInterface
from app.domains.task_execution.workflow_operators.trip_setup import FORM_STRATEGIES, MANUAL
from app.dto.task_execution import TaskExecutionComplete
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import (
    WorkflowStatus
)

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork


# The trip is scheduled for a day the dispatcher picks from a rolling window:
# today through a week out. Dates are Damascus-local (UTC+3) like the trip-name
# default — the servers run UTC and the business does not, so a trip planned
# after 21:00 must not be told "today" is already yesterday.
ASSIGNED_DATE_WINDOW_DAYS = 7
ASSIGNED_DATE_FORMAT = "%d-%m-%Y"


def _damascus_today():
    return (datetime.utcnow() + timedelta(hours=3)).date()


def assigned_date_options() -> list[str]:
    """The pickable dates, oldest first — generated fresh on every form read
    (dto/task.py enriches the field with these), never stored, because a baked
    list of dates is stale by tomorrow."""
    today = _damascus_today()
    return [
        (today + timedelta(days=i)).strftime(ASSIGNED_DATE_FORMAT)
        for i in range(ASSIGNED_DATE_WINDOW_DAYS + 1)
    ]


class StartTripOperatorSchema(BaseModel):
    """The 2026-08 setup form: six fields.

    The routing inputs the old form carried (warehouses, categories, visit
    threshold, min/max stops) left with the routing revamp; `strategy` names
    the algorithm instead, and only `manual` exists until the new algorithms
    land. Old executions' stored results are read via trip_setup.resolve_strategy,
    not this schema — this validates NEW submissions only.
    """
    model_config = ConfigDict(extra="forbid")

    service_areas: Optional[list[str]] = None
    assigned_user_uuid: str
    # dd-mm-yyyy, from the rolling window above; the single-pick checklist may
    # deliver it as a one-element list
    assigned_date: str
    desired_stops: Optional[int] = Field(None, ge=1, le=200)
    strategy: str = MANUAL
    vehicle_plate: str

    @field_validator("assigned_date", "strategy", mode="before")
    def unwrap_single_pick(cls, v):
        # single-pick checklists submit a one-element list
        if isinstance(v, list):
            if len(v) != 1:
                raise BadRequestError("exactly one option must be picked")
            v = v[0]
        return v

    @field_validator("strategy")
    def strategy_must_exist(cls, v):
        value = str(v).strip().lower()
        if value not in FORM_STRATEGIES:
            raise BadRequestError(
                f"Unknown routing strategy '{v}'. Available: {', '.join(FORM_STRATEGIES)}"
            )
        return value

    @field_validator("assigned_date")
    def date_in_window(cls, v):
        try:
            picked = datetime.strptime(str(v).strip(), ASSIGNED_DATE_FORMAT).date()
        except ValueError:
            raise BadRequestError("assigned_date must be dd-mm-yyyy")
        today = _damascus_today()
        if not (today <= picked <= today + timedelta(days=ASSIGNED_DATE_WINDOW_DAYS)):
            raise BadRequestError(
                f"assigned_date must be between today and {ASSIGNED_DATE_WINDOW_DAYS} days out"
            )
        return picked.strftime(ASSIGNED_DATE_FORMAT)


class StartTripOperator(OperatorInterface):

    def execute(self,uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameter: Optional[dict] = None,
                *args, **kwargs):

        # load the operator schema
        operator_schema = StartTripOperatorSchema(**payload.result)

        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")

        # A user may be assigned to at most one in-progress trip at a time. Block
        # starting this trip if the assignee already has another in-progress trip
        # assigned to them (their start_trip result.assigned_user_uuid matches).
        if operator_schema.assigned_user_uuid:
            from models.common import (
                WorkflowExecution as WFEModel,
                TaskExecution as TEModel,
                Task as TaskModel,
            )
            # the assignee is chosen by username (or uuid); resolve to a real
            # user so we key the check off a UNIQUE identity — never fall back to
            # matching a non-unique raw string (e.g. a first name).
            assignee = (
                uow.user_repository.find_one(uuid=operator_schema.assigned_user_uuid, is_deleted=False)
                or uow.user_repository.find_one(username=operator_schema.assigned_user_uuid, is_deleted=False)
            )
            if not assignee:
                raise BadRequestError(
                    f"Assigned user '{operator_schema.assigned_user_uuid}' was not found"
                )
            # assignment is stored as either the username or the uuid — match both
            values = [assignee.uuid, assignee.username]
            existing = (
                uow.session.query(WFEModel.uuid)
                .join(TEModel, TEModel.workflow_execution_uuid == WFEModel.uuid)
                .join(TaskModel, TaskModel.uuid == TEModel.task_uuid)
                .filter(
                    WFEModel.status == WorkflowStatus.IN_PROGRESS.value,
                    WFEModel.account_uuid == uow.account_uuid,
                    WFEModel.is_deleted.is_(False),
                    WFEModel.uuid != task_exe.workflow_execution_uuid,
                    TaskModel.operator == "start_trip_operator",
                    TEModel.result["assigned_user_uuid"].astext.in_(values),
                )
                .first()
            )
            if existing:
                raise BadRequestError(
                    "This user already has a trip in progress; finish or cancel it "
                    "before assigning another."
                )

        task_exe.result = operator_schema.model_dump(mode="json")
        task_exe.status = WorkflowStatus.COMPLETED.value
        task_exe.end_time = datetime.now()
        task_exe.completed_by_uuid = payload.completed_by_uuid

        # Save the task execution with the result
        uow.task_execution_repository.save(task_exe, commit=False)

    def validate(self):
        raise NotImplementedError("The validate method must be implemented by subclasses.")

    @property
    def name(self) -> str:
        # name of class
        return self.__class__.__name__



