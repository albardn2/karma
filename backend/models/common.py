import uuid
from datetime import datetime, timezone
from geoalchemy2 import Geometry


import bcrypt
from sqlalchemy import create_engine, Column, String, DateTime, Text, Float, JSON, select, exists, and_, case, \
    CheckConstraint, false, true, func, literal, cast
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, sessionmaker, validates
import uuid
from datetime import datetime
from sqlalchemy import (
    create_engine,
    Column,
    String,
    DateTime,
    Text,
    Float,
    Boolean,
    ForeignKey,
    Integer,
)
from sqlalchemy.orm import relationship
from models.base import Base

class User(Base):
    __tablename__ = 'user'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), nullable=False, unique=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    password = Column(String(128), nullable=False)
    rfid_token = Column(String(128), nullable=True, unique=True)
    email = Column(String(120), nullable=True, unique=True)
    permission_scope = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    phone_number = Column(String(256), nullable=True)
    language = Column(String(10), nullable=True)
    is_deleted = Column(Boolean, default=False)

    # Method to set password securely
    def set_password(self, plaintext_password):
        hashed_pw = bcrypt.hashpw(
            plaintext_password.encode('utf-8'),
            bcrypt.gensalt()
        )
        self.password = hashed_pw.decode('utf-8')

    # Method to verify password securely
    def verify_password(self, plaintext_password):
        return bcrypt.checkpw(
            plaintext_password.encode('utf-8'),
            self.password.encode('utf-8')
        )

    @property
    def is_admin(self):
        scopes= self.permission_scope.split(",")
        return any(scope in ["admin", "superuser"] for scope in scopes)


class Customer(Base):
    __tablename__ = "customer"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    email_address = Column(String(120), nullable=True)
    company_name = Column(String(120), nullable=False)
    full_name = Column(String(120), nullable=False)  # for person
    phone_number = Column(String(50), nullable=False)
    full_address = Column(Text, nullable=False)
    business_cards = Column(Text, nullable=True)  # URL(s) or file path(s)
    notes = Column(Text, nullable=True)
    category = Column(String(120), nullable=False)  # e.g., roastery, cafe, etc.
    coordinates = Column(Geometry("POINT", srid=4326), nullable=True)
    is_deleted = Column(Boolean, default=False)

    # relations
    orders = relationship("CustomerOrder", back_populates="customer")
    debit_note_items = relationship("DebitNoteItem", back_populates="customer")
    credit_note_items = relationship("CreditNoteItem", back_populates="customer")
    trip_stops = relationship("TripStop", back_populates="customer")

    def _calculate_balance_per_currency(self, currency):
        order_total = 0
        for order in self.orders:
            if order.is_deleted:
                continue
            invoices = order.invoices
            for invoice in invoices:
                if not invoice.is_deleted and invoice.currency == currency:
                    order_total += invoice.net_amount_due

        debit_note_total = 0
        for dni in self.debit_note_items:
            if not dni.is_deleted and dni.currency == currency:
                debit_note_total += dni.amount_due

        credit_note_total = 0
        for cni in self.credit_note_items:
            if not cni.is_deleted and cni.currency == currency:
                credit_note_total += cni.amount_due

        return order_total + debit_note_total - credit_note_total
    @property
    def balance_per_currency(self) -> dict[str, float]:
        currencies = ["USD", "SYP"]
        return {currency: self._calculate_balance_per_currency(currency) for currency in currencies}



    def __repr__(self):
        return (
            f"<Customer(uuid={self.uuid}, email_address={self.email_address}, "
            f"full_name={self.full_name}, category={self.category})>"
        )


class CustomerOrder(Base):
    __tablename__ = "customer_order"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    customer_uuid = Column(String(36), ForeignKey("customer.uuid"), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_deleted = Column(Boolean, default=False)
    trip_stop_uuid = Column(String(36), ForeignKey("trip_stop.uuid"), nullable=True)

    # relations
    customer_order_items = relationship("CustomerOrderItem", back_populates="customer_order")
    invoices = relationship("Invoice", back_populates="customer_order")
    customer = relationship("Customer", back_populates="orders")
    trip_stop = relationship("TripStop", back_populates="customer_orders")

    @hybrid_property
    def is_fulfilled(self):
        # all non-deleted items have a fulfilled_at timestamp
        return all(
            item.fulfilled_at is not None
            for item in self.customer_order_items
            if not item.is_deleted
        )

    @is_fulfilled.expression
    def is_fulfilled(cls):
        # true if no non-deleted item is lacking fulfilled_at
        return ~exists(
            select(1).where(
                CustomerOrderItem.customer_order_uuid == cls.uuid,
                CustomerOrderItem.is_deleted.is_(False),
                CustomerOrderItem.fulfilled_at.is_(None)
            )
        )

    @hybrid_property
    def fulfilled_at(self):
        if not self.is_fulfilled:
            return None
        dates = [
            item.fulfilled_at
            for item in self.customer_order_items
            if item.fulfilled_at is not None and not item.is_deleted
        ]
        return max(dates) if dates else None

    @fulfilled_at.expression
    def fulfilled_at(cls):
        # latest fulfilled_at among non-deleted items
        return (
            select(func.max(CustomerOrderItem.fulfilled_at))
            .where(
                CustomerOrderItem.customer_order_uuid == cls.uuid,
                CustomerOrderItem.is_deleted.is_(False),
                CustomerOrderItem.fulfilled_at.isnot(None)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def is_paid(self):
        return all(
            inv.is_paid
            for inv in self.invoices
            if not inv.is_deleted
        )

    @is_paid.expression
    def is_paid(cls):
        # true if no non-deleted invoice is unpaid
        return ~exists(
            select(1).where(
                Invoice.customer_order_uuid == cls.uuid,
                Invoice.is_deleted.is_(False),
                Invoice.is_paid.is_(False)
            )
        )

    @hybrid_property
    def is_overdue(self):
        return any(
            inv.is_overdue
            for inv in self.invoices
            if not inv.is_deleted
        )

    @is_overdue.expression
    def is_overdue(cls):
        # true if exists a non-deleted, overdue invoice
        return exists(
            select(1).where(
                Invoice.customer_order_uuid == cls.uuid,
                Invoice.is_deleted.is_(False),
                Invoice.is_overdue.is_(True)
            )
        )

    @hybrid_property
    def total_adjusted_amount(self):
        return sum(
            inv.total_adjusted_amount
            for inv in self.invoices
            if not inv.is_deleted
        )

    @total_adjusted_amount.expression
    def total_adjusted_amount(cls):
        # sum of all invoices' adjusted amounts
        return (
            select(func.coalesce(func.sum(Invoice.total_adjusted_amount), 0))
            .where(
                Invoice.customer_order_uuid == cls.uuid,
                Invoice.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def net_amount_due(self):
        return sum(
            inv.net_amount_due
            for inv in self.invoices
            if not inv.is_deleted
        )

    @net_amount_due.expression
    def net_amount_due(cls):
        # sum of net due across invoices
        return (
            select(func.coalesce(func.sum(Invoice.net_amount_due), 0))
            .where(
                Invoice.customer_order_uuid == cls.uuid,
                Invoice.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def net_amount_paid(self):
        return sum(
            inv.net_amount_paid
            for inv in self.invoices
            if not inv.is_deleted
        )

    @net_amount_paid.expression
    def net_amount_paid(cls):
        # sum of net paid across invoices
        return (
            select(func.coalesce(func.sum(Invoice.net_amount_paid), 0))
            .where(
                Invoice.customer_order_uuid == cls.uuid,
                Invoice.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

class CustomerOrderItem(Base):
    __tablename__ = "customer_order_item"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    customer_order_uuid = Column(String(36), ForeignKey("customer_order.uuid"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit = Column(String(120), nullable=False)
    material_uuid = Column(String(36), ForeignKey("material.uuid"), nullable=False)
    is_fulfilled = Column(Boolean, default=False)
    fulfilled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_deleted = Column(Boolean, default=False)

    # relations
    customer_order = relationship("CustomerOrder", back_populates="customer_order_items")
    material = relationship("Material", back_populates="customer_order_items")
    invoice_item = relationship("InvoiceItem", back_populates="customer_order_item", uselist=False)
    inventory_events = relationship("InventoryEvent", back_populates="customer_order_item")
    debit_note_items = relationship("DebitNoteItem", back_populates="customer_order_item")
    credit_note_items = relationship("CreditNoteItem", back_populates="customer_order_item")

    def __repr__(self):
        return (
            f"<CustomerOrderItem(uuid={self.uuid}, material_name={self.material.name}, "
            f"quantity={self.quantity})>"
        )

# ------------------------------
# Invoice & Payment Models
# ------------------------------

class Invoice(Base):
    __tablename__ = "invoice"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    customer_uuid = Column(String(36), ForeignKey("customer.uuid"), nullable=False)
    customer_order_uuid = Column(String(36), ForeignKey("customer_order.uuid"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    currency = Column(String(120), nullable=False)
    # status = Column(String(120), nullable=False)  # e.g., void, pending, paid, etc.
    # paid_at = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)

    # relations
    customer_order = relationship("CustomerOrder", back_populates="invoices")
    invoice_items = relationship("InvoiceItem", back_populates="invoice")
    payments = relationship("Payment", back_populates="invoice")

    @hybrid_property
    def paid_at(self):
        if self.status != "paid":
            return None
        return max(
            payment.created_at
            for payment in self.payments
            if not payment.is_deleted
        )

    @paid_at.expression
    def paid_at(cls):
        return (
            select(func.max(Payment.created_at))
            .where(
                Payment.invoice_uuid == cls.uuid,
                Payment.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def total_amount(self):
        return sum(
            item.total_price
            for item in self.invoice_items
            if not item.is_deleted
        )

    @total_amount.expression
    def total_amount(cls):
        return (
            select(func.coalesce(func.sum(InvoiceItem.total_price), 0))
            .where(
                InvoiceItem.invoice_uuid == cls.uuid,
                InvoiceItem.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def total_adjusted_amount(self):
        debit = sum(
            dni.amount
            for item in self.invoice_items
            for dni in item.debit_note_items
            if not dni.is_deleted
        )
        credit = sum(
            cni.amount
            for item in self.invoice_items
            for cni in item.credit_note_items
            if not cni.is_deleted
        )
        return self.total_amount + debit - credit

    @total_adjusted_amount.expression
    def total_adjusted_amount(cls):
        debit_sum = (
            select(func.coalesce(func.sum(DebitNoteItem.amount), 0))
            .select_from(InvoiceItem)
            .join(DebitNoteItem, DebitNoteItem.invoice_item_uuid == InvoiceItem.uuid)
            .where(
                InvoiceItem.invoice_uuid == cls.uuid,
                InvoiceItem.is_deleted.is_(False),
                DebitNoteItem.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        credit_sum = (
            select(func.coalesce(func.sum(CreditNoteItem.amount), 0))
            .select_from(InvoiceItem)
            .join(CreditNoteItem, CreditNoteItem.invoice_item_uuid == InvoiceItem.uuid)
            .where(
                InvoiceItem.invoice_uuid == cls.uuid,
                InvoiceItem.is_deleted.is_(False),
                CreditNoteItem.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        return cls.total_amount + debit_sum - credit_sum

    @hybrid_property
    def net_amount_paid(self):
        direct = sum(
            payment.amount
            for payment in self.payments
            if not payment.is_deleted
        )
        payouts = sum(
            payout.amount
            for item in self.invoice_items
            for cni in item.credit_note_items
            for payout in cni.payouts
            if not (item.is_deleted or cni.is_deleted or payout.is_deleted)
        )
        debit_pay = sum(
            payment.amount
            for item in self.invoice_items
            for dni in item.debit_note_items
            for payment in dni.payments
            if not (item.is_deleted or dni.is_deleted or payment.is_deleted)
        )
        return direct - payouts + debit_pay

    @net_amount_paid.expression
    def net_amount_paid(cls):
        payment_sum = (
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(
                Payment.invoice_uuid == cls.uuid,
                Payment.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        payouts_sum = (
            select(func.coalesce(func.sum(Payout.amount), 0))
            .select_from(InvoiceItem)
            .join(CreditNoteItem, CreditNoteItem.invoice_item_uuid == InvoiceItem.uuid)
            .join(Payout, Payout.credit_note_item_uuid == CreditNoteItem.uuid)
            .where(
                InvoiceItem.invoice_uuid == cls.uuid,
                InvoiceItem.is_deleted.is_(False),
                CreditNoteItem.is_deleted.is_(False),
                Payout.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        debit_pay_sum = (
            select(func.coalesce(func.sum(Payment.amount), 0))
            .select_from(InvoiceItem)
            .join(DebitNoteItem, DebitNoteItem.invoice_item_uuid == InvoiceItem.uuid)
            .join(Payment, Payment.debit_note_item_uuid == DebitNoteItem.uuid)
            .where(
                InvoiceItem.invoice_uuid == cls.uuid,
                InvoiceItem.is_deleted.is_(False),
                DebitNoteItem.is_deleted.is_(False),
                Payment.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        return payment_sum - payouts_sum + debit_pay_sum

    @hybrid_property
    def net_amount_due(self):
        return self.total_adjusted_amount - self.net_amount_paid

    @net_amount_due.expression
    def net_amount_due(cls):
        return cls.total_adjusted_amount - cls.net_amount_paid

    @hybrid_property
    def is_paid(self):
        return self.net_amount_due == 0

    @is_paid.expression
    def is_paid(cls):
        return cls.net_amount_due == literal(0)

    @hybrid_property
    def status(self):
        if self.is_deleted:
            return "void"
        if self.is_paid:
            return "paid"
        return "pending"

    @status.expression
    def status(cls):
        return case(
            [
                (cls.is_deleted, literal("void")),
                (cls.is_paid,    literal("paid")),
            ],
            else_=literal("pending")
        )

    @hybrid_property
    def is_overdue(self) -> bool:
        if self.is_paid or not self.due_date:
            return False
        due = (
            self.due_date
            if self.due_date.tzinfo is not None
            else self.due_date.replace(tzinfo=timezone.utc)
        )
        return due < datetime.now(timezone.utc)

    @is_overdue.expression
    def is_overdue(cls):
        return and_(
            cls.due_date.isnot(None),
            cls.is_paid == false(),
            cls.due_date < func.now()
        )
    def __repr__(self):
        return (
            f"<Invoice(uuid={self.uuid}, total_amount={self.total_amount}, "
            f"is_paid={self.is_paid}, paid_at={self.paid_at})>"
        )


class InvoiceItem(Base):
    __tablename__ = "invoice_item"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    invoice_uuid = Column(String(36), ForeignKey("invoice.uuid"), nullable=False)
    customer_order_item_uuid = Column(String(36), ForeignKey("customer_order_item.uuid"), nullable=False)
    price_per_unit = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    unit = Column(String(120), nullable=False)  # should be same as material unit
    is_deleted = Column(Boolean, default=False)

    # relations
    invoice = relationship("Invoice", back_populates="invoice_items")
    customer_order_item = relationship("CustomerOrderItem", back_populates="invoice_item")
    debit_note_items = relationship("DebitNoteItem", back_populates="invoice_item")
    credit_note_items = relationship("CreditNoteItem", back_populates="invoice_item")


    @hybrid_property
    def quantity(self):
        return self.customer_order_item.quantity

    @quantity.expression
    def quantity(cls):
        return (
            select(CustomerOrderItem.quantity)
            .where(CustomerOrderItem.uuid == cls.customer_order_item_uuid)
            .scalar_subquery()
        )

    @hybrid_property
    def total_price(self):
        return self.price_per_unit * self.quantity

    @total_price.expression
    def total_price(cls):
        return cls.price_per_unit * cls.quantity

    @hybrid_property
    def currency(self):
        return self.invoice.currency

    @currency.expression
    def currency(cls):
        return (
            select(Invoice.currency)
            .where(Invoice.uuid == cls.invoice_uuid)
            .scalar_subquery()
        )

    @hybrid_property
    def material_uuid(self):
        return self.customer_order_item.material_uuid

    @material_uuid.expression
    def material_uuid(cls):
        return (
            select(CustomerOrderItem.material_uuid)
            .where(CustomerOrderItem.uuid == cls.customer_order_item_uuid)
            .scalar_subquery()
        )

    @hybrid_property
    def material_name(self):
        return self.customer_order_item.material.name

    @material_name.expression
    def material_name(cls):
        return (
            select(Material.name)
            .join(CustomerOrderItem, CustomerOrderItem.material_uuid == Material.uuid)
            .where(CustomerOrderItem.uuid == cls.customer_order_item_uuid)
            .scalar_subquery()
        )


    def __repr__(self):
        return (
            f"<InvoiceItem(uuid={self.uuid}, material_name={self.material_name}, "
            f"quantity={self.quantity}, price_per_unit={self.price_per_unit}, total_price={self.total_price})>"
        )


class Payment(Base):
    __tablename__ = "payment"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    invoice_uuid = Column(String(36), ForeignKey("invoice.uuid"), nullable=True)
    financial_account_uuid = Column(String(36), ForeignKey("financial_account.uuid"), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    payment_method = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
    debit_note_item_uuid = Column(String(36), ForeignKey("debit_note_item.uuid"), nullable=True)
    is_deleted  = Column(Boolean, default=False)

    # relations
    invoice = relationship("Invoice", back_populates="payments")
    financial_account = relationship("FinancialAccount", back_populates="payments")
    debit_note_item = relationship("DebitNoteItem", back_populates="payments")

    def __repr__(self):
        return (
            f"<Payment(uuid={self.uuid}, amount={self.amount}, "
            f"payment_method={self.payment_method}, created_at={self.created_at})>"
        )


# ------------------------------
# Financial & Transaction Models
# ------------------------------

class FinancialAccount(Base):
    __tablename__ = "financial_account"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    account_name = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    # balance = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)

    # relations
    payments = relationship("Payment", back_populates="financial_account")
    payouts = relationship("Payout", back_populates="financial_account")
    transactions_from = relationship("Transaction", foreign_keys="Transaction.from_account_uuid", back_populates="from_account")
    transactions_to = relationship("Transaction", foreign_keys="Transaction.to_account_uuid", back_populates="to_account")

    @property
    def balance(self):
        transactions_in = sum(
            transaction.to_amount
            for transaction in self.transactions_to
            if not transaction.is_deleted
        )

        transactions_out = sum(
            transaction.from_amount
            for transaction in self.transactions_from
            if not transaction.is_deleted
        )

        payments = sum(
            payment.amount
            for payment in self.payments
            if not payment.is_deleted
        )

        payouts = sum(
            payout.amount
            for payout in self.payouts
            if not payout.is_deleted
        )

        return transactions_in - transactions_out + payments - payouts

    def __repr__(self):
        return f"<FinancialAccount(uuid={self.uuid}, account_name={self.account_name}, balance={self.balance})>"


class Transaction(Base):
    __tablename__ = "transaction"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    from_amount = Column(Float, nullable=True)
    from_currency = Column(String(120), nullable=True)
    from_account_uuid = Column(String(36), ForeignKey("financial_account.uuid"), nullable=True)
    to_account_uuid = Column(String(36), ForeignKey("financial_account.uuid"), nullable=True)
    to_amount = Column(Float, nullable=True)
    to_currency = Column(String(120), nullable=True)
    usd_to_syp_exchange_rate = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)

    # relations
    from_account = relationship("FinancialAccount", foreign_keys=[from_account_uuid], back_populates="transactions_from")
    to_account = relationship("FinancialAccount", foreign_keys=[to_account_uuid], back_populates="transactions_to")

    def __repr__(self):
        return f"<Transaction(uuid={self.uuid}, amount={self.amount}, created_at={self.created_at})>"

# ------------------------------
# Vendor, Material & Pricing Models
# ------------------------------

class Vendor(Base):
    __tablename__ = "vendor"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    email_address = Column(String(120), nullable=True, unique=True)
    company_name = Column(String(120), nullable=False)
    full_name = Column(String(120), nullable=False)
    phone_number = Column(String(50), nullable=False)
    full_address = Column(Text, nullable=True)
    business_cards = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    category = Column(String(120), nullable=True)
    coordinates = Column(Geometry("POINT", srid=4326), nullable=True)
    is_deleted = Column(Boolean, default=False)

    # relations
    purchase_orders = relationship("PurchaseOrder", back_populates="vendor")
    expenses = relationship("Expense", back_populates="vendor")
    debit_note_items = relationship("DebitNoteItem", back_populates="vendor")
    credit_note_items = relationship("CreditNoteItem", back_populates="vendor")

    def _calculate_balance_per_currency(self, currency):
        po_total = 0
        for po in self.purchase_orders:
            if not po.is_deleted and po.currency == currency:
                po_total += po.net_amount_due

        debit_note_total = 0
        for dni in self.debit_note_items:
            if not dni.is_deleted and dni.currency == currency:
                debit_note_total += dni.amount_due

        credit_note_total = 0
        for cni in self.credit_note_items:
            if not cni.is_deleted and cni.currency == currency:
                credit_note_total += cni.amount_due
        res = credit_note_total - po_total - debit_note_total
        return res
    @property
    def balance_per_currency(self) -> dict[str, float]:
        currencies = ["USD", "SYP"]
        res = {currency: self._calculate_balance_per_currency(currency) for currency in currencies}
        return res

    def __repr__(self):
        return (
            f"<Vendor(uuid={self.uuid}, email_address={self.email_address}, "
            f"full_name={self.full_name}, category={self.category})>"
        )


class Material(Base):
    __tablename__ = "material"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    name = Column(String(120), nullable=False)
    measure_unit = Column(String(120), nullable=True)  # e.g., kg, liters, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    sku = Column(String(120), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    type = Column(String(120), nullable=False)  # e.g., raw_material, product, interim
    is_deleted = Column(Boolean, default=False)

    # relations
    pricing = relationship("Pricing", back_populates="material", uselist=False)
    customer_order_items = relationship("CustomerOrderItem", back_populates="material")
    inventory = relationship("Inventory", back_populates="material")
    purchase_order_items = relationship("PurchaseOrderItem", back_populates="material")
    fixed_assets = relationship("FixedAsset", back_populates="material")
    inventory_events = relationship("InventoryEvent", back_populates="material")

    def __repr__(self):
        return f"<Material(uuid={self.uuid}, name={self.name})>"


class Pricing(Base):
    __tablename__ = "pricing"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    material_uuid = Column(String(36), ForeignKey("material.uuid"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    price_per_unit = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    is_deleted = Column(Boolean, default=False)

    # relations
    material = relationship("Material", back_populates="pricing")

    @property
    def unit(self):
        return self.material.measure_unit

    def __repr__(self):
        return (
            f"<Pricing(uuid={self.uuid}, material_name={self.material.name}, "
            f"price_per_unit={self.price_per_unit}, currency={self.currency})>"
        )


# ------------------------------
# Purchase & Expense Models
# ------------------------------

class PurchaseOrder(Base):
    __tablename__ = "purchase_order"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    vendor_uuid = Column(String(36), ForeignKey("vendor.uuid"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    currency = Column(String(120), nullable=False)
    is_deleted = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    payout_due_date = Column(DateTime, nullable=True)
    vendor = relationship("Vendor", back_populates="purchase_orders")
    purchase_order_items = relationship("PurchaseOrderItem", back_populates="purchase_order")
    payouts = relationship("Payout", back_populates="purchase_order")

    @hybrid_property
    def vendor_name(self):
        return self.vendor.company_name if self.vendor else None


    @hybrid_property
    def total_amount(self):
        return sum(
            item.total_price
            for item in self.purchase_order_items
            if not item.is_deleted
        )

    @total_amount.expression
    def total_amount(cls):
        return (
            select(func.coalesce(func.sum(PurchaseOrderItem.total_price), 0))
            .where(
                PurchaseOrderItem.purchase_order_uuid == cls.uuid,
                PurchaseOrderItem.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def total_adjusted_amount(self):
        return sum(
            item.adjusted_total_price
            for item in self.purchase_order_items
            if not item.is_deleted
        )

    @total_adjusted_amount.expression
    def total_adjusted_amount(cls):
        return (
            select(func.coalesce(func.sum(PurchaseOrderItem.adjusted_total_price), 0))
            .where(
                PurchaseOrderItem.purchase_order_uuid == cls.uuid,
                PurchaseOrderItem.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def net_amount_paid(self):
        return sum(
            payout.amount
            for payout in self.payouts
            if not payout.is_deleted
        )

    @net_amount_paid.expression
    def net_amount_paid(cls):
        return (
            select(func.coalesce(func.sum(Payout.amount), 0))
            .where(
                Payout.purchase_order_uuid == cls.uuid,
                Payout.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def net_amount_due(self):
        return self.total_adjusted_amount - self.net_amount_paid

    @net_amount_due.expression
    def net_amount_due(cls):
        return cls.total_adjusted_amount - cls.net_amount_paid

    @hybrid_property
    def is_paid(self):
        return self.net_amount_due == 0

    @is_paid.expression
    def is_paid(cls):
        return cls.net_amount_due == literal(0)

    @hybrid_property
    def status(self):
        if self.is_deleted:
            return "void"
        if self.is_paid:
            return "paid"
        return "pending"

    @status.expression
    def status(cls):
        return case(
            (cls.is_deleted, literal("void")),
            (cls.is_paid,    literal("paid")),
            else_=literal("pending")
        )

    @hybrid_property
    def is_overdue(self):
        due = (
            self.payout_due_date
            if self.payout_due_date.tzinfo is not None
            else self.payout_due_date.replace(tzinfo=timezone.utc)
        )
        return (
                not self.is_paid
                and self.payout_due_date is not None
                and due < datetime.now(timezone.utc)
        )

    @is_overdue.expression
    def is_overdue(cls):
        return and_(
            cls.payout_due_date.isnot(None),
            cls.payout_due_date < func.now(),
            cls.is_paid == literal(False)
        )

    @hybrid_property
    def is_fulfilled(self):
        return all(
            item.is_fulfilled
            for item in self.purchase_order_items
            if not item.is_deleted
        )

    @is_fulfilled.expression
    def is_fulfilled(cls):
        return ~exists(
            select(1)
            .where(
                PurchaseOrderItem.purchase_order_uuid == cls.uuid,
                PurchaseOrderItem.is_deleted.is_(False),
                PurchaseOrderItem.is_fulfilled.is_(False)
            )
        )

    @hybrid_property
    def fulfilled_at(self):
        if not self.is_fulfilled:
            return None
        times = (
            item.fulfilled_at
            for item in self.purchase_order_items
            if not item.is_deleted and item.fulfilled_at is not None
        )
        return max(times, default=None)

    @fulfilled_at.expression
    def fulfilled_at(cls):
        return (
            select(func.max(PurchaseOrderItem.fulfilled_at))
            .where(
                PurchaseOrderItem.purchase_order_uuid == cls.uuid,
                PurchaseOrderItem.is_deleted.is_(False),
                PurchaseOrderItem.fulfilled_at.isnot(None)
            )
            .scalar_subquery()
        )


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_item"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    purchase_order_uuid = Column(String(36), ForeignKey("purchase_order.uuid"), nullable=False)
    quantity = Column(Integer, nullable=False)
    price_per_unit = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    unit = Column(String(120), nullable=False)  # should be same as material unit
    material_uuid = Column(String(36), ForeignKey("material.uuid"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_fulfilled = Column(Boolean, default=False)
    fulfilled_at = Column(DateTime, nullable=True)
    quantity_received = Column(Float, nullable=False, default=0.0)
    is_deleted = Column(Boolean, default=False)

    # relations
    purchase_order = relationship("PurchaseOrder", back_populates="purchase_order_items")
    material = relationship("Material", back_populates="purchase_order_items")
    fixed_asset = relationship("FixedAsset", back_populates="purchase_order_item", uselist=False)
    debit_note_items = relationship("DebitNoteItem", back_populates="purchase_order_item")
    credit_note_items = relationship("CreditNoteItem", back_populates="purchase_order_item")
    inventory_events = relationship("InventoryEvent", back_populates="purchase_order_item")

    @hybrid_property
    def material_name(self):
        return self.material.name

    @hybrid_property
    def total_price(self):
        return self.quantity * self.price_per_unit

    @total_price.expression
    def total_price(cls):
        return cls.quantity * cls.price_per_unit

    @hybrid_property
    def adjusted_quantity(self):
        debit_note_change = 0
        credit_note_change = 0
        for item in self.debit_note_items:
            if not item.is_deleted:
                debit_note_change += item.inventory_change
        for item in self.credit_note_items:
            if not item.is_deleted:
                credit_note_change += item.inventory_change
        return self.quantity + debit_note_change + credit_note_change

    @adjusted_quantity.expression
    def adjusted_quantity(cls):
        debit_sum = (
            select(func.coalesce(func.sum(DebitNoteItem.inventory_change), 0))
            .where(
                DebitNoteItem.purchase_order_item_uuid == cls.uuid,
                DebitNoteItem.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        credit_sum = (
            select(func.coalesce(func.sum(CreditNoteItem.inventory_change), 0))
            .where(
                CreditNoteItem.purchase_order_item_uuid == cls.uuid,
                CreditNoteItem.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        return cls.quantity + debit_sum + credit_sum

    @hybrid_property
    def adjusted_total_price(self):
        total_debit_note_price = 0
        total_credit_note_price = 0
        for item in self.debit_note_items:
            if not item.is_deleted:
                total_debit_note_price += item.amount
        for item in self.credit_note_items:
            if not item.is_deleted:
                total_credit_note_price += item.amount
        return self.total_price + total_debit_note_price - total_credit_note_price

    @adjusted_total_price.expression
    def adjusted_total_price(cls):
        debit_price_sum = (
            select(func.coalesce(func.sum(DebitNoteItem.amount), 0))
            .where(
                DebitNoteItem.purchase_order_item_uuid == cls.uuid,
                DebitNoteItem.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        credit_price_sum = (
            select(func.coalesce(func.sum(CreditNoteItem.amount), 0))
            .where(
                CreditNoteItem.purchase_order_item_uuid == cls.uuid,
                CreditNoteItem.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        return cls.total_price + debit_price_sum - credit_price_sum

    @hybrid_property
    def adjusted_price_per_unit(self):
        if self.adjusted_quantity == 0:
            return 0
        return self.adjusted_total_price / self.adjusted_quantity

    @adjusted_price_per_unit.expression
    def adjusted_price_per_unit(cls):
        return case(
            [(cls.adjusted_quantity == 0, literal(0))],
            else_=cls.adjusted_total_price / cls.adjusted_quantity
        )
    def __repr__(self):
        return (
            f"<PurchaseOrderItem(uuid={self.uuid}, material_name={self.material.name}, "
            f"quantity={self.quantity}, price_per_unit={self.price_per_unit}, total_price={self.total_price})>"
        )


class Payout(Base):
    __tablename__ = "payout"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    purchase_order_uuid = Column(String(36), ForeignKey("purchase_order.uuid"), nullable=True)
    expense_uuid = Column(String(36), ForeignKey("expense.uuid"), nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    financial_account_uuid = Column(String(36), ForeignKey("financial_account.uuid"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
    employee_uuid = Column(String(36), ForeignKey("employee.uuid"), nullable=True)
    credit_note_item_uuid = Column(String(36), ForeignKey("credit_note_item.uuid"), nullable=True)
    is_deleted = Column(Boolean, default=False)

    # relations
    financial_account = relationship("FinancialAccount", back_populates="payouts")
    purchase_order = relationship("PurchaseOrder", back_populates="payouts")
    expense = relationship("Expense", back_populates="payouts")
    employee = relationship("Employee", back_populates="payouts")
    credit_note_item = relationship("CreditNoteItem", back_populates="payouts")

    def __repr__(self):
        return f"<Payout(uuid={self.uuid}, amount={self.amount}, currency={self.currency})>"


class Expense(Base):
    __tablename__ = "expense"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    vendor_uuid = Column(String(36), ForeignKey("vendor.uuid"), nullable=True)
    category = Column(String(120), nullable=False)  # e.g., salary, etc.
    is_deleted = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    # status = Column(String(120), nullable=False)  # e.g., void, pending, paid, etc.


    # relations
    vendor = relationship("Vendor", back_populates="expenses")
    payouts = relationship("Payout", back_populates="expense")

    @hybrid_property
    def amount_paid(self):
        return sum(
            payout.amount
            for payout in self.payouts
            if not payout.is_deleted
        )

    @amount_paid.expression
    def amount_paid(cls):
        return (
            select(func.coalesce(func.sum(Payout.amount), 0))
            .where(
                Payout.expense_uuid == cls.uuid,
                Payout.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def amount_due(self):
        return self.amount - self.amount_paid

    @amount_due.expression
    def amount_due(cls):
        return cls.amount - cls.amount_paid

    @hybrid_property
    def is_paid(self):
        return self.amount_due == 0

    @is_paid.expression
    def is_paid(cls):
        return cls.amount_due == literal(0)

    @hybrid_property
    def status(self):
        if self.is_deleted:
            return "void"
        if self.is_paid:
            return "paid"
        return "pending"

    @status.expression
    def status(cls):
        # void if deleted, paid if zero due, else pending
        return case(
            (cls.is_deleted, literal("void")),
            (cls.is_paid,    literal("paid")),
            else_=literal("pending")
        )

    @hybrid_property
    def paid_at(self):
        if not self.is_paid:
            return None
        times = (
            payout.created_at
            for payout in self.payouts
            if not payout.is_deleted
        )
        return max(times, default=None)
    @paid_at.expression
    def paid_at(cls):
        return (
            select(func.max(Payout.created_at))
            .where(
                Payout.expense_uuid == cls.uuid,
                Payout.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

class Employee(Base):
    __tablename__ = "employee"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    email_address = Column(String(120), nullable=True, unique=True)
    full_name = Column(String(120), nullable=False)
    phone_number = Column(String(50), nullable=False)
    full_address = Column(Text, nullable=True)
    identification = Column(Text, nullable=True)  # URL(s) or file path(s)
    notes = Column(Text, nullable=True)
    role = Column(String(120), nullable=True)
    is_deleted = Column(Boolean, default=False)
    image = Column(Text, nullable=True)  # URL(s) or file path(s)

    # relations
    payouts = relationship("Payout", back_populates="employee")


# ------------------------------
# Fixed Assets, Batch, Inventory, Warehouse & Related Events
# ------------------------------

class FixedAsset(Base):
    __tablename__ = "fixed_asset"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    purchase_date = Column(DateTime, nullable=False,default=datetime.utcnow)
    annual_depreciation_rate = Column(Float, nullable=False)  # in percentage
    purchase_order_item_uuid = Column(String(36), ForeignKey("purchase_order_item.uuid"), nullable=True)
    is_deleted = Column(Boolean, default=False)
    material_uuid = Column(String(36), ForeignKey("material.uuid"), nullable=False)
    quantity = Column(Float, nullable=False)
    price_per_unit = Column(Float, nullable=False)

    # relations
    purchase_order_item = relationship("PurchaseOrderItem", back_populates="fixed_asset")
    material = relationship("Material", back_populates="fixed_assets")

    @property
    def current_value(self):
        # Calculate the current value based on the purchase date and annual depreciation rate
        years = (datetime.utcnow() - self.purchase_date).days / 365.25
        depreciation = (self.annual_depreciation_rate / 100) * years
        return (self.price_per_unit * self.quantity) * (1 - depreciation)

    def __repr__(self):
        return (
            f"<FixedAsset(uuid={self.uuid}, name={self.name}, current_value={self.current_value}, "
            f"annual_depreciation_rate={self.annual_depreciation_rate})>"
        )

    @property
    def unit(self):
        return self.material.measure_unit
    @property
    def total_price(self):
        return self.price_per_unit * self.quantity


class Process(Base):
    __tablename__ = "process"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    type = Column(String(120), nullable=False)  # e.g., powder_preparation, coated_peanuts
    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)
    data = Column(MutableDict.as_mutable(JSONB), default=dict)
    workflow_execution_uuid = Column(String(36), ForeignKey("workflow_execution.uuid"), nullable=True)

    # relations
    inventory_events = relationship("InventoryEvent", back_populates="process")
    workflow_execution = relationship("WorkflowExecution", back_populates="processes")
    quality_control = relationship("QualityControl", back_populates="process", uselist=False)



class Warehouse(Base):
    __tablename__ = "warehouse"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    name = Column(String(120), nullable=False, unique=True)
    address = Column(Text, nullable=False)
    coordinates = Column(Geometry("POINT", srid=4326), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)

    # relations
    inventories = relationship("Inventory", back_populates="warehouse")

    def __repr__(self):
        return f"<Warehouse(uuid={self.uuid}, name={self.name}, location={self.location})>"


class Inventory(Base):
    __tablename__ = "inventory"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    material_uuid = Column(String(36), ForeignKey("material.uuid"))
    warehouse_uuid = Column(String(36), ForeignKey("warehouse.uuid"), nullable=False)
    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)
    lot_id = Column(String(120), nullable=False, unique=True)
    expiration_date = Column(DateTime, nullable=True)  # for perishable items
    _cached_cost_per_unit = Column(Float, nullable=True)
    unit = Column(String(120), nullable=False)  # should be same as material unit
    _cached_current_quantity = Column(Float, nullable=True) # only for caching
    _cached_original_quantity = Column(Float, nullable=True) # only for caching
    is_active = Column(Boolean, default=True)
    currency = Column(String(120), nullable=True)

    # relations
    material = relationship("Material", back_populates="inventory")
    warehouse = relationship("Warehouse", back_populates="inventories")
    inventory_events = relationship("InventoryEvent", back_populates="inventory")

    @property
    def total_original_cost(self):
        return self.original_quantity * self.cost_per_unit

    @property
    def original_quantity(self):
        events = [event for event in self.inventory_events if not event.is_deleted]
        if events:
            return sum([event.quantity for event in events if event.affect_original])
        return 0

    @property
    def current_quantity(self):
        events = [event for event in self.inventory_events if not event.is_deleted]
        if events:
            return self.original_quantity + sum([event.quantity for event in events if not event.affect_original])
        return 0

    def __repr__(self):
        return (
            f"<Inventory(uuid={self.uuid}, material_name={self.material.name}, "
            f"current_quantity={self.current_quantity}, unit={self.unit})>"
        )


class InventoryEvent(Base):
    __tablename__ = "inventory_event"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    inventory_uuid = Column(String(36), ForeignKey("inventory.uuid"), nullable=False)
    purchase_order_item_uuid = Column(String(36), ForeignKey("purchase_order_item.uuid"), nullable=True)
    process_uuid = Column(String(36), ForeignKey("process.uuid"), nullable=True)
    customer_order_item_uuid = Column(String(36), ForeignKey("customer_order_item.uuid"), nullable=True)
    event_type = Column(String(120), nullable=False)  # e.g., addition, removal, adjustment, transfer, etc.
    quantity = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
    debit_note_item_uuid = Column(String(36), ForeignKey("debit_note_item.uuid"), nullable=True)
    credit_note_item_uuid = Column(String(36), ForeignKey("credit_note_item.uuid"), nullable=True)
    material_uuid = Column(String(36), ForeignKey("material.uuid"), nullable=False)
    is_deleted = Column(Boolean, default=False)
    cost_per_unit = Column(Float, nullable=True)
    currency = Column(String(120), nullable=True)
    affect_original = Column(Boolean, default=False)  # whether to affect the original quantity or not

    # relations
    inventory = relationship("Inventory", back_populates="inventory_events")
    purchase_order_item = relationship("PurchaseOrderItem", back_populates="inventory_events")
    process = relationship("Process", back_populates="inventory_events")
    customer_order_item = relationship("CustomerOrderItem", back_populates="inventory_events")
    debit_note_item = relationship("DebitNoteItem", back_populates="inventory_events")
    credit_note_item = relationship("CreditNoteItem", back_populates="inventory_events")
    material = relationship("Material", back_populates="inventory_events")

    def __repr__(self):
        return (
            f"<InventoryEvent(uuid={self.uuid}, inventory_uuid={self.inventory_uuid}, "
            f"event_type={self.event_type}, quantity={self.quantity})>"
        )


# ------------------------------
# Debit & Credit Note Models
# ------------------------------

class DebitNoteItem(Base):
    __tablename__ = "debit_note_item"
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)

    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    notes = Column(Text, nullable=True)
    # status = Column(String(120), nullable=False)  # e.g., void, pending, paid
    # paid_at = Column(DateTime, nullable=True)
    invoice_item_uuid = Column(String(36), ForeignKey("invoice_item.uuid"), nullable=True)
    customer_order_item_uuid = Column(String(36), ForeignKey("customer_order_item.uuid"), nullable=True)
    customer_uuid = Column(String(36), ForeignKey("customer.uuid"), nullable=True)
    vendor_uuid = Column(String(36), ForeignKey("vendor.uuid"), nullable=True)
    purchase_order_item_uuid = Column(String(36), ForeignKey("purchase_order_item.uuid"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_deleted = Column(Boolean, default=False)
    inventory_change = Column(Float, nullable=True)  # positive or negative change in inventory

    # relations
    invoice_item = relationship("InvoiceItem", back_populates="debit_note_items")
    customer_order_item = relationship("CustomerOrderItem", back_populates="debit_note_items")
    purchase_order_item = relationship("PurchaseOrderItem", back_populates="debit_note_items")
    customer = relationship("Customer", back_populates="debit_note_items")
    vendor = relationship("Vendor", back_populates="debit_note_items")
    inventory_events = relationship("InventoryEvent", back_populates="debit_note_item")
    payments = relationship("Payment", back_populates="debit_note_item")

    @validates('amount')
    def _validate_amount(self, key, value):
        if value is None or value <= 0:
            raise ValueError(f"'{key}' must be positive, got {value!r}")
        return value


    @hybrid_property
    def amount_paid(self):
        return sum(
            p.amount for p in self.payments if not p.is_deleted
        )

    @amount_paid.expression
    def amount_paid(cls):
        return (
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(
                Payment.debit_note_item_uuid == cls.uuid,
                Payment.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def amount_due(self):
        return self.amount - self.amount_paid

    @amount_due.expression
    def amount_due(cls):
        return cls.amount - cls.amount_paid

    @hybrid_property
    def status(self):
        if self.is_deleted:
            return "void"
        if self.amount_due == 0:
            return "paid"
        return "pending"

    @status.expression
    def status(cls):
        return case(
            (cls.is_deleted, literal("void")),
            (cls.amount_due == 0, literal("paid")),
            else_=literal("pending")
        )

    @hybrid_property
    def paid_at(self):
        if self.amount_due != 0:
            return None
        payments = [p.created_at for p in self.payments if not p.is_deleted]
        return max(payments, default=None)

    @paid_at.expression
    def paid_at(cls):
        paid_subq = (
            select(func.max(Payment.created_at))
            .where(
                Payment.debit_note_item_uuid == cls.uuid,
                Payment.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        return case(
            (cls.amount_due == 0, paid_subq),
            else_=literal(None)
        )

    @hybrid_property
    def is_paid(self):
        return self.amount_due == 0
    @is_paid.expression
    def is_paid(cls):
        return cls.amount_due == literal(0)

    def __repr__(self):
        return f"<DebitNoteItem(uuid={self.uuid}, amount={self.amount}, status={self.status})>"


class CreditNoteItem(Base):
    __tablename__ = "credit_note_item"
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    notes = Column(Text, nullable=True)
    invoice_item_uuid = Column(String(36), ForeignKey("invoice_item.uuid"), nullable=True)
    customer_order_item_uuid = Column(String(36), ForeignKey("customer_order_item.uuid"), nullable=True)
    customer_uuid = Column(String(36), ForeignKey("customer.uuid"), nullable=True)
    vendor_uuid = Column(String(36), ForeignKey("vendor.uuid"), nullable=True)
    purchase_order_item_uuid = Column(String(36), ForeignKey("purchase_order_item.uuid"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_deleted = Column(Boolean, default=False)
    inventory_change = Column(Float, nullable=True)  # positive or negative change in inventory

    # relations
    invoice_item = relationship("InvoiceItem", back_populates="credit_note_items")
    customer_order_item = relationship("CustomerOrderItem", back_populates="credit_note_items")
    purchase_order_item = relationship("PurchaseOrderItem", back_populates="credit_note_items")
    inventory_events = relationship("InventoryEvent", back_populates="credit_note_item")
    customer = relationship("Customer", back_populates="credit_note_items")
    vendor = relationship("Vendor", back_populates="credit_note_items")
    payouts = relationship("Payout", back_populates="credit_note_item")

    @validates('amount')
    def _validate_amount(self, key, value):
        if value is None or value <= 0:
            raise ValueError(f"'{key}' must be positive, got {value!r}")
        return value


    @hybrid_property
    def amount_paid(self):
        return sum(
            p.amount for p in self.payouts if not p.is_deleted
        )

    @amount_paid.expression
    def amount_paid(cls):
        return (
            select(func.coalesce(func.sum(Payout.amount), 0))
            .where(
                Payout.credit_note_item_uuid == cls.uuid,
                Payment.is_deleted.is_(False)
            )
            .scalar_subquery()
        )

    @hybrid_property
    def amount_due(self):
        return self.amount - self.amount_paid

    @amount_due.expression
    def amount_due(cls):
        return cls.amount - cls.amount_paid

    @hybrid_property
    def status(self):
        if self.is_deleted:
            return "void"
        if self.amount_due == 0:
            return "paid"
        return "pending"

    @status.expression
    def status(cls):
        return case(
            (cls.is_deleted, literal("void")),
            (cls.amount_due == 0, literal("paid")),
            else_=literal("pending")
        )

    @hybrid_property
    def paid_at(self):
        if self.amount_due != 0:
            return None
        payouts = [p.created_at for p in self.payouts if not p.is_deleted]
        return max(payouts, default=None)

    @paid_at.expression
    def paid_at(cls):
        paid_subq = (
            select(func.max(Payout.created_at))
            .where(
                Payout.credit_note_item_uuid == cls.uuid,
                Payout.is_deleted.is_(False)
            )
            .scalar_subquery()
        )
        return case(
            (cls.amount_due == 0, paid_subq),
            else_=literal(None)
        )

    @hybrid_property
    def is_paid(self):
        return self.amount_due == 0
    @is_paid.expression
    def is_paid(cls):
        return cls.amount_due == literal(0)

class Workflow(Base):
    __tablename__ = "workflow"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    name = Column(String(120), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    description = Column(Text, nullable=True)
    tags = Column(ARRAY(String), nullable=True,default=list)
    is_deleted = Column(Boolean, default=False)
    parameters = Column(MutableDict.as_mutable(JSONB), default=dict)
    callback_fns = Column(ARRAY(String), nullable=True,default=list)

    # relations
    tasks = relationship("Task", back_populates="workflow")
    workflow_executions = relationship("WorkflowExecution", back_populates="workflow")


class Task(Base):
    __tablename__ = "task"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    workflow_uuid = Column(String(36), ForeignKey("workflow.uuid"), nullable=False)
    parent_task_uuid = Column(String(36), ForeignKey("task.uuid"), nullable=True)  # Self-referencing foreign key
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    operator = Column(String(120), nullable=False)
    task_inputs = Column(MutableDict.as_mutable(JSONB), default=dict)
    depends_on = Column(ARRAY(String), nullable=True, default=[])  # List of task names this task depends on
    callback_fns = Column(ARRAY(String), nullable=True, default=list)
    is_deleted = Column(Boolean, default=False)

    # Relations
    workflow = relationship("Workflow", back_populates="tasks")
    parent_task = relationship("Task", remote_side=[uuid])  # Remove backref here
    child_tasks = relationship("Task", back_populates="parent_task")  # Automatically creates the reverse relationship
    task_executions = relationship("TaskExecution", back_populates="task")

class WorkflowExecution(Base):
    __tablename__ = "workflow_execution"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    workflow_uuid = Column(String(36), ForeignKey("workflow.uuid"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(120), nullable=False)  # e.g. in_progress, completed, failed
    result = Column(MutableDict.as_mutable(JSONB), default=dict)
    parameters = Column(MutableDict.as_mutable(JSONB), default=dict)
    error_message = Column(Text, nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    # relations
    workflow = relationship("Workflow", back_populates="workflow_executions")
    task_executions = relationship("TaskExecution", back_populates="workflow_execution")
    processes = relationship("Process", back_populates="workflow_execution")
    trips = relationship("Trip", back_populates="workflow_execution")

    @hybrid_property
    def name(self):
        return self.workflow.name if self.workflow else None

    @name.expression
    def name(cls):
        return select(Workflow.name).where(Workflow.uuid == cls.workflow_uuid).scalar_subquery()

    @hybrid_property
    def tags(self):
        return self.workflow.tags if self.workflow else []

    @tags.expression
    def tags(cls):
        # build the scalar subquery…
        sq = (
            select(Workflow.tags)
            .where(Workflow.uuid == cls.workflow_uuid)
            .scalar_subquery()
        )
        # then cast it explicitly to Postgres ARRAY(String)
        return cast(sq, ARRAY(String))

    @hybrid_property
    def callback_fns(self):
        return self.workflow.callback_fns if self.workflow else []

class TaskExecution(Base):
    __tablename__ = "task_execution"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    completed_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    task_uuid = Column(String(36), ForeignKey("task.uuid"), nullable=True) # nullable for child tasks
    parent_task_execution_uuid = Column(String(36), ForeignKey("task_execution.uuid"), nullable=True)  # Parent TaskExecution if this is a child task
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(120), nullable=False)  # e.g., in_progress, completed, failed
    result = Column(MutableDict.as_mutable(JSONB), default=dict)
    error_message = Column(Text, nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    depends_on = Column(ARRAY(String), nullable=True, default=[])  # List of task_execution_uuids this execution depends on
    workflow_execution_uuid = Column(String(36), ForeignKey("workflow_execution.uuid"), nullable=False)

    # Relations
    task = relationship("Task", back_populates="task_executions")
    workflow_execution = relationship("WorkflowExecution", back_populates="task_executions")
    parent_task_execution = relationship("TaskExecution", remote_side=[uuid], back_populates="child_task_executions")
    child_task_executions = relationship("TaskExecution", back_populates="parent_task_execution")  # Reverse relationship for child task executions

    @hybrid_property
    def name(self):
        return self.task.name if self.task else None

    @name.expression
    def name(cls):
        return select(Task.name).where(Task.uuid == cls.task_uuid).scalar_subquery()

    @hybrid_property
    def callback_fns(self):
        return self.task.callback_fns if self.task else []

    @hybrid_property
    def operator(self):
        return self.task.operator

    @hybrid_property
    def task_inputs(self):
        return self.task.task_inputs if self.task else {}



class QualityControl(Base):
    __tablename__ = "quality_control"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    data = Column(MutableDict.as_mutable(JSONB), default=dict, nullable=True)
    notes = Column(Text, nullable=True)
    process_uuid = Column(String(36), ForeignKey("process.uuid"), nullable=False)
    type = Column(String(120), nullable=False)  # e.g., quality_check, inspection

    # relations
    process = relationship("Process", back_populates="quality_control")


class Vehicle(Base):
    __tablename__ = "vehicle"

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    plate_number = Column(String(120), nullable=False, unique=True)
    model = Column(String(120), nullable=False)
    make = Column(String(120), nullable=False)
    year = Column(Integer, nullable=False)
    color = Column(String(120), nullable=False)
    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)
    vin = Column(String(120), nullable=True, unique=True)
    status = Column(String(120), nullable=False)

    # relations
    trips = relationship("Trip", back_populates="vehicle")



class ServiceArea(Base):
    __tablename__ = "service_area"
    uuid        = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String(120), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    geometry        = Column(Geometry("POLYGON", srid=4326), nullable=False)
    is_deleted  = Column(Boolean, default=False)
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # relations
    trips = relationship("Trip", back_populates="service_area")


class Trip(Base):
    __tablename__ = "trip"
    uuid        = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    vehicle_uuid = Column(String(36), ForeignKey("vehicle.uuid"), nullable=False)
    service_area_uuid = Column(String(36), ForeignKey("service_area.uuid"), nullable=True)
    distribution_area = Column(Geometry("POLYGON", srid=4326), nullable=True)  # Area covered by the trip
    notes = Column(Text, nullable=True)
    status = Column(String(120), nullable=False)  # e.g., planned, in_progress, completed, cancelled
    start_warehouse_uuid = Column(String(36), ForeignKey("warehouse.uuid"), nullable=True)
    end_warehouse_uuid = Column(String(36), ForeignKey("warehouse.uuid"), nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    start_point = Column(Geometry("POINT", srid=4326), nullable=True)  # Starting point of the trip
    end_point = Column(Geometry("POINT", srid=4326), nullable=True)  # Ending point of the trip
    data = Column(MutableDict.as_mutable(JSONB), default=dict, nullable=True)
    workflow_execution_uuid = Column(String(36), ForeignKey("workflow_execution.uuid"), nullable=True)

    # relations
    vehicle = relationship("Vehicle", back_populates="trips")
    service_area = relationship("ServiceArea", back_populates="trips")
    workflow_execution = relationship("WorkflowExecution", back_populates="trips")
    stops = relationship("TripStop", back_populates="trip")

    @hybrid_property
    def expected_cash(self):
        all_orders = []
        for stop in self.stops:
            orders = [order for order in stop.customer_orders if not order.is_deleted]
            all_orders.extend(orders)

        # get amount paid
        return sum(order.amount_paid for order in all_orders)

    @hybrid_property
    def expected_inventory_map(self):
        trip_input_inventory = self.data.get("input_inventory")
        if not trip_input_inventory:
            return {}

        # get customer order item fulfilled inventory and subtract quantity
        all_orders = []
        for stop in self.stops:
            orders = [order for order in stop.customer_orders if not order.is_deleted]
            all_orders.extend(orders)

        all_fulfilled_order_items = []
        for order in all_orders:
            fulfilled_items = [item for item in order.customer_order_items if not item.is_deleted and item.is_fulfilled]
            all_fulfilled_order_items.extend(fulfilled_items)

        inventory_sale_mapper = {}
        for item in all_fulfilled_order_items:
            events = [event for event in item.inventory_events if not event.is_deleted and event.event_type == "sale"]
            for event in events:
                if event.inventory_uuid not in inventory_sale_mapper:
                    inventory_sale_mapper[event.inventory_uuid] = {
                        "quantity": 0
                    }
                inventory_sale_mapper[event.inventory_uuid]["quantity"] += event.quantity

        # now add the quantity from the inventory_map
        for inventory_uuid, inventory_data in trip_input_inventory.items():
            if inventory_uuid not in inventory_sale_mapper:
                inventory_sale_mapper[inventory_uuid] = {
                    "quantity": 0
                }
            inventory_sale_mapper[inventory_uuid]["quantity"] += inventory_data["quantity"]

        return inventory_sale_mapper














class TripStop(Base):
    __tablename__ = "trip_stop"
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by_uuid = Column(String(36), ForeignKey('user.uuid'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    trip_uuid = Column(String(36), ForeignKey("trip.uuid"), nullable=False)
    coordinates = Column(Geometry("POINT", srid=4326), nullable=False)  # Location of the stop
    notes = Column(Text, nullable=True)
    status = Column(String(120), nullable=False)  # e.g., planned, completed, skipped
    customer_uuid = Column(String(36), ForeignKey("customer.uuid"), nullable=True)  # Optional customer for the stop
    skip_reason = Column(Text, nullable=True)  # Reason for skipping the stop, if applicable
    no_sale_reason = Column(Text, nullable=True)  # Reason for skipping the stop, if applicable

    # relations
    trip = relationship("Trip", back_populates="stops")
    customer = relationship("Customer", back_populates="trip_stops")
    customer_orders = relationship("CustomerOrder", back_populates="trip_stop")
















