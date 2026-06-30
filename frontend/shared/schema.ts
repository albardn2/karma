import { pgTable, text, serial, integer, boolean, timestamp, decimal, uuid as pgUuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  username: text("username").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  password: text("password").notNull(),
  email: text("email").unique(),
  permissionScope: text("permission_scope"),
  phoneNumber: text("phone_number"),
  language: text("language"),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  createdByUuid: text("created_by_uuid"),
  emailAddress: text("email_address").unique(),
  companyName: text("company_name").notNull(),
  fullName: text("full_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  fullAddress: text("full_address").notNull(),
  businessCards: text("business_cards"),
  notes: text("notes"),
  category: text("category").notNull(),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  unit: text("unit").notNull(),
  category: text("category"),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customerOrders = pgTable("customer_orders", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  createdByUuid: text("created_by_uuid"),
  customerUuid: text("customer_uuid").notNull(),
  notes: text("notes"),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customerOrderItems = pgTable("customer_order_items", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  createdByUuid: text("created_by_uuid"),
  customerOrderUuid: text("customer_order_uuid").notNull(),
  quantity: integer("quantity").notNull(),
  unit: text("unit").notNull(),
  materialUuid: text("material_uuid").notNull(),
  isFulfilled: boolean("is_fulfilled").default(false),
  fulfilledAt: timestamp("fulfilled_at"),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  createdByUuid: text("created_by_uuid"),
  customerUuid: text("customer_uuid").notNull(),
  customerOrderUuid: text("customer_order_uuid").notNull(),
  currency: text("currency").notNull(),
  dueDate: timestamp("due_date"),
  notes: text("notes"),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  invoiceUuid: text("invoice_uuid").notNull(),
  customerOrderItemUuid: text("customer_order_item_uuid").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  invoiceUuid: text("invoice_uuid").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  uuid: true,
  createdAt: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  uuid: true,
  createdAt: true,
});

export const insertMaterialSchema = createInsertSchema(materials).omit({
  id: true,
  uuid: true,
  createdAt: true,
});

export const insertCustomerOrderSchema = createInsertSchema(customerOrders).omit({
  id: true,
  uuid: true,
  createdAt: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  uuid: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Material = typeof materials.$inferSelect;
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;

export type CustomerOrder = typeof customerOrders.$inferSelect;
export type InsertCustomerOrder = z.infer<typeof insertCustomerOrderSchema>;

export type CustomerOrderItem = typeof customerOrderItems.$inferSelect;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type InvoiceItem = typeof invoiceItems.$inferSelect;

export type Payment = typeof payments.$inferSelect;

export const workflows = pgTable("workflows", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  createdByUuid: text("created_by_uuid"),
  name: text("name").notNull(),
  description: text("description"),
  tags: text("tags").array(),
  parameters: text("parameters"),
  callbackFns: text("callback_fns").array(),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkflowSchema = createInsertSchema(workflows).omit({
  id: true,
  uuid: true,
  createdAt: true,
}).extend({
  parameters: z.record(z.any()).nullable().optional(),
});

export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  createdByUuid: text("created_by_uuid"),
  workflowUuid: text("workflow_uuid").notNull(),
  parentTaskUuid: text("parent_task_uuid"),
  name: text("name").notNull(),
  description: text("description"),
  operator: text("operator").notNull(),
  taskInputs: text("task_inputs"),
  dependsOn: text("depends_on").array(),
  callbackFns: text("callback_fns").array(),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  uuid: true,
  createdAt: true,
}).extend({
  taskInputs: z.record(z.any()).nullable().optional(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
