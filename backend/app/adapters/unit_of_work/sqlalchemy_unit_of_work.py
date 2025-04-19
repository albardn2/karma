import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.adapters.repositories.customer_repository import CustomerRepository
from app.adapters.unit_of_work._abstract_unit_of_work import AbstractUnitOfWork
from app.adapters.repositories.material_repository import MaterialRepository

SQLALCHEMY_DATABASE_URI = os.getenv("SQLALCHEMY_DATABASE_URI")  # type: ignore
DEFAULT_SESSION_FACTORY = sessionmaker(autocommit=False, autoflush=True, bind=create_engine(SQLALCHEMY_DATABASE_URI))


class SqlAlchemyUnitOfWork(AbstractUnitOfWork):
    def __init__(self, session_factory=DEFAULT_SESSION_FACTORY):
        self.session_factory = session_factory

    def __enter__(self):
        self.session = self.session_factory()
        self.customer_repository = CustomerRepository(session=self.session)
        self.material_repository = MaterialRepository(session=self.session)

        return self

    def __exit__(self, *args):
        super().__exit__(*args)
        self.session.close()

    def _commit(self):
        self.session.commit()

    def rollback(self):
        self.session.rollback()
