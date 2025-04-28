from app.dto.payout import PayoutRead
from app.dto.payout import PayoutCreate
from models.common import Payout as PayoutModel
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError


class PayoutDomain:
    @staticmethod
    def create_payout(uow:SqlAlchemyUnitOfWork, payload: PayoutCreate) -> PayoutRead:
        data = payload.model_dump(mode='json')
        po = PayoutModel(**data)

        financial_account = uow.financial_account_repository.find_one(currency=payload.currency,is_deleted=False)
        po.financial_account = financial_account
        uow.payout_repository.save(model=po, commit=False)

        # add financial account domain to subtract from account balance
        return PayoutRead.from_orm(po)

    @staticmethod
    def delete_payout(uow:SqlAlchemyUnitOfWork, uuid: str) -> PayoutRead:
        po = uow.payout_repository.find_one(uuid=uuid, is_deleted=False)
        if not po:
            raise NotFoundError('Payout not found')

        po.is_deleted = True
        uow.payout_repository.save(model=po, commit=False)

        # add financial account domain to subtract from account balance
        return PayoutRead.from_orm(po)
