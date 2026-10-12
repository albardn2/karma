from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.expense import ExpenseCreate, ExpenseRead
from models.common import Expense as ExpenseModel
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.invoice import InvoiceStatus
from app.domains.payout.domain import PayoutDomain
from app.dto.payout import PayoutCreate


class ExpenseDomain:


    @staticmethod
    def create_expense(uow:SqlAlchemyUnitOfWork, payload: ExpenseCreate) -> ExpenseRead:
        """Creates a new expense."""
        # The FK alone would accept another tenant's trip uuid; the repo lookup
        # is account-scoped, so a foreign or unknown trip simply is not found.
        if payload.trip_uuid:
            trip = uow.trip_repository.find_one(uuid=payload.trip_uuid, is_deleted=False)
            if not trip:
                raise NotFoundError('Trip not found')
            # A trip expense belongs to the trip's assigned vehicle. Derive it
            # rather than trust a submitted vehicle_uuid — the two must never
            # disagree, and the client (the in-trip flow) does not send one.
            payload.vehicle_uuid = trip.vehicle_uuid
        elif payload.vehicle_uuid:
            # A standalone vehicle expense: the FK alone would accept another
            # tenant's vehicle, so verify against the account-scoped repo.
            vehicle = uow.vehicle_repository.find_one(
                uuid=payload.vehicle_uuid, is_deleted=False
            )
            if not vehicle:
                raise NotFoundError('Vehicle not found')

        data = payload.model_dump(mode='json')
        should_pay = data.pop("should_pay", None)
        exp = ExpenseModel(**data)
        uow.expense_repository.save(model=exp, commit=False)

        if should_pay:
            payout_payload = PayoutCreate(
                created_by_uuid=payload.created_by_uuid,
                amount=exp.amount,
                currency=exp.currency,
                notes="autopay",
                expense_uuid=exp.uuid,
            )
            PayoutDomain.create_payout(uow, payout_payload)

        return ExpenseRead.from_orm(exp)

    @staticmethod
    def delete_expense(uuid: str, uow: SqlAlchemyUnitOfWork) -> ExpenseRead:
        """Deletes an expense, and the payouts recorded against it.

        A payout only exists to pay its expense: with the expense gone it would
        be money out of an account against nothing. And nearly every expense
        has one — trip expenses are always recorded as paid, and an expense's
        amount cannot be edited once paid — so refusing to delete a paid
        expense left no way at all to remove a wrong one.

        Nothing about a payout is stored anywhere else: an account's balance
        and an expense's paid/owed figures are computed from the live payouts
        on every read, and payouts write no transaction rows. Soft-deleting
        them is therefore the whole reversal — each amount returns to the
        account it was paid from. Expense and payouts are flushed in the
        caller's one unit of work, so they go together or not at all.
        """
        exp = uow.expense_repository.find_one(uuid=uuid, is_deleted=False)
        if not exp:
            raise NotFoundError(f"Expense with uuid {uuid} not found")

        for payout in uow.payout_repository.find_all(expense_uuid=exp.uuid, is_deleted=False):
            payout.is_deleted = True
            uow.payout_repository.save(model=payout, commit=False)

        exp.is_deleted = True
        uow.expense_repository.save(model=exp, commit=False)
        expense_data = ExpenseRead.from_orm(exp)
        return expense_data

