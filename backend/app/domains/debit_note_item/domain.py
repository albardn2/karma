from models.common import DebitNoteItem as DebitNoteItemModel
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.debit_note_item import DebitNoteItemRead, DebitNoteItemCreate, DebitNoteItemUpdate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork


class DebitNoteItemDomain:

    @staticmethod
    def create_item(uow: SqlAlchemyUnitOfWork, payload: DebitNoteItemCreate) -> DebitNoteItemRead:
        item = DebitNoteItemModel(**payload.model_dump(mode="json"))
        uow.debit_note_item_repository.save(model=item, commit=True)
        return DebitNoteItemRead.from_orm(item)


    @staticmethod
    def delete_item(uow, uuid):
        #TODO: add validations

        m = uow.debit_note_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("DebitNoteItem not found")
        uow.debit_note_item_repository.delete(model=m, commit=True)

        return DebitNoteItemRead.from_orm(m)