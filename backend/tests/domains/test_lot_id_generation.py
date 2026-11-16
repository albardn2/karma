"""Generated lot numbers stay unique within the same second (QA STK-INV-7).

lot_id is unique across every tenant, forever. A bare second-resolution timestamp
made two lots added in the same second collide with a 409, which is why the app
had to force users to type one.
"""
import re
from datetime import datetime

from app.domains.inventory import domain as inventory_domain
from app.domains.inventory.domain import InventoryDomain

FIXED_NOW = datetime(2026, 11, 16, 19, 23, 58)


class _FrozenDatetime(datetime):
    @classmethod
    def utcnow(cls):
        return FIXED_NOW


def test_lot_ids_generated_in_the_same_second_differ(monkeypatch):
    monkeypatch.setattr(inventory_domain, "datetime", _FrozenDatetime)

    ids = {InventoryDomain.generate_lot_id_dashed() for _ in range(50)}

    assert len(ids) == 50, sorted(ids)


def test_lot_id_still_reads_as_the_time_it_was_added(monkeypatch):
    monkeypatch.setattr(inventory_domain, "datetime", _FrozenDatetime)

    lot_id = InventoryDomain.generate_lot_id_dashed()

    assert re.fullmatch(r"2026-11-16-19:23:58-[0-9a-f]{4}", lot_id), lot_id
