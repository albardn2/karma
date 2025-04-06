import uuid
from datetime import datetime
from sqlalchemy import create_engine, Column, String, DateTime, Text, Float, Boolean, ForeignKey, Integer
from models.base import Base
from sqlalchemy.orm import relationship


class Customer(Base):
    __tablename__ = 'customer'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    email_address = Column(String(120), nullable=True, unique=True)
    company_name = Column(String(120), nullable=False)
    full_name = Column(String(120), nullable=False) # for person
    phone_number = Column(String(50), nullable=False)
    full_address = Column(Text, nullable=False)
    business_cards = Column(Text, nullable=True)  # URL(s) or file path(s)
    notes = Column(Text, nullable=True)
    category = Column(String(120), nullable=False)  # roastery, cafe, etc..
    coordinates = Column(String(120), nullable=True)
    is_deleted = Column(Boolean, default=False)
    # relations
    orders = relationship("CustomerOrder", back_populates="customer")

    @property
    def balance(self):
        return sum([order.total_amount for order in self.orders if not order.is_fulfilled])


def __repr__(self):
        return (f"<Customer(uuid={self.uuid}, email_address={self.email_address}, "
                f"customer_full_name={self.customer_full_name}, category={self.category})>")


class CustomerOrder(Base):
    __tablename__ = 'customer_order'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_uuid = Column(String(36), ForeignKey('customer.uuid'), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_fulfilled = Column(Boolean, default=False)
    fulfilled_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False)
    #relations
    order_items = relationship("OrderItem", back_populates="order")
    invoices = relationship("Invoice", back_populates="customer_order")
    customer = relationship("Customer", back_populates="orders")



class OrderItem(Base):
    __tablename__ = 'order_item'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_order_uuid = Column(String(36), ForeignKey('customer_order.uuid'), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit = Column(String(120), nullable=False) # should be same as material unit
    material_uuid = Column(String(36), ForeignKey('material.uuid'), nullable=False)
    is_fulfilled = Column(Boolean, default=False)
    fulfilled_at = Column(DateTime, nullable=True)
    quantity_shipped = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    # relations
    order = relationship("CustomerOrder", back_populates="order_items")
    material = relationship("Material", back_populates="order_items")

    def __repr__(self):
        return (f"<OrderItem(uuid={self.uuid}, material_name={self.material.name}, "
                f"quantity={self.quantity}, price={self.price}, total_price={self.total_price})>")



# class Product(Base):
#     __tablename__ = 'product'
#
#     uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
#     sku = Column(String(120), nullable=False, unique=True)
#     product_name = Column(String(120), nullable=False)
#     price_per_unit = Column(Float, nullable=False)
#     unit = Column(String(120), nullable=False)
#     currency = Column(String(120), nullable=False)
#     category = Column(String(120), nullable=False)
#     created_at = Column(DateTime, default=datetime.utcnow)
#     order_items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
#     description = Column(Text, nullable=True)
#
#     def __repr__(self):
#         return (f"<Product(uuid={self.uuid}, product_name={self.product_name}, "
#                 f"price={self.price}, category={self.category})>")

class Invoice(Base):
    __tablename__ = 'invoice'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_uuid = Column(String(36), ForeignKey('customer.uuid'), nullable=False)
    customer_order_uuid = Column(String(36), ForeignKey('customer_order.uuid'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    currency = Column(String(120), nullable=False)
    status = Column(String(120), nullable=False) # void, pending, paid, partially_paid, refunded, partially_refunded
    paid_at = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    #relations
    customer_order = relationship("CustomerOrder", back_populates="invoice")
    invoice_items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")

    def __repr__(self):
        return (f"<Invoice(uuid={self.uuid}, total_price={self.total_price}, "
                f"is_paid={self.is_paid}, paid_at={self.paid_at})>")

    @property
    def total_amount(self):
        return sum([item.total_price for item in self.invoice_items])

    @property
    def amount_paid(self):
        return sum([payment.amount for payment in self.payments])

    @property
    def amount_due(self):
        return self.total_amount - self.amount_paid

    @property
    def is_paid(self):
        return self.amount_due == 0

    @property
    def is_overdue(self):
        return self.due_date and self.due_date < datetime.utcnow()






class InvoiceItem(Base):
    __tablename__ = 'invoice_item'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_uuid = Column(String(36), ForeignKey('invoice.uuid'), nullable=False)
    order_item_uuid = Column(String(36), ForeignKey('order_item.uuid'), nullable=False)
    price_per_unit = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow,nullable=False)
    # relations
    invoice = relationship("Invoice", back_populates="invoice_items")
    order_item = relationship("OrderItem", back_populates="invoice_item")

    @property
    def total_price(self):
        return self.price_per_unit * self.quantity

    @property
    def material(self):
        return self.order_item.material

    @property
    def quantity(self):
        return self.order_item.quantity

    @property
    def unit(self):
        return self.order_item.unit

    @property
    def material_name(self):
        return self.order_item.material.name

    @property
    def currency(self):
        return self.invoice.currency

    def __repr__(self):
        return (f"<InvoiceItem(uuid={self.uuid}, product_name={self.product_name}, "
                f"quantity={self.quantity}, price={self.price}, total_price={self.total_price})>")


class Payment(Base):
    __tablename__ = 'payment'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_uuid = Column(String(36), ForeignKey('invoice.uuid'), nullable=False)
    financial_account_uuid = Column(String(36), ForeignKey('financial_account.uuid'), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    payment_method = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
    #relations
    invoice = relationship("Invoice", back_populates="payments")
    financial_account = relationship("FinancialAccount", back_populates="payments")


    def __repr__(self):
        return (f"<Payment(uuid={self.uuid}, amount={self.amount}, "
                f"payment_method={self.payment_method}, created_at={self.created_at})>")


class FinancialAccount(Base):
    __tablename__ = 'financial_account'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_name = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    balance = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    notes = Column(Text, nullable=True)
    # relations
    payments = relationship("Payment", back_populates="financial_account", cascade="all, delete-orphan")
    transactions_out = relationship("Transaction",
                                     foreign_keys="Transaction.from_account_uuid",
                                     back_populates="from_account")
    transactions_in = relationship("Transaction",
                                   foreign_keys="Transaction.to_account_uuid",
                                   back_populates="to_account")

    def __repr__(self):
        return (f"<FinancialAccount(uuid={self.uuid}, account_name={self.account_name}, "
                f"balance={self.balance})>")


class Transaction(Base):
    __tablename__ = 'transaction'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    from_account_uuid = Column(String(36), ForeignKey('financial_account.uuid'), nullable=False)
    to_account_uuid = Column(String(36), ForeignKey('financial_account.uuid'), nullable=False)
    exchange_rate = Column(Float, default=1.0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    from_account = relationship("FinancialAccount", foreign_keys=[from_account_uuid], back_populates="transactions_from")
    to_account = relationship("FinancialAccount", foreign_keys=[to_account_uuid], back_populates="transactions_to")
    notes = Column(Text, nullable=True)
    def __repr__(self):
        return (f"<Transaction(uuid={self.uuid}, amount={self.amount}, created_at={self.created_at})>")


class Vendor(Base):
    __tablename__ = 'vendor'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    email_address = Column(String(120), nullable=True, unique=True)
    company_name = Column(String(120), nullable=False)
    full_name = Column(String(120), nullable=False)
    phone_number = Column(String(50), nullable=False)
    full_address = Column(Text, nullable=True)
    business_cards = Column(Text, nullable=True)  # URL(s) or file path(s)
    notes = Column(Text, nullable=True)
    category = Column(String(120), nullable=True)  # peanuts, etc..
    coordinates = Column(String(120), nullable=True)
    is_deleted = Column(Boolean, default=False)

    # relations
    purchase_orders = relationship("PurchaseOrder", back_populates="vendor")
    expenses = relationship("Expense", back_populates="vendor")



    @property
    def balance(self):
        0

    def __repr__(self):
        return (f"<Vendor(uuid={self.uuid}, email_address={self.email_address}, "
                f"vendor_full_name={self.vendor_full_name}, category={self.category})>")


class Material(Base):
    __tablename__ = 'material'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(120), nullable=False)
    unit = Column(String(120), nullable=True) # kg,liters,etc..
    created_at = Column(DateTime, default=datetime.utcnow)
    sku = Column(String(120), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    type = Column(String(120), nullable=False)  # raw_material, product, interim

    pricing = relationship("Pricing", back_populates="material", uselist=False)
    purchase_materials = relationship("PurchaseMaterial", back_populates="material")
    order_items = relationship("OrderItem", back_populates="material")
    inventory = relationship("Inventory", back_populates="material")
    batches = relationship("Batch", back_populates="material")
    purchase_order_items = relationship("PurchaseOrderItem", back_populates="material")
    fixed_assets = relationship("FixedAsset", back_populates="material")




    def __repr__(self):
        return (f"<PurchaseMaterial(uuid={self.uuid}, material_name={self.name}, "
                f"price={self.price_per_unit}, category={self.category})>")


class Pricing(Base):
    __tablename__ = 'pricing'
    # one to one relationship with material

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    material_uuid = Column(String(36), ForeignKey('material.uuid'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    price_per_unit = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    # relations
    material = relationship("Material", back_populates="pricing")
    def __repr__(self):
        return (f"<Pricing(uuid={self.uuid}, material_name={self.material.name}, "
                f"price={self.price_per_unit}, currency={self.currency})>")

    @property
    def unit(self):
        return self.material.unit






class PurchaseOrder(Base):
    __tablename__ = 'purchase_order'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_uuid = Column(String(36), ForeignKey('vendor.uuid'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    currency = Column(String(120), nullable=False)
    status = Column(String(120), nullable=False) # void, pending, paid, partially_paid, refunded, partially_refunded
    is_deleted = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    payout_due_date = Column(DateTime, nullable=True)
    # relations
    vendor = relationship("Vendor", back_populates="orders")
    purchase_order_items = relationship("PurchaseOrderItem", back_populates="purchase_order")
    payouts = relationship("Payout", back_populates="purchase_order")

    @property
    def total_amount(self):
        return sum([item.price_per_unit * item.quantity for item in self.purchase_order_items])

    @property
    def amount_paid(self):
        return sum([payout.amount for payout in self.payouts])

    @property
    def amount_due(self):
        return self.total_amount - self.amount_paid

    @property
    def is_paid(self):
        return self.amount_due == 0

    @property
    def is_overdue(self):
        return self.payout_due_date and self.payout_due_date < datetime.utcnow()

    @property
    def is_fulfilled(self):
        return all([item.is_fulfilled for item in self.purchase_order_items])

    @property
    def fulfilled_at(self):
        # return the date when the last item was fulfilled
        if self.is_fulfilled:
            return max([item.fulfilled_at for item in self.purchase_order_items])



    def __repr__(self):
        return (f"<PurchaseOrder(uuid={self.uuid}, vendor_name={self.vendor.company_name}, "
                f"total_price={self.total_amount}, is_paid={self.is_paid})>")

class PurchaseOrderItem(Base):
    __tablename__ = 'purchase_order_item'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    purchase_order_uuid = Column(String(36), ForeignKey('purchase_order.uuid'), nullable=False)
    quantity = Column(Integer, nullable=False)
    price_per_unit = Column(Float, nullable=False)
    unit = Column(String(120), nullable=False) # should be same as material unit
    material_uuid = Column(String(36), ForeignKey('material.uuid'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_fulfilled = Column(Boolean, default=False)
    fulfilled_at = Column(DateTime, nullable=True)
    quantity_received = Column(Float, nullable=False, default=0.0)
    is_deleted = Column(Boolean, default=False)
    # relations
    purchase_order = relationship("PurchaseOrder", back_populates="order_items")
    material = relationship("Material", back_populates="order_items")


    def __repr__(self):
        return (f"<PurchaseOrderItem(uuid={self.uuid}, material_name={self.material.name}, "
                f"quantity={self.quantity}, price={self.price_per_unit}, total_price={self.total_price})>")


class Payout(Base):
    __tablename__ = 'payout'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    purchase_order_uuid = Column(String(36), ForeignKey('purchase_order.uuid'), nullable=True)
    expense_uuid = Column(String(36), ForeignKey('expense.uuid'), nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    financial_account_uuid = Column(String(36), ForeignKey('financial_account.uuid'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
    employee_uuid = Column(String(36), ForeignKey('employee.uuid'), nullable=True)


    #relations
    financial_account = relationship("FinancialAccount", back_populates="payouts")
    purchase_order = relationship("PurchaseOrder", back_populates="payouts")
    expense = relationship("Expense", back_populates="payouts")
    employee = relationship("Employee", back_populates="payouts")



class Expense(Base):
    __tablename__ = 'expense'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    vendor_uuid = Column(String(36), ForeignKey('vendor.uuid'), nullable=True)
    category = Column(String(120), nullable=True)  # salary etc..
    is_deleted = Column(Boolean, default=False)
    description = Column(Text, nullable=True)


    # relations
    vendor = relationship("Vendor", back_populates="expenses")
    payouts = relationship("Payout", back_populates="expense")




    @property
    def amount_paid(self):
        return sum([payout.amount for payout in self.payouts])



class Employee(Base):
    __tablename__ = 'employee'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    email_address = Column(String(120), nullable=True, unique=True)
    full_name = Column(String(120), nullable=False)
    phone_number = Column(String(50), nullable=False)
    full_address = Column(Text, nullable=True)
    identification = Column(Text, nullable=True)  # URL(s) or file path(s)
    notes = Column(Text, nullable=True)
    type = Column(String(120), nullable=True)
    is_deleted = Column(Boolean, default=False)
    image = Column(Text, nullable=True)  # URL(s) or file path(s)

    # relations
    payouts = relationship("Payout", back_populates="employee")


class FixedAsset(Base):
    __tablename__ = 'fixed_asset'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    purchase_date = Column(DateTime, nullable=False)
    current_value = Column(Float, nullable=False)
    annual_depreciation_rate = Column(Float, nullable=False)  # in percentage
    purchase_order_item_uuid = Column(String(36), ForeignKey('purchase_order_item.uuid'), nullable=True)
    is_deleted = Column(Boolean, default=False)
    # relations
    purchase_order_item = relationship("PurchaseOrderItem", back_populates="fixed_asset")

    def __repr__(self):
        return (f"<FixedAsset(uuid={self.uuid}, name={self.name}, "
                f"current_value={self.current_value}, annual_depreciation_rate={self.annual_depreciation_rate})>")
    @property
    def material(self):
        return self.purchase_order_item.material

    @property
    def unit(self):
        return self.purchase_order_item.unit

    @property
    def quantity(self):
        return self.purchase_order_item.quantity

    @property
    def price_per_unit(self):
        return self.purchase_order_item.price_per_unit

    @property
    def total_price(self):
        return self.price_per_unit * self.quantity


class Batch(Base):
    __tablename__ = 'batch'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    material_uuid = Column(String(36), ForeignKey('material.uuid'))
    batch_id = Column(String(120), nullable=False)
    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)

    # relations
    material = relationship("Material", back_populates="batches")


class Inventory(Base):
    __tablename__ = 'inventory'
    # shirkage should not change the cost per unit
    # vendor mistakes should reduce cost per unit until reconciled
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    material_uuid = Column(String(36), ForeignKey('material.uuid'))
    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)
    lot_id = Column(String(120), nullable=False)  # lot number or ID
    expiration_date = Column(DateTime, nullable=True)  # for perishable items
    cost_per_unit = Column(Float, nullable=False)
    unit = Column(String(120), nullable=False)  # should be same as material unit
    current_quantity = Column(Float, nullable=False)
    original_quantity = Column(Float, nullable=False)
    is_active = Column(Boolean, default=True)

    # relations
    material = relationship("Material", back_populates="inventory")
    inventory_events = relationship("InventoryEvent", back_populates="inventory")

    @property
    def total_original_cost(self):
        return self.original_quantity * self.cost_per_unit

    def __repr__(self):
        return (f"<Inventory(uuid={self.uuid}, material_name={self.material.name}, "
                f"quantity={self.quantity}, unit={self.unit})>")


class InventoryEvent(Base):
    __tablename__ = 'inventory_event'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    inventory_uuid = Column(String(36), ForeignKey('inventory.uuid'), nullable=False)
    purchase_order_item_uuid = Column(String(36), ForeignKey('purchase_order_item.uuid'), nullable=True)
    batch_uuid = Column(String(36), ForeignKey('batch.uuid'), nullable=True)
    customer_order_item_uuid = Column(String(36), ForeignKey('order_item.uuid'), nullable=True)
    event_type = Column(String(120), nullable=False)  # addition, removal, adjustment, transfer, undecided
    quantity = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
    debit_note_item_uuid = Column(String(36), ForeignKey('debit_note_item.uuid'), nullable=True)
    credit_note_item_uuid = Column(String(36), ForeignKey('credit_note_item.uuid'), nullable=True)
    # relations
    inventory = relationship("Inventory", back_populates="events")
    purchase_order_item = relationship("PurchaseOrderItem", back_populates="inventory_events")
    batch = relationship("Batch", back_populates="inventory_events")
    customer_order_item = relationship("OrderItem", back_populates="inventory_events")
    debit_note_item = relationship("DebitNoteItem", back_populates="inventory_event")
    credit_note_item =  relationship("CreditNoteItem", back_populates="inventory_event")

    def __repr__(self):
        return (f"<InventoryEvent(uuid={self.uuid}, inventory_uuid={self.inventory_uuid}, "
                f"event_type={self.event_type}, quantity={self.quantity})>")


class Batch(Base):
    __tablename__ = 'batch'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    type = Column(String(120), nullable=False)  # powder_preparation, coated_peanuts,
    material_uuid = Column(String(36), ForeignKey('material.uuid'), nullable=False)
    batch_id = Column(String(120), nullable=False)
    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)
    metadata = Column(Text, nullable=True)  # URL(s) or file path(s)
    cost_per_unit = Column(Float, nullable=False)
    unit = Column(String(120), nullable=False)  # should be same as material unit
    quantity = Column(Float, nullable=False)

    # relations
    material = relationship("Material", back_populates="batches")
    inventory_events = relationship("InventoryEvent", back_populates="batch")



class DebitNoteItem(Base):
    __tablename__ = 'debit_note_item'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String(120), nullable=False)  # void, pending, paid
    invoice_item_uuid = Column(String(36), ForeignKey('invoice_item.uuid'), nullable=False)
    payment_uuid = Column(String(36), ForeignKey('payment.uuid'), nullable=False)
    customer_order_item_uuid = Column(String(36), ForeignKey('order_item.uuid'), nullable=False)
    customer_uuid = Column(String(36), ForeignKey('customer.uuid'), nullable=False)
    vendor_uuid = Column(String(36), ForeignKey('vendor.uuid'), nullable=False)
    purchase_order_item_uuid = Column(String(36), ForeignKey('purchase_order_item.uuid'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    # relations
    invoice_item = relationship("InvoiceItem", back_populates="debit_note_items")
    customer_order_item = relationship("OrderItem", back_populates="debit_note_items")
    purchase_order_item = relationship("PurchaseOrderItem", back_populates="debit_note_items")
    customer = relationship("Customer", back_populates="debit_note_items")
    payment = relationship("Payment", back_populates="debit_note_items")
    vendor = relationship("Vendor", back_populates="debit_note_items")
    inventory_event = relationship("InventoryEvent", back_populates="debit_note_items")


class CreditNoteItem(Base):
    __tablename__ = 'credit_note_item'

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    amount = Column(Float, nullable=False)
    currency = Column(String(120), nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String(120), nullable=False)  # void, pending, paid
    invoice_item_uuid = Column(String(36), ForeignKey('invoice_item.uuid'), nullable=True)
    payout_uuid = Column(String(36), ForeignKey('payout.uuid'), nullable=True)
    customer_order_item_uuid = Column(String(36), ForeignKey('order_item.uuid'), nullable=True)
    customer_uuid = Column(String(36), ForeignKey('customer.uuid'), nullable=True)
    vendor_uuid = Column(String(36), ForeignKey('vendor.uuid'), nullable=True)
    purchase_order_item_uuid = Column(String(36), ForeignKey('purchase_order_item.uuid'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    # relations
    invoice_item = relationship("InvoiceItem", back_populates="credit_note_items")
    customer_order_item = relationship("OrderItem", back_populates="credit_note_items")
    purchase_order_item = relationship("PurchaseOrderItem", back_populates="credit_note_items")
    inventory_event = relationship("InventoryEvent", back_populates="credit_note_items")





