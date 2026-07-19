import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.adapters.repositories.customer_repository import CustomerRepository
from app.adapters.repositories.account_repository import AccountRepository
from app.adapters.repositories.account_ledger_repository import AccountLedgerRepository
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
from app.adapters.repositories.process_template_repository import ProcessTemplateRepository
from app.adapters.repositories.user_repository import UserRepository
from app.adapters.repositories.workflow_repository import WorkflowRepository
from app.adapters.repositories.task_repository import TaskRepository  # Placeholder for task repository
from app.adapters.repositories.workflow_execution_repository import WorkflowExecutionRepository
from app.adapters.repositories.task_execution_repository import TaskExecutionRepository
from app.adapters.repositories.quality_control_repository import QualityControlRepository
from app.adapters.repositories.vehicle_repository import VehicleRepository
from app.adapters.repositories.service_area_repository import ServiceAreaRepository
from app.adapters.repositories.trip_repository import TripRepository
from app.adapters.repositories.trip_stop_repository import TripStopRepository
from app.adapters.repositories.vehicle_inventory_repository import VehicleInventoryRepository
from app.adapters.repositories.vehicle_inventory_event_repository import VehicleInventoryEventRepository

SQLALCHEMY_DATABASE_URI = os.getenv("SQLALCHEMY_DATABASE_URI")  # type: ignore
DEFAULT_SESSION_FACTORY = sessionmaker(autocommit=False, autoflush=True, bind=create_engine(SQLALCHEMY_DATABASE_URI))


_UNSET = object()


def _account_uuid_from_request():
    """Tenant scope for the current request: set by the app's before_request
    hook from the JWT's account_uuid claim. None outside a request context
    (workers, scripts, migrations) — those run unscoped on purpose."""
    try:
        from flask import g, has_request_context
        if has_request_context():
            return getattr(g, "account_uuid", None)
    except Exception:
        pass
    return None


class SqlAlchemyUnitOfWork(AbstractUnitOfWork):
    def __init__(self, session_factory=DEFAULT_SESSION_FACTORY, account_uuid=_UNSET):
        self.session_factory = session_factory
        self._account_uuid_param = account_uuid

    def __enter__(self):
        self.account_uuid = (
            self._account_uuid_param
            if self._account_uuid_param is not _UNSET
            else _account_uuid_from_request()
        )
        self.session = self.session_factory()
        self.account_repository = AccountRepository(session=self.session, account_uuid=None)
        # platform-level ledger: superuser console only, never tenant-scoped
        self.account_ledger_repository = AccountLedgerRepository(session=self.session, account_uuid=None)
        self.customer_repository = CustomerRepository(session=self.session, account_uuid=self.account_uuid)
        self.material_repository = MaterialRepository(session=self.session, account_uuid=self.account_uuid)
        self.vendor_repository = VendorRepository(session=self.session, account_uuid=self.account_uuid)
        self.employee_repository = EmployeeRepository(session=self.session, account_uuid=self.account_uuid)
        self.expense_repository = ExpenseRepository(session=self.session, account_uuid=self.account_uuid)
        self.fixed_asset_repository = FixedAssetRepository(session=self.session, account_uuid=self.account_uuid)
        self.pricing_repository = PricingRepository(session=self.session, account_uuid=self.account_uuid)
        self.purchase_order_repository = PurchaseOrderRepository(session=self.session, account_uuid=self.account_uuid)
        self.purchase_order_item_repository = PurchaseOrderItemRepository(session=self.session, account_uuid=self.account_uuid)
        self.financial_account_repository = FinancialAccountRepository(session=self.session, account_uuid=self.account_uuid)
        self.warehouse_repository = WarehouseRepository(session=self.session, account_uuid=self.account_uuid)  # Placeholder for warehouse repository
        self.transaction_repository = TransactionRepository(session=self.session, account_uuid=self.account_uuid)
        self.customer_order_repository = CustomerOrderRepository(session=self.session, account_uuid=self.account_uuid)
        self.customer_order_item_repository = CustomerOrderItemRepository(session=self.session, account_uuid=self.account_uuid)
        self.invoice_repository = InvoiceRepository(session=self.session, account_uuid=self.account_uuid)
        self.invoice_item_repository = InvoiceItemRepository(session=self.session, account_uuid=self.account_uuid)
        self.payment_repository = PaymentRepository(session=self.session, account_uuid=self.account_uuid)
        self.payout_repository = PayoutRepository(session=self.session, account_uuid=self.account_uuid)
        self.inventory_repository = InventoryRepository(session=self.session, account_uuid=self.account_uuid)
        self.inventory_event_repository = InventoryEventRepository(session=self.session, account_uuid=self.account_uuid)
        self.debit_note_item_repository = DebitNoteItemRepository(session=self.session, account_uuid=self.account_uuid)
        self.credit_note_item_repository = CreditNoteItemRepository(session=self.session, account_uuid=self.account_uuid)
        self.process_repository = ProcessRepository(session=self.session, account_uuid=self.account_uuid)
        self.process_template_repository = ProcessTemplateRepository(session=self.session, account_uuid=self.account_uuid)
        self.user_repository = UserRepository(session=self.session, account_uuid=self.account_uuid)
        self.workflow_repository = WorkflowRepository(session=self.session, account_uuid=self.account_uuid)
        self.task_repository = TaskRepository(session=self.session, account_uuid=self.account_uuid)
        self.workflow_execution_repository = WorkflowExecutionRepository(session=self.session, account_uuid=self.account_uuid)
        self.task_execution_repository = TaskExecutionRepository(session=self.session, account_uuid=self.account_uuid)
        self.quality_control_repository = QualityControlRepository(session=self.session, account_uuid=self.account_uuid)
        self.vehicle_repository = VehicleRepository(session=self.session, account_uuid=self.account_uuid)
        self.service_area_repository = ServiceAreaRepository(session=self.session, account_uuid=self.account_uuid)
        self.trip_repository = TripRepository(session=self.session, account_uuid=self.account_uuid)
        self.trip_stop_repository = TripStopRepository(session=self.session, account_uuid=self.account_uuid)
        self.vehicle_inventory_repository = VehicleInventoryRepository(session=self.session, account_uuid=self.account_uuid)
        self.vehicle_inventory_event_repository = VehicleInventoryEventRepository(session=self.session, account_uuid=self.account_uuid)

        return self

    def __exit__(self, *args):
        super().__exit__(*args)
        self.session.close()

    def _commit(self):
        self.session.commit()

    def rollback(self):
        self.session.rollback()
