import { 
  users, customers, materials, customerOrders, customerOrderItems, invoices, invoiceItems, payments, workflows, tasks,
  type User, type InsertUser, type Customer, type InsertCustomer, 
  type Material, type InsertMaterial, type CustomerOrder, type InsertCustomerOrder,
  type CustomerOrderItem, type Invoice, type InsertInvoice, type InvoiceItem, type Payment,
  type Workflow, type InsertWorkflow, type Task, type InsertTask
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Customers
  getCustomers(): Promise<Customer[]>;
  getCustomer(uuid: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(uuid: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(uuid: string): Promise<boolean>;

  // Materials
  getMaterials(): Promise<Material[]>;
  getMaterial(uuid: string): Promise<Material | undefined>;
  createMaterial(material: InsertMaterial): Promise<Material>;

  // Customer Orders
  getCustomerOrders(): Promise<CustomerOrder[]>;
  getCustomerOrder(uuid: string): Promise<CustomerOrder | undefined>;
  createCustomerOrder(order: InsertCustomerOrder): Promise<CustomerOrder>;
  getCustomerOrderItems(orderUuid: string): Promise<CustomerOrderItem[]>;

  // Invoices
  getInvoices(): Promise<Invoice[]>;
  getInvoice(uuid: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getInvoiceItems(invoiceUuid: string): Promise<InvoiceItem[]>;

  // Payments
  getPayments(invoiceUuid: string): Promise<Payment[]>;

  // Workflows
  getWorkflows(params?: { name?: string; tags?: string[]; page?: number; perPage?: number }): Promise<{ workflows: Workflow[]; total: number }>;
  getWorkflow(uuid: string): Promise<Workflow | undefined>;
  createWorkflow(workflow: InsertWorkflow): Promise<Workflow>;
  updateWorkflow(uuid: string, workflow: Partial<InsertWorkflow>): Promise<Workflow | undefined>;
  deleteWorkflow(uuid: string): Promise<boolean>;

  // Tasks
  getTasks(params?: { workflowUuid?: string; name?: string; page?: number; perPage?: number }): Promise<{ tasks: Task[]; total: number }>;
  getTask(uuid: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(uuid: string, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(uuid: string): Promise<boolean>;

  // Dashboard metrics
  getDashboardMetrics(): Promise<{
    totalRevenue: number;
    activeOrders: number;
    totalCustomers: number;
    overdueInvoices: number;
  }>;

  getRecentOrders(limit?: number): Promise<Array<CustomerOrder & { customer: Customer }>>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private customers: Map<string, Customer>;
  private materials: Map<string, Material>;
  private customerOrders: Map<string, CustomerOrder>;
  private customerOrderItems: Map<string, CustomerOrderItem>;
  private invoices: Map<string, Invoice>;
  private invoiceItems: Map<string, InvoiceItem>;
  private payments: Map<string, Payment>;
  private workflows: Map<string, Workflow>;
  private tasks: Map<string, Task>;
  
  private currentUserId: number;

  constructor() {
    this.users = new Map();
    this.customers = new Map();
    this.materials = new Map();
    this.customerOrders = new Map();
    this.customerOrderItems = new Map();
    this.invoices = new Map();
    this.invoiceItems = new Map();
    this.payments = new Map();
    this.workflows = new Map();
    this.tasks = new Map();
    this.currentUserId = 1;
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { 
      ...insertUser, 
      id,
      uuid: `user-${Date.now()}-${Math.random()}`,
      createdAt: new Date(),
      isDeleted: false
    };
    this.users.set(id, user);
    return user;
  }

  // Customers
  async getCustomers(): Promise<Customer[]> {
    return Array.from(this.customers.values()).filter(c => !c.isDeleted);
  }

  async getCustomer(uuid: string): Promise<Customer | undefined> {
    const customer = this.customers.get(uuid);
    return customer && !customer.isDeleted ? customer : undefined;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const customer: Customer = {
      ...insertCustomer,
      id: this.customers.size + 1,
      uuid: `customer-${Date.now()}-${Math.random()}`,
      createdAt: new Date(),
      isDeleted: false
    };
    this.customers.set(customer.uuid, customer);
    return customer;
  }

  async updateCustomer(uuid: string, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const customer = this.customers.get(uuid);
    if (!customer || customer.isDeleted) return undefined;
    
    const updatedCustomer = { ...customer, ...updates };
    this.customers.set(uuid, updatedCustomer);
    return updatedCustomer;
  }

  async deleteCustomer(uuid: string): Promise<boolean> {
    const customer = this.customers.get(uuid);
    if (!customer) return false;
    
    customer.isDeleted = true;
    this.customers.set(uuid, customer);
    return true;
  }

  // Materials
  async getMaterials(): Promise<Material[]> {
    return Array.from(this.materials.values()).filter(m => !m.isDeleted);
  }

  async getMaterial(uuid: string): Promise<Material | undefined> {
    const material = this.materials.get(uuid);
    return material && !material.isDeleted ? material : undefined;
  }

  async createMaterial(insertMaterial: InsertMaterial): Promise<Material> {
    const material: Material = {
      ...insertMaterial,
      id: this.materials.size + 1,
      uuid: `material-${Date.now()}-${Math.random()}`,
      createdAt: new Date(),
      isDeleted: false
    };
    this.materials.set(material.uuid, material);
    return material;
  }

  // Customer Orders
  async getCustomerOrders(): Promise<CustomerOrder[]> {
    return Array.from(this.customerOrders.values()).filter(o => !o.isDeleted);
  }

  async getCustomerOrder(uuid: string): Promise<CustomerOrder | undefined> {
    const order = this.customerOrders.get(uuid);
    return order && !order.isDeleted ? order : undefined;
  }

  async createCustomerOrder(insertOrder: InsertCustomerOrder): Promise<CustomerOrder> {
    const order: CustomerOrder = {
      ...insertOrder,
      id: this.customerOrders.size + 1,
      uuid: `order-${Date.now()}-${Math.random()}`,
      createdAt: new Date(),
      isDeleted: false
    };
    this.customerOrders.set(order.uuid, order);
    return order;
  }

  async getCustomerOrderItems(orderUuid: string): Promise<CustomerOrderItem[]> {
    return Array.from(this.customerOrderItems.values())
      .filter(item => item.customerOrderUuid === orderUuid && !item.isDeleted);
  }

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    return Array.from(this.invoices.values()).filter(i => !i.isDeleted);
  }

  async getInvoice(uuid: string): Promise<Invoice | undefined> {
    const invoice = this.invoices.get(uuid);
    return invoice && !invoice.isDeleted ? invoice : undefined;
  }

  async createInvoice(insertInvoice: InsertInvoice): Promise<Invoice> {
    const invoice: Invoice = {
      ...insertInvoice,
      id: this.invoices.size + 1,
      uuid: `invoice-${Date.now()}-${Math.random()}`,
      createdAt: new Date(),
      isDeleted: false
    };
    this.invoices.set(invoice.uuid, invoice);
    return invoice;
  }

  async getInvoiceItems(invoiceUuid: string): Promise<InvoiceItem[]> {
    return Array.from(this.invoiceItems.values())
      .filter(item => item.invoiceUuid === invoiceUuid && !item.isDeleted);
  }

  // Payments
  async getPayments(invoiceUuid: string): Promise<Payment[]> {
    return Array.from(this.payments.values())
      .filter(payment => payment.invoiceUuid === invoiceUuid && !payment.isDeleted);
  }

  // Dashboard metrics
  async getDashboardMetrics(): Promise<{
    totalRevenue: number;
    activeOrders: number;
    totalCustomers: number;
    overdueInvoices: number;
  }> {
    const activeOrders = Array.from(this.customerOrders.values())
      .filter(o => !o.isDeleted).length;
    
    const totalCustomers = Array.from(this.customers.values())
      .filter(c => !c.isDeleted).length;

    return {
      totalRevenue: 124590,
      activeOrders,
      totalCustomers,
      overdueInvoices: 12
    };
  }

  async getRecentOrders(limit = 5): Promise<Array<CustomerOrder & { customer: Customer }>> {
    const orders = Array.from(this.customerOrders.values())
      .filter(o => !o.isDeleted)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, limit);

    return orders.map(order => {
      const customer = this.customers.get(order.customerUuid);
      return { ...order, customer: customer! };
    });
  }

  // Workflows
  async getWorkflows(params?: { name?: string; tags?: string[]; page?: number; perPage?: number }): Promise<{ workflows: Workflow[]; total: number }> {
    let workflows = Array.from(this.workflows.values()).filter(w => !w.isDeleted);
    
    if (params?.name) {
      workflows = workflows.filter(w => w.name.toLowerCase().includes(params.name!.toLowerCase()));
    }
    
    if (params?.tags && params.tags.length > 0) {
      workflows = workflows.filter(w => {
        if (!w.tags) return false;
        return params.tags!.some(tag => w.tags!.includes(tag));
      });
    }

    const total = workflows.length;
    const page = params?.page || 1;
    const perPage = params?.perPage || 20;
    const start = (page - 1) * perPage;
    const end = start + perPage;
    
    const paginatedWorkflows = workflows.slice(start, end);
    
    return { workflows: paginatedWorkflows, total };
  }

  async getWorkflow(uuid: string): Promise<Workflow | undefined> {
    const workflow = this.workflows.get(uuid);
    return workflow && !workflow.isDeleted ? workflow : undefined;
  }

  async createWorkflow(insertWorkflow: InsertWorkflow): Promise<Workflow> {
    const workflow: Workflow = {
      ...insertWorkflow,
      id: this.workflows.size + 1,
      uuid: `workflow-${Date.now()}-${Math.random()}`,
      // Convert parameters object to JSON string for storage
      parameters: insertWorkflow.parameters ? JSON.stringify(insertWorkflow.parameters) : null,
      createdAt: new Date(),
      isDeleted: false
    };
    this.workflows.set(workflow.uuid, workflow);
    return workflow;
  }

  async updateWorkflow(uuid: string, updates: Partial<InsertWorkflow>): Promise<Workflow | undefined> {
    const workflow = this.workflows.get(uuid);
    if (!workflow || workflow.isDeleted) return undefined;
    
    // Convert parameters object to JSON string for storage if provided
    const processedUpdates = {
      ...updates,
      parameters: updates.parameters !== undefined 
        ? (updates.parameters ? JSON.stringify(updates.parameters) : null)
        : workflow.parameters
    };
    
    const updatedWorkflow = { ...workflow, ...processedUpdates };
    this.workflows.set(uuid, updatedWorkflow);
    return updatedWorkflow;
  }

  async deleteWorkflow(uuid: string): Promise<boolean> {
    const workflow = this.workflows.get(uuid);
    if (!workflow) return false;
    
    workflow.isDeleted = true;
    this.workflows.set(uuid, workflow);
    return true;
  }

  // Tasks
  async getTasks(params?: { workflowUuid?: string; name?: string; page?: number; perPage?: number }): Promise<{ tasks: Task[]; total: number }> {
    let tasks = Array.from(this.tasks.values()).filter(t => !t.isDeleted);
    
    if (params?.workflowUuid) {
      tasks = tasks.filter(t => t.workflowUuid === params.workflowUuid);
    }
    
    if (params?.name) {
      tasks = tasks.filter(t => t.name.toLowerCase().includes(params.name!.toLowerCase()));
    }

    const total = tasks.length;
    const page = params?.page || 1;
    const perPage = params?.perPage || 20;
    const start = (page - 1) * perPage;
    const end = start + perPage;
    
    const paginatedTasks = tasks.slice(start, end);
    
    return { tasks: paginatedTasks, total };
  }

  async getTask(uuid: string): Promise<Task | undefined> {
    const task = this.tasks.get(uuid);
    return task && !task.isDeleted ? task : undefined;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const task: Task = {
      ...insertTask,
      id: this.tasks.size + 1,
      uuid: `task-${Date.now()}-${Math.random()}`,
      taskInputs: insertTask.taskInputs ? JSON.stringify(insertTask.taskInputs) : null,
      createdAt: new Date(),
      isDeleted: false
    };
    this.tasks.set(task.uuid, task);
    return task;
  }

  async updateTask(uuid: string, updates: Partial<InsertTask>): Promise<Task | undefined> {
    const task = this.tasks.get(uuid);
    if (!task || task.isDeleted) return undefined;
    
    const processedUpdates = {
      ...updates,
      taskInputs: updates.taskInputs !== undefined 
        ? (updates.taskInputs ? JSON.stringify(updates.taskInputs) : null)
        : task.taskInputs
    };
    
    const updatedTask = { ...task, ...processedUpdates };
    this.tasks.set(uuid, updatedTask);
    return updatedTask;
  }

  async deleteTask(uuid: string): Promise<boolean> {
    const task = this.tasks.get(uuid);
    if (!task) return false;
    
    task.isDeleted = true;
    this.tasks.set(uuid, task);
    return true;
  }
}

export const storage = new MemStorage();
