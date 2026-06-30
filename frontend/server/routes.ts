import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCustomerSchema, insertMaterialSchema, insertCustomerOrderSchema, insertInvoiceSchema, insertWorkflowSchema, insertTaskSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication endpoints
  app.post("/auth/login", async (req, res) => {
    // Simple mock authentication for development
    const { emailOrRfid, password, username_or_email, rfid_token } = req.body;
    
    // Support both field name formats for compatibility
    const identifier = emailOrRfid || username_or_email || rfid_token || "demo";
    
    // Accept any login for development
    const mockUser = {
      uuid: "mock-user-uuid",
      username: identifier,
      firstName: "Demo",
      lastName: "User", 
      email: "demo@example.com",
      permissionScope: "admin",
      phoneNumber: "+1234567890",
      language: "en"
    };

    const token = "mock-jwt-token";
    res.json({ user: mockUser, token, access_token: token });
  });

  app.get("/auth/me", async (req, res) => {
    // Return mock user for any authenticated request
    const mockUser = {
      uuid: "mock-user-uuid",
      username: "demo",
      firstName: "Demo", 
      lastName: "User",
      email: "demo@example.com",
      permissionScope: "admin",
      phoneNumber: "+1234567890",
      language: "en"
    };
    res.json(mockUser);
  });

  app.post("/auth/logout", async (req, res) => {
    res.json({ message: "Logged out successfully" });
  });

  // Currencies endpoint for forms
  app.get("/payment/currencies", async (req, res) => {
    res.json(["USD", "EUR", "SYP", "GBP"]);
  });

  // Credit note item status endpoint
  app.get("/credit-note-item/status", async (req, res) => {
    res.json(["draft", "sent", "paid", "overdue", "cancelled"]);
  });





  // Dashboard
  app.get("/api/dashboard/metrics", async (req, res) => {
    try {
      const metrics = await storage.getDashboardMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard metrics" });
    }
  });

  app.get("/api/dashboard/recent-orders", async (req, res) => {
    try {
      const orders = await storage.getRecentOrders();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent orders" });
    }
  });

  // Customers
  app.get("/api/customers", async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/:uuid", async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.uuid);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(customerData);
      res.status(201).json(customer);
    } catch (error) {
      res.status(400).json({ error: "Invalid customer data" });
    }
  });

  app.put("/api/customers/:uuid", async (req, res) => {
    try {
      const customerData = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(req.params.uuid, customerData);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(400).json({ error: "Invalid customer data" });
    }
  });

  app.delete("/api/customers/:uuid", async (req, res) => {
    try {
      const deleted = await storage.deleteCustomer(req.params.uuid);
      if (!deleted) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });

  // Materials
  app.get("/api/materials", async (req, res) => {
    try {
      const materials = await storage.getMaterials();
      res.json(materials);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch materials" });
    }
  });

  app.post("/api/materials", async (req, res) => {
    try {
      const materialData = insertMaterialSchema.parse(req.body);
      const material = await storage.createMaterial(materialData);
      res.status(201).json(material);
    } catch (error) {
      res.status(400).json({ error: "Invalid material data" });
    }
  });

  // Customer Orders
  app.get("/api/orders", async (req, res) => {
    try {
      const orders = await storage.getCustomerOrders();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:uuid", async (req, res) => {
    try {
      const order = await storage.getCustomerOrder(req.params.uuid);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const orderData = insertCustomerOrderSchema.parse(req.body);
      const order = await storage.createCustomerOrder(orderData);
      res.status(201).json(order);
    } catch (error) {
      res.status(400).json({ error: "Invalid order data" });
    }
  });

  // Invoices
  app.get("/api/invoices", async (req, res) => {
    try {
      const invoices = await storage.getInvoices();
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  app.get("/api/invoices/:uuid", async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.uuid);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invoice" });
    }
  });

  app.post("/api/invoices", async (req, res) => {
    try {
      const invoiceData = insertInvoiceSchema.parse(req.body);
      const invoice = await storage.createInvoice(invoiceData);
      res.status(201).json(invoice);
    } catch (error) {
      res.status(400).json({ error: "Invalid invoice data" });
    }
  });

  // Workflows
  app.get("/workflow/tags", async (req, res) => {
    try {
      const tags = ["coated_peanuts", "distribution"];
      res.json(tags);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch workflow tags" });
    }
  });

  app.get("/workflow/", async (req, res) => {
    try {
      const { name, tags, page, per_page } = req.query;
      const params = {
        name: name as string | undefined,
        tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags as string[]) : undefined,
        page: page ? parseInt(page as string) : 1,
        perPage: per_page ? parseInt(per_page as string) : 20,
      };
      const result = await storage.getWorkflows(params);
      res.json({
        workflows: result.workflows,
        total_count: result.total,
        page: params.page,
        per_page: params.perPage,
        pages: Math.ceil(result.total / params.perPage),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch workflows" });
    }
  });

  app.get("/workflow/:uuid", async (req, res) => {
    try {
      const workflow = await storage.getWorkflow(req.params.uuid);
      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      res.json(workflow);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch workflow" });
    }
  });

  app.post("/workflow/", async (req, res) => {
    try {
      const workflowData = insertWorkflowSchema.parse(req.body);
      const workflow = await storage.createWorkflow(workflowData);
      res.status(201).json(workflow);
    } catch (error) {
      res.status(400).json({ error: "Invalid workflow data" });
    }
  });

  app.put("/workflow/:uuid", async (req, res) => {
    try {
      const workflowData = insertWorkflowSchema.partial().parse(req.body);
      const workflow = await storage.updateWorkflow(req.params.uuid, workflowData);
      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      res.json(workflow);
    } catch (error) {
      res.status(400).json({ error: "Invalid workflow data" });
    }
  });

  app.delete("/workflow/:uuid", async (req, res) => {
    try {
      const deleted = await storage.deleteWorkflow(req.params.uuid);
      if (!deleted) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete workflow" });
    }
  });

  // Tasks
  app.get("/task/", async (req, res) => {
    try {
      const { workflow_uuid, name, page, per_page } = req.query;
      const params = {
        workflowUuid: workflow_uuid as string | undefined,
        name: name as string | undefined,
        page: page ? parseInt(page as string) : 1,
        perPage: per_page ? parseInt(per_page as string) : 20,
      };
      const result = await storage.getTasks(params);
      res.json({
        tasks: result.tasks,
        total_count: result.total,
        page: params.page,
        per_page: params.perPage,
        pages: Math.ceil(result.total / params.perPage),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.get("/task/:uuid", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.uuid);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task" });
    }
  });

  app.post("/task/", async (req, res) => {
    try {
      const taskData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(taskData);
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  app.put("/task/:uuid", async (req, res) => {
    try {
      const taskData = insertTaskSchema.partial().parse(req.body);
      const task = await storage.updateTask(req.params.uuid, taskData);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  app.delete("/task/:uuid", async (req, res) => {
    try {
      const deleted = await storage.deleteTask(req.params.uuid);
      if (!deleted) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
