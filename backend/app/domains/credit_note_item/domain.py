from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.errors import BadRequestError
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

from app.dto.credit_note_item import CreditNoteItemRead
from app.dto.credit_note_item import CreditNoteItemCreate
from models.common import CreditNoteItem as CreditNoteItemModel



class CreditNoteItemDomain:
    @staticmethod
    def create_item(uow: SqlAlchemyUnitOfWork, payload: CreditNoteItemCreate) -> CreditNoteItemRead:
        item = CreditNoteItemModel(**payload.model_dump(mode="json"))
        uow.credit_note_item_repository.save(model=item, commit=False)
        return CreditNoteItemRead.from_orm(item)


    @staticmethod
    def delete_item(uow: SqlAlchemyUnitOfWork, uuid: str) -> CreditNoteItemRead:
        #TODO: add validations
        m = uow.credit_note_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("CreditNoteItem not found")

        m.is_deleted = True
        uow.credit_note_item_repository.save(model=m, commit=False)
        return CreditNoteItemRead.from_orm(m)