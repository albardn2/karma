from datetime import datetime

from app.dto.common_enums import Currency
from app.dto.inventory import InventoryRead
from models.common import Inventory as InventoryModel
from app.dto.inventory import InventoryCreate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from app.dto.inventory import InventoryFIFOOutput

# lot costs are reported in this currency unless the caller asks otherwise
DEFAULT_COST_CURRENCY = Currency.SYP


class InventoryDomain:
    @staticmethod
    def create_inventory(uow:SqlAlchemyUnitOfWork, payload: InventoryCreate) -> InventoryRead:
        inventory = InventoryModel(**payload.model_dump())
        material = uow.material_repository.find_one(uuid=payload.material_uuid, is_deleted=False)
        if not material:
            raise NotFoundError('Material not found')
        inventory.unit = material.measure_unit

        if not inventory.lot_id:
            inventory.lot_id = InventoryDomain.generate_lot_id_dashed()

        uow.inventory_repository.save(model=inventory,commit=False)
        dto = InventoryRead.from_orm(inventory)
        InventoryDomain.enrich_cost_per_unit(uow=uow, inventory_dto=dto)
        return dto


    @staticmethod
    def delete_inventory(uow: SqlAlchemyUnitOfWork, uuid: str) -> InventoryRead:
        inventory = uow.inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError('Inventory not found')

        inventory_events = uow.inventory_event_repository.find_all(
            inventory_uuid=inventory.uuid,
            is_deleted=False
        )
        if inventory_events:
            raise NotFoundError('Inventory has inventory events, cannot be deleted')

        inventory.is_deleted = True
        uow.inventory_repository.save(model=inventory,commit=False)
        return InventoryRead.from_orm(inventory)

    @staticmethod
    def generate_lot_id_dashed() -> str:
        return datetime.utcnow().strftime("%Y-%m-%d-%H:%M:%S")

    @staticmethod
    def new_cost_context(currency: Currency = DEFAULT_COST_CURRENCY) -> dict:
        """Share one context across several enrich_cost_per_unit calls (a
        paginated list, the material summary) so each lot's cost is computed
        once per request instead of once per reference.

        `currency` is the currency every cost in this context is reported in;
        `rates` caches one USD→SYP rate per event day; `backfill_attempted`
        limits the on-the-spot sp-today pull to one per request, and
        `rates_ingested` tells the owning route it has new rate rows worth
        committing.
        """
        return {
            "cache": {},
            "stack": set(),
            "cuts": 0,
            "currency": Currency(currency),
            "rates": {},
            "backfill_attempted": False,
            "rates_ingested": False,
        }

    @staticmethod
    def enrich_cost_per_unit(
        uow: SqlAlchemyUnitOfWork,
        inventory_dto: InventoryRead,
        cost_ctx: dict = None,
        currency: Currency = None,
    ):
        """Enrich cost per unit based on the material.

        `currency` picks the reporting currency when no context is supplied;
        a supplied context's own currency always governs."""
        ctx = cost_ctx if cost_ctx is not None else InventoryDomain.new_cost_context(
            currency=currency or DEFAULT_COST_CURRENCY
        )
        cost, original_quantity = InventoryDomain._lot_cost_and_quantity(
            uow=uow, inventory_uuid=inventory_dto.uuid, ctx=ctx
        )
        # cost None means UNKNOWN (no knowable receipt) — kept as null so the
        # UI can say "N/A" instead of asserting the stock was free
        inventory_dto.cost_per_unit = cost
        inventory_dto.total_original_cost = None if cost is None else cost * original_quantity
        inventory_dto.cost_currency = ctx["currency"]

    @staticmethod
    def _lot_cost_and_quantity(uow: SqlAlchemyUnitOfWork, inventory_uuid: str, ctx: dict):
        """Weighted-average cost of one lot, plus its original quantity.

        Only events whose cost is actually knowable enter the average — an
        explicit cost_per_unit (0 is a real cost: free goods), a purchase order
        item's adjusted price, or a process output's rolled-up cost. A receipt
        with none of those has an UNKNOWN cost, not a zero one, so it is left
        out of both sides of the division; folding its quantity in (as this
        used to) silently diluted the average of every lot with a costless
        opening balance or adjustment.

        The divisor is a SIGNED sum, so it can legitimately reach zero — a lot
        whose receipts were fully credited back leaves costs of [+1000, -1000]
        over quantities of [+100, -100]. Dividing then raised ZeroDivisionError,
        which is not an ApiError, so it surfaced as a 500 that took down the
        whole paginated inventory list; on the material page, whose query has no
        error branch, the lot list fell back to empty and the negative lot and
        its "Zero out" button silently disappeared.

        Returns cost None when the lot's cost is UNKNOWN — no knowable receipt
        at all — and (None, 0) when re-entered for a lot already being costed
        higher up the process chain: lots and processes can form a cycle
        through the public API, and before this guard one poisoned lot made
        every read of it (including the whole inventory list) die with
        RecursionError.
        """
        from app.domains.process.domain import ProcessDomain

        if inventory_uuid in ctx["cache"]:
            return ctx["cache"][inventory_uuid]
        if inventory_uuid in ctx["stack"]:
            ctx["cuts"] += 1
            return None, 0.0

        inventory = uow.inventory_repository.find_one(uuid=inventory_uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError('Inventory not found')

        cuts_before = ctx["cuts"]
        ctx["stack"].add(inventory_uuid)
        try:
            events = [event for event in inventory.inventory_events if (not event.is_deleted) and event.affect_original]

            known_costs = []
            known_quantity = 0.0
            original_quantity = 0.0
            for event in events:
                original_quantity += event.quantity

                if event.cost_per_unit is not None:
                    # an explicit cost without a currency is unconvertible —
                    # unknown, not assumed (guessing SYP would be off 100x for
                    # rows that predate the redenomination's labelling)
                    unit_cost = InventoryDomain._unit_cost_in_target(
                        uow=uow, ctx=ctx,
                        unit_cost=event.cost_per_unit,
                        source_currency=event.currency,
                        on=event.created_at,
                    )
                elif event.purchase_order_item_uuid:
                    unit_cost = InventoryDomain._unit_cost_in_target(
                        uow=uow, ctx=ctx,
                        unit_cost=event.purchase_order_item.adjusted_price_per_unit,
                        source_currency=event.purchase_order_item.currency,
                        on=event.created_at,
                    )
                elif event.process_uuid:
                    # process roll-ups are computed recursively in the target
                    # currency (each input converts at its own event's day), so
                    # there is nothing left to convert here
                    unit_cost = ProcessDomain._cost_per_unit_for_output(
                        uow=uow,
                        process=event.process,
                        output_inventory_uuid=inventory_uuid,
                        cost_ctx=ctx,
                    )
                else:
                    unit_cost = None

                if unit_cost is None:
                    continue
                known_costs.append(unit_cost * event.quantity)
                known_quantity += event.quantity

            if not known_costs:
                # nothing knowable at all: the answer is "unknown", not 0 —
                # a 0 here reads as free goods everywhere downstream
                cost = None
            elif abs(known_quantity) < 1e-9:
                cost = 0
            else:
                cost = sum(known_costs) / known_quantity
        finally:
            ctx["stack"].discard(inventory_uuid)

        # A cost computed while a cycle was being cut somewhere below depends
        # on WHERE the cut happened, so it is only right for this traversal —
        # caching it would let the page's iteration order change what a lot
        # costs. Lots with no cycle beneath them keep full memoization.
        if ctx["cuts"] == cuts_before:
            ctx["cache"][inventory_uuid] = (cost, original_quantity)
        return cost, original_quantity

    @staticmethod
    def _unit_cost_in_target(uow: SqlAlchemyUnitOfWork, ctx: dict, unit_cost: float,
                             source_currency, on: datetime):
        """`unit_cost` restated in the context's currency, or None if it cannot
        be: no source currency on the row, or no usable rate anywhere near the
        day. None means "unknown", and the caller excludes the event rather
        than average in a number that is off by a factor of the exchange rate.
        """
        if unit_cost is None:
            return None
        if unit_cost == 0:
            # zero is zero in every currency — needing no rate also means a
            # free receipt stays known when the rate table cannot answer
            return 0.0
        if source_currency is None:
            return None

        try:
            source = Currency(source_currency)
        except ValueError:
            # a currency this code does not know how to convert is an unknown
            # cost, not a crash — old rows are edited through unvalidated paths
            return None
        target = ctx["currency"]
        if source == target:
            return unit_cost

        rate = InventoryDomain._usd_syp_rate_for_day(uow=uow, ctx=ctx, day=on.date())
        if rate is None or rate <= 0:
            return None
        if source == Currency.SYP and target == Currency.USD:
            return unit_cost / rate
        if source == Currency.USD and target == Currency.SYP:
            return unit_cost * rate
        return None

    # A rate within this many days of the event is "the rate in effect": the
    # source skips days the market did not move, so exact-day misses are
    # normal and are NOT a reason to go pull data.
    RATE_GAP_TOLERANCE_DAYS = 7
    # sp-today's history bottoms out around a year; a pull can never reach
    # further, so never fire one for older days
    RATE_SOURCE_REACH_DAYS = 365

    @staticmethod
    def _usd_syp_rate_for_day(uow: SqlAlchemyUnitOfWork, ctx: dict, day) -> float:
        """USD→SYP rate for one market day, cached per request.

        The nearest recorded day answers, and that is usually the right
        answer — the source publishes nothing on idle market days. Only a
        genuine GAP (no rate within RATE_GAP_TOLERANCE_DAYS, and the day young
        enough for the source to reach) triggers an on-the-spot pull: one per
        request, and always the full year, so one pull fixes every gap this
        request — and every later one — will hit. None only when the table has
        no usable rate at all, and the caller treats that cost as unknown
        rather than invent a conversion. Never raises: a cost display must not
        500 because sp-today is unreachable.
        """
        from datetime import date as date_type
        from app.domains.exchange_rate.domain import ExchangeRateDomain
        from app.dto.exchange_rate import BackfillRange

        if day in ctx["rates"]:
            return ctx["rates"][day]

        row = ExchangeRateDomain.closest(
            uow=uow, from_currency=Currency.USD, to_currency=Currency.SYP, on=day
        )
        gap_is_fine = (
            row is not None
            and abs((row.rate_date - day).days) <= InventoryDomain.RATE_GAP_TOLERANCE_DAYS
        )
        source_can_reach = (
            (date_type.today() - day).days <= InventoryDomain.RATE_SOURCE_REACH_DAYS
        )
        if not gap_is_fine and source_can_reach and not ctx["backfill_attempted"]:
            ctx["backfill_attempted"] = True
            try:
                ExchangeRateDomain.backfill(
                    uow=uow, backfill_range=BackfillRange.ONE_YEAR
                )
                ctx["rates_ingested"] = True
                row = ExchangeRateDomain.closest(
                    uow=uow, from_currency=Currency.USD, to_currency=Currency.SYP, on=day
                ) or row
            except Exception:
                pass

        rate = row.rate if row else None
        ctx["rates"][day] = rate
        return rate


    @staticmethod
    def get_fifo_inventories_for_material(
        uow: SqlAlchemyUnitOfWork,
        material_uuid: str,
        quantity: float,
        allow_negative: bool = False,
    ) -> list[InventoryFIFOOutput]:
        """Split `quantity` across this material's lots, oldest stock first.

        `allow_negative` decides what happens when the lots do not cover the
        request. Selling is allowed to overdraw — a driver hands over goods the
        books have not caught up with, and refusing the sale loses the record of
        something that physically happened. Production is not: consuming input
        that does not exist would invent output, so the process path leaves this
        off and still gets the old error.

        Whatever the answer, the returned quantities always sum to `quantity` —
        the caller turns each entry into an inventory event, so dropping the
        shortfall here would silently under-deduct stock.
        """
        inventories = uow.inventory_repository.get_fifo_inventories_for_material(
            material_uuid=material_uuid,
            quantity=quantity
        )

        result = []
        remaining_quantity = quantity
        last_drawn_lot = None
        for inventory in inventories:
            if remaining_quantity <= 0:
                break

            if inventory.current_quantity <= 0:
                continue

            if inventory.current_quantity >= remaining_quantity:
                dto = InventoryFIFOOutput(
                    inventory_uuid=inventory.uuid,
                    material_uuid=inventory.material_uuid,
                    quantity=remaining_quantity
                )
                result.append(dto)
                last_drawn_lot = inventory
                remaining_quantity = 0
            else:
                dto = InventoryFIFOOutput(
                    inventory_uuid=inventory.uuid,
                    material_uuid=inventory.material_uuid,
                    quantity=inventory.current_quantity
                )
                result.append(dto)
                last_drawn_lot = inventory
                remaining_quantity -= inventory.current_quantity

        if remaining_quantity > 0:
            if not allow_negative:
                raise NotFoundError(
                    f"Insufficient inventory for material {material_uuid}: "
                    f"requested {quantity}, available {quantity - remaining_quantity}"
                )
            InventoryDomain._absorb_shortfall(
                uow=uow,
                material_uuid=material_uuid,
                shortfall=remaining_quantity,
                last_drawn_lot=last_drawn_lot,
                result=result,
            )

        return result

    @staticmethod
    def _absorb_shortfall(
        uow: SqlAlchemyUnitOfWork,
        material_uuid: str,
        shortfall: float,
        last_drawn_lot,
        result: list[InventoryFIFOOutput],
    ) -> None:
        """Charge the uncovered quantity to one lot, pushing it negative.

        Preference is the lot FIFO stopped on, so the overdraft continues from
        where consumption ran out and stays next to the stock it overdrew. With
        no positive lots at all — everything already at or below zero — it goes
        on the newest lot for the material, so repeated overselling accumulates
        in one place instead of scattering.

        A material with no lot at all is the one case this cannot answer: a lot
        needs a warehouse, and nothing in a sale says which one. That raises,
        because inventing a warehouse would put stock somewhere it never was.
        """
        target = last_drawn_lot
        if target is None:
            target = (
                uow.session.query(InventoryModel)
                .filter(
                    InventoryModel.account_uuid == uow.account_uuid,
                    InventoryModel.material_uuid == material_uuid,
                    InventoryModel.is_deleted == False,  # noqa: E712
                )
                .order_by(InventoryModel.created_at.desc())
                .first()
            )
        if target is None:
            raise BadRequestError(
                f"Cannot record a sale of material {material_uuid}: it has no "
                f"inventory lot, so there is no warehouse to take the stock from. "
                f"Add inventory for it first."
            )

        for dto in result:
            if dto.inventory_uuid == target.uuid:
                dto.quantity += shortfall
                return
        result.append(
            InventoryFIFOOutput(
                inventory_uuid=target.uuid,
                material_uuid=target.material_uuid,
                quantity=shortfall,
            )
        )
