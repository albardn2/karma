from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.expense import ExpenseCreate, ExpenseRead
from models.common import Expense as ExpenseModel
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.invoice import InvoiceStatus
from app.entrypoint.routes.common.errors import BadRequestError
from app.domains.payout.domain import PayoutDomain
from app.dto.payout import PayoutCreate


class ExpenseDomain:


    @staticmethod
    def create_expense(uow:SqlAlchemyUnitOfWork, payload: ExpenseCreate) -> ExpenseRead:
        """Creates a new expense."""
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
        """Deletes an expense."""
        exp = uow.expense_repository.find_one(uuid=uuid, is_deleted=False)
        if not exp:
            raise NotFoundError(f"Expense with uuid {uuid} not found")
        ExpenseDomain.validate_delete_expense(uow=uow, expense=exp)

        exp.is_deleted = True
        uow.expense_repository.save(model=exp, commit=False)
        expense_data = ExpenseRead.from_orm(exp)
        return expense_data

    @staticmethod
    def validate_delete_expense(uow:SqlAlchemyUnitOfWork,expense:ExpenseModel) -> ExpenseRead:
        """Validates if an expense can be deleted."""

        payouts = uow.payout_repository.find_all(expense_uuid=expense.uuid,is_deleted=False)
        if payouts:
            raise BadRequestError("Expense cannot be deleted because it has associated payouts.")

