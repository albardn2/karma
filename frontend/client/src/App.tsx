import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Landing from "@/pages/Landing";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import Vendors from "@/pages/Vendors";
import VendorDetail from "@/pages/VendorDetail";
import Warehouses from "@/pages/Warehouses";
import WarehouseDetail from "@/pages/WarehouseDetail";
import WarehouseEdit from "@/pages/WarehouseEdit";
import Employees from "@/pages/Employees";
import EmployeeDetail from "@/pages/EmployeeDetail";
import EmployeeEdit from "@/pages/EmployeeEdit";
import Materials from "@/pages/Materials";
import MaterialDetail from "@/pages/MaterialDetail";

import Users from "@/pages/Users";
import UserDetail from "@/pages/UserDetail";
import Vehicles from "@/pages/Vehicles";
import VehicleDetail from "@/pages/VehicleDetail";
import Trips from "@/pages/Trips";
import TripDetail from "@/pages/TripDetail";
import FinancialAccounts from "@/pages/FinancialAccounts";
import FinancialAccountDetail from "@/pages/FinancialAccountDetail";
import Orders from "@/pages/Orders";
import Invoices from "@/pages/Invoices";
import Reports from "@/pages/Reports";
import LiveMap from "@/pages/LiveMap";
import UserLocationHistory from "@/pages/UserLocationHistory";
import LocationTrackingSettings from "@/pages/LocationTrackingSettings";
import Pricing from "@/pages/Pricing";
import PricingDetail from "@/pages/PricingDetail";
import FixedAssets from "@/pages/FixedAssets";
import FixedAssetDetail from "@/pages/FixedAssetDetail";
import Inventory from "@/pages/Inventory";
import InventoryDetail from "@/pages/InventoryDetail";
import InventoryEvents from "@/pages/InventoryEvents";
import InventoryEventDetail from "@/pages/InventoryEventDetail";
import ServiceAreas from "@/pages/ServiceAreas";
import ServiceAreaDetail from "@/pages/ServiceAreaDetail";
import PurchaseOrders from "@/pages/PurchaseOrders";
import PurchaseOrderCreate from "@/pages/PurchaseOrderCreate";
import PurchaseOrderDetail from "@/pages/PurchaseOrderDetail";
import PurchaseOrderEdit from "@/pages/PurchaseOrderEdit";
import CustomerOrders from "@/pages/CustomerOrders";
import CustomerOrderCreate from "@/pages/CustomerOrderCreate";
import CustomerOrderDetail from "@/pages/CustomerOrderDetail";
import Payments from "@/pages/Payments";
import PaymentCreate from "@/pages/PaymentCreate";
import PaymentDetail from "@/pages/PaymentDetail";
import Payouts from "@/pages/Payouts";
import PayoutDetail from "@/pages/PayoutDetail";
import PayoutCreate from "@/pages/PayoutCreate";
import Expenses from "@/pages/Expenses";
import ExpenseDetail from "@/pages/ExpenseDetail";
import ExpenseCreate from "@/pages/ExpenseCreate";
import Transactions from "@/pages/Transactions";
import TransactionDetail from "@/pages/TransactionDetail";
import CreditNoteItems from "@/pages/CreditNoteItems";
import CreditNoteItemDetail from "@/pages/CreditNoteItemDetail";
import CreditNoteItemCreate from "@/pages/CreditNoteItemCreate";
import DebitNoteItems from "@/pages/DebitNoteItems";
import DebitNoteItemDetail from "@/pages/DebitNoteItemDetail";
import DebitNoteItemCreate from "@/pages/DebitNoteItemCreate";
import TransactionCreate from "@/pages/TransactionCreate";
import Processes from "@/pages/Processes";
import ProcessCreate from "@/pages/ProcessCreate";
import ProcessDetail from "@/pages/ProcessDetail";
import Workflows from "@/pages/Workflows";
import WorkflowDetail from "@/pages/WorkflowDetail";
import WorkflowCreate from "@/pages/WorkflowCreate";
import WorkflowExecution from "@/pages/WorkflowExecution";
import WorkflowExecutionDetail from "@/pages/WorkflowExecutionDetail";
import WorkflowExecutionTaskDetail from "@/pages/WorkflowExecutionTaskDetail";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import SuperAdmin from "@/pages/SuperAdmin";

function HomeRoute() {
  // "/" is the public landing page for visitors and the dashboard for
  // signed-in users
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen brand-gradient" />;
  return isAuthenticated ? (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  ) : (
    <Landing />
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/" component={HomeRoute} />
      <Route path="/customers" component={() => <ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/customers/:uuid" component={() => <ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
      <Route path="/vendors" component={() => <ProtectedRoute><Vendors /></ProtectedRoute>} />
      <Route path="/vendors/:uuid" component={() => <ProtectedRoute><VendorDetail /></ProtectedRoute>} />
      <Route path="/warehouses" component={() => <ProtectedRoute><Warehouses /></ProtectedRoute>} />
      <Route path="/warehouses/:uuid" component={() => <ProtectedRoute><WarehouseDetail /></ProtectedRoute>} />
      <Route path="/warehouses/:id/edit" component={() => <ProtectedRoute><WarehouseEdit /></ProtectedRoute>} />
      <Route path="/employees" component={() => <ProtectedRoute><Employees /></ProtectedRoute>} />
      <Route path="/employees/:uuid" component={() => <ProtectedRoute><EmployeeDetail /></ProtectedRoute>} />
      <Route path="/employees/:id/edit" component={() => <ProtectedRoute><EmployeeEdit /></ProtectedRoute>} />
      <Route path="/materials" component={() => <ProtectedRoute><Materials /></ProtectedRoute>} />
      <Route path="/materials/:uuid" component={() => <ProtectedRoute><MaterialDetail /></ProtectedRoute>} />
      <Route path="/pricing" component={() => <ProtectedRoute><Pricing /></ProtectedRoute>} />
      <Route path="/pricing/:uuid" component={() => <ProtectedRoute><PricingDetail /></ProtectedRoute>} />
      <Route path="/fixed-assets" component={() => <ProtectedRoute><FixedAssets /></ProtectedRoute>} />
      <Route path="/fixed-assets/:uuid" component={() => <ProtectedRoute><FixedAssetDetail /></ProtectedRoute>} />
      <Route path="/inventory" component={() => <ProtectedRoute><Inventory /></ProtectedRoute>} />
      <Route path="/inventory/:uuid" component={() => <ProtectedRoute><InventoryDetail /></ProtectedRoute>} />
      <Route path="/inventory-events" component={() => <ProtectedRoute><InventoryEvents /></ProtectedRoute>} />
      <Route path="/inventory-events/:uuid" component={() => <ProtectedRoute><InventoryEventDetail /></ProtectedRoute>} />
      <Route path="/service-areas" component={() => <ProtectedRoute><ServiceAreas /></ProtectedRoute>} />
      <Route path="/service-areas/:uuid" component={() => <ProtectedRoute><ServiceAreaDetail /></ProtectedRoute>} />
      <Route path="/purchase-orders" component={() => <ProtectedRoute><PurchaseOrders /></ProtectedRoute>} />
      <Route path="/purchase-orders/create" component={() => <ProtectedRoute><PurchaseOrderCreate /></ProtectedRoute>} />
      <Route path="/purchase-order/:id" component={() => <ProtectedRoute><PurchaseOrderDetail /></ProtectedRoute>} />
      <Route path="/purchase-orders/:id" component={() => <ProtectedRoute><PurchaseOrderDetail /></ProtectedRoute>} />
      <Route path="/purchase-orders/:id/edit" component={() => <ProtectedRoute><PurchaseOrderEdit /></ProtectedRoute>} />
      <Route path="/customer-orders" component={() => <ProtectedRoute><CustomerOrders /></ProtectedRoute>} />
      <Route path="/customer-orders/create" component={() => <ProtectedRoute><CustomerOrderCreate /></ProtectedRoute>} />
      <Route path="/customer-orders/:id" component={() => <ProtectedRoute><CustomerOrderDetail /></ProtectedRoute>} />
      <Route path="/payments" component={() => <ProtectedRoute><Payments /></ProtectedRoute>} />
      <Route path="/payments/create" component={() => <ProtectedRoute><PaymentCreate /></ProtectedRoute>} />
      <Route path="/payments/:id" component={() => <ProtectedRoute><PaymentDetail /></ProtectedRoute>} />
      <Route path="/payouts" component={() => <ProtectedRoute><Payouts /></ProtectedRoute>} />
      <Route path="/payouts/create" component={() => <ProtectedRoute><PayoutCreate /></ProtectedRoute>} />
      <Route path="/payouts/:id" component={() => <ProtectedRoute><PayoutDetail /></ProtectedRoute>} />
      <Route path="/expenses" component={() => <ProtectedRoute><Expenses /></ProtectedRoute>} />
      <Route path="/expenses/create" component={() => <ProtectedRoute><ExpenseCreate /></ProtectedRoute>} />
      <Route path="/expenses/:id" component={() => <ProtectedRoute><ExpenseDetail /></ProtectedRoute>} />
      <Route path="/transactions" component={() => <ProtectedRoute><Transactions /></ProtectedRoute>} />
      <Route path="/transactions/create" component={() => <ProtectedRoute><TransactionCreate /></ProtectedRoute>} />
      <Route path="/transactions/:id" component={() => <ProtectedRoute><TransactionDetail /></ProtectedRoute>} />
      <Route path="/credit-note-items" component={() => <ProtectedRoute><CreditNoteItems /></ProtectedRoute>} />
      <Route path="/credit-note-items/create" component={() => <ProtectedRoute><CreditNoteItemCreate /></ProtectedRoute>} />
      <Route path="/credit-note-items/:uuid" component={() => <ProtectedRoute><CreditNoteItemDetail /></ProtectedRoute>} />
      <Route path="/debit-note-items" component={() => <ProtectedRoute><DebitNoteItems /></ProtectedRoute>} />
      <Route path="/debit-note-items/create" component={() => <ProtectedRoute><DebitNoteItemCreate /></ProtectedRoute>} />
      <Route path="/debit-note-items/:uuid" component={() => <ProtectedRoute><DebitNoteItemDetail /></ProtectedRoute>} />
      <Route path="/processes" component={() => <ProtectedRoute><Processes /></ProtectedRoute>} />
      <Route path="/processes/create" component={() => <ProtectedRoute><ProcessCreate /></ProtectedRoute>} />
      <Route path="/processes/:uuid" component={() => <ProtectedRoute><ProcessDetail /></ProtectedRoute>} />
      <Route path="/workflows" component={() => <ProtectedRoute><Workflows /></ProtectedRoute>} />
      <Route path="/workflows/new" component={() => <ProtectedRoute><WorkflowCreate /></ProtectedRoute>} />
      <Route path="/workflows/:uuid" component={() => <ProtectedRoute><WorkflowDetail /></ProtectedRoute>} />
      <Route path="/workflow-execution" component={() => <ProtectedRoute><WorkflowExecution /></ProtectedRoute>} />
      <Route path="/workflow-execution/:workflow_uuid/:execution_uuid" component={() => <ProtectedRoute><WorkflowExecutionTaskDetail /></ProtectedRoute>} />
      <Route path="/workflow-execution/:uuid" component={() => <ProtectedRoute><WorkflowExecutionDetail /></ProtectedRoute>} />
      <Route path="/users" component={() => <ProtectedRoute><Users /></ProtectedRoute>} />
      <Route path="/users/:uuid" component={() => <ProtectedRoute><UserDetail /></ProtectedRoute>} />
      <Route path="/users/:uuid/location-history" component={() => <ProtectedRoute><UserLocationHistory /></ProtectedRoute>} />
      <Route path="/vehicles" component={() => <ProtectedRoute><Vehicles /></ProtectedRoute>} />
      <Route path="/vehicles/:uuid" component={() => <ProtectedRoute><VehicleDetail /></ProtectedRoute>} />
      <Route path="/trips" component={() => <ProtectedRoute><Trips /></ProtectedRoute>} />
      <Route path="/trip/:uuid" component={() => <ProtectedRoute><TripDetail /></ProtectedRoute>} />
      <Route path="/financial-accounts" component={() => <ProtectedRoute><FinancialAccounts /></ProtectedRoute>} />
      <Route path="/financial-accounts/:uuid" component={() => <ProtectedRoute><FinancialAccountDetail /></ProtectedRoute>} />
      <Route path="/orders" component={() => <ProtectedRoute><Orders /></ProtectedRoute>} />
      <Route path="/materials" component={() => <ProtectedRoute><Materials /></ProtectedRoute>} />
      <Route path="/invoices" component={() => <ProtectedRoute><Invoices /></ProtectedRoute>} />
      <Route path="/reports" component={() => <ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/live-map" component={() => <ProtectedRoute><LiveMap /></ProtectedRoute>} />
      <Route path="/location-tracking" component={() => <ProtectedRoute><LocationTrackingSettings /></ProtectedRoute>} />
      <Route path="/super-admin" component={() => <ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
      <Route path="/accounts-admin" component={() => <ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LanguageProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </LanguageProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
