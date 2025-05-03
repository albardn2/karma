import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.adapters.repositories.customer_repository import CustomerRepository
from app.adapters.unit_of_work._abstract_unit_of_work import AbstractUnitOfWork
from app.adapters.repositories.material_repository import MaterialRepository
from app.adapters.repositories.vendor_repository import VendorRepository
from app.adapters.repositories.employee_repository import EmployeeRepository
from app.adapters.repositories.expense_repository import ExpenseRepository
from app.adapters.repositories.fixed_asset_repository import FixedAssetRepository
from app.adapters.repositories.pricing_repository import PricingRepository
from app.adapters.repositories.purchase_order_repository import PurchaseOrderRepository
from app.adapters.repositories.purchase_order_item_repository import PurchaseOrderItemRepository
from app.adapters.repositories.financial_account_repository import FinancialAccountRepository
from app.adapters.repositories.warehouse_repository import WarehouseRepository
from app.adapters.repositories.transaction_repository import TransactionRepository
from app.adapters.repositories.customer_order_repository import CustomerOrderRepository
from app.adapters.repositories.customer_order_item_repository import CustomerOrderItemRepository
from app.adapters.repositories.invoice_repository import InvoiceRepository
from app.adapters.repositories.invoice_item_repository import InvoiceItemRepository
from app.adapters.repositories.payment_repository import PaymentRepository
from app.adapters.repositories.payout_repository import PayoutRepository
from app.adapters.repositories.inventory_repository import InventoryRepository
from app.adapters.repositories.inventory_event_repository import InventoryEventRepository
from app.adapters.repositories.debit_note_item_repository import DebitNoteItemRepository
from app.adapters.repositories.credit_note_item_repository import CreditNoteItemRepository
from app.adapters.repositories.process_repository import ProcessRepository


SQLALCHEMY_DATABASE_URI = os.getenv("SQLALCHEMY_DATABASE_URI")  # type: ignore
DEFAULT_SESSION_FACTORY = sessionmaker(autocommit=False, autoflush=True, bind=create_engine(SQLALCHEMY_DATABASE_URI))





class SqlAlchemyUnitOfWork(AbstractUnitOfWork):
    def __init__(self, session_factory=DEFAULT_SESSION_FACTORY):
        self.session_factory = session_factory

    def __enter__(self):
        self.session = self.session_factory()
        self.customer_repository = CustomerRepository(session=self.session)
        self.material_repository = MaterialRepository(session=self.session)
        self.vendor_repository = VendorRepository(session=self.session)
        self.employee_repository = EmployeeRepository(session=self.session)
        self.expense_repository = ExpenseRepository(session=self.session)
        self.fixed_asset_repository = FixedAssetRepository(session=self.session)
        self.pricing_repository = PricingRepository(session=self.session)
        self.purchase_order_repository = PurchaseOrderRepository(session=self.session)
        self.purchase_order_item_repository = PurchaseOrderItemRepository(session=self.session)
        self.financial_account_repository = FinancialAccountRepository(session=self.session)
        self.warehouse_repository = WarehouseRepository(session=self.session)  # Placeholder for warehouse repository
        self.transaction_repository = TransactionRepository(session=self.session)
        self.customer_order_repository = CustomerOrderRepository(session=self.session)
        self.customer_order_item_repository = CustomerOrderItemRepository(session=self.session)
        self.invoice_repository = InvoiceRepository(session=self.session)
        self.invoice_item_repository = InvoiceItemRepository(session=self.session)
        self.payment_repository = PaymentRepository(session=self.session)
        self.payout_repository = PayoutRepository(session=self.session)
        self.inventory_repository = InventoryRepository(session=self.session)
        self.inventory_event_repository = InventoryEventRepository(session=self.session)
        self.debit_note_item_repository = DebitNoteItemRepository(session=self.session)
        self.credit_note_item_repository = CreditNoteItemRepository(session=self.session)
        self.process_repository = ProcessRepository(session=self.session)

        return self

    def __exit__(self, *args):
        super().__exit__(*args)
        self.session.close()

    def _commit(self):
        self.session.commit()

    def rollback(self):
        self.session.rollback()
