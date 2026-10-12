"""Filtering the trip list by who ran a trip and which vehicle it used.

A trip does not store its assignee. The start_trip setup step does, in its task
execution's result, under `assigned_user_uuid` -- and despite the name that
holds whichever identifier the client sent: a uuid from the web, a USERNAME
from the app (see trip_setup.resolve_assignee). So "trips assigned to X" is an
EXISTS over that result matching either of X's identifiers, and the dropdown of
assignees is built from the values actually stored there, resolved to users.

Both queries spell the tenant filter out on every table they touch: they run on
the raw session, which -- unlike the repositories -- injects nothing.
"""
from sqlalchemy import false, or_, select

START_TRIP_OPERATOR = "start_trip_operator"


def display_name(first_name, last_name, username):
    """'First Last', or the username when the user has no name on file."""
    name = " ".join(p.strip() for p in (first_name or "", last_name or "") if p and p.strip())
    return name or username


def resolve_assignee_filter_user(session, account_uuid, raw):
    """The user an `assigned_user_uuid` filter value names, or None.

    Accepts a uuid or a username, like the setup step itself. Deleted users are
    included on purpose: the list still shows them as the assignee of the trips
    they ran, so those trips must stay findable by them.
    """
    from models.common import User

    if not raw:
        return None
    return (
        session.query(User)
        .filter(
            User.account_uuid == account_uuid,
            or_(User.uuid == raw, User.username == raw),
        )
        .first()
    )


def assigned_to_clause(user):
    """SQL condition on Trip: its start_trip setup assigned `user`.

    `user` None (the filter named nobody we know) matches no trip, rather than
    being dropped and quietly returning every trip.
    """
    from models.common import Task, TaskExecution, Trip

    if user is None:
        return false()
    return (
        select(TaskExecution.uuid)
        .join(Task, Task.uuid == TaskExecution.task_uuid)
        .where(
            TaskExecution.workflow_execution_uuid == Trip.workflow_execution_uuid,
            TaskExecution.account_uuid == Trip.account_uuid,
            Task.operator == START_TRIP_OPERATOR,
            TaskExecution.result["assigned_user_uuid"].astext.in_([user.uuid, user.username]),
        )
        # explicitly the OUTER trip row: never let a refactor turn this into a
        # cross join with its own copy of trip (which would match every trip)
        .correlate(Trip)
        .exists()
    )


def assignee_options(session, account_uuid):
    """Everyone some live trip in this account is assigned to, by name.

    Built from the stored assignments rather than the user list, so every option
    matches at least one trip, and so it works for the roles that can read trips
    but not list users. A stored value that resolves to no user is left out: the
    filter could not match it to anyone either.
    """
    from models.common import Task, TaskExecution, Trip, User

    stored = (
        session.query(TaskExecution.result["assigned_user_uuid"].astext)
        .join(Task, Task.uuid == TaskExecution.task_uuid)
        .join(Trip, Trip.workflow_execution_uuid == TaskExecution.workflow_execution_uuid)
        .filter(
            TaskExecution.account_uuid == account_uuid,
            Trip.account_uuid == account_uuid,
            Trip.is_deleted.is_(False),
            Task.operator == START_TRIP_OPERATOR,
        )
        .distinct()
        .all()
    )
    values = {v for (v,) in stored if v}
    if not values:
        return []
    users = (
        session.query(User.uuid, User.username, User.first_name, User.last_name)
        .filter(
            User.account_uuid == account_uuid,
            or_(User.uuid.in_(values), User.username.in_(values)),
        )
        .all()
    )
    options = [
        {"uuid": u.uuid, "username": u.username,
         "name": display_name(u.first_name, u.last_name, u.username)}
        for u in users
    ]
    return sorted(options, key=lambda o: (o["name"].casefold(), o["username"].casefold()))


def vehicle_options(session, account_uuid):
    """Every vehicle some live trip in this account used, by plate."""
    from models.common import Trip, Vehicle

    rows = (
        session.query(Vehicle.uuid, Vehicle.plate_number)
        .join(Trip, Trip.vehicle_uuid == Vehicle.uuid)
        .filter(
            Vehicle.account_uuid == account_uuid,
            Trip.account_uuid == account_uuid,
            Trip.is_deleted.is_(False),
        )
        .distinct()
        .all()
    )
    options = [{"uuid": r.uuid, "plate_number": r.plate_number} for r in rows]
    return sorted(options, key=lambda o: (o["plate_number"] or "").casefold())
