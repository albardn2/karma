from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.quality_control import QualityControlCreate, QualityControlRead
from models.common import QualityControl as QualityControlModel


class QualityControlDomain:

    @staticmethod
    def create_quality_control(uow:SqlAlchemyUnitOfWork, payload: QualityControlCreate) -> QualityControlRead:
        """
        Create a new QualityControl entry.
        """
        data = payload.model_dump()
        quality_control = QualityControlModel(**data)
        uow.quality_control_repository.save(model=quality_control, commit=False)
        return QualityControlRead.from_orm(quality_control)