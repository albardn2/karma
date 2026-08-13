"""Recording customer tag changes into customer_tag_event.

Both the create and update routes call record_tag_changes() with the tags before
and after the write; it diffs them per key and appends one event per changed
key, all sharing a change_group_uuid. Single-valued-per-key (enforced by the
DTO) is what makes old_value -> new_value well defined.
"""
import uuid as uuidlib
from datetime import datetime

from app.dto.customer import split_tag
from models.common import CustomerTagEvent


def _key_value_map(tags) -> dict:
    """{key: value} for a tag list. Bare keys map to '' (present, no value).
    Single-valued per key by DTO invariant; if a legacy row somehow holds two
    values for a key, last wins — deterministic and never raises here."""
    out: dict = {}
    for tag in tags or []:
        key, value = split_tag(tag)
        out[key] = value
    return out


def record_tag_changes(uow, *, customer_uuid: str, account_uuid: str,
                       created_by_uuid, old_tags, new_tags) -> int:
    """Append an event per key whose value changed between old_tags and new_tags.

    Returns the number of events written. Nothing is committed — the caller's
    unit of work owns the transaction, so the events land in the same commit as
    the customer write (or roll back with it). A no-op change writes nothing.
    """
    old_map = _key_value_map(old_tags)
    new_map = _key_value_map(new_tags)

    group = str(uuidlib.uuid4())
    now = datetime.utcnow()
    written = 0
    # every key touched on either side; absent side -> None (distinct from the
    # '' that marks a bare key present)
    for key in set(old_map) | set(new_map):
        old_value = old_map.get(key)  # None when key absent in old
        new_value = new_map.get(key)  # None when key absent in new
        if old_value == new_value:
            continue
        uow.session.add(CustomerTagEvent(
            uuid=str(uuidlib.uuid4()),
            account_uuid=account_uuid,
            customer_uuid=customer_uuid,
            created_by_uuid=created_by_uuid,
            created_at=now,
            change_group_uuid=group,
            key=key,
            old_value=old_value,
            new_value=new_value,
        ))
        written += 1
    return written
