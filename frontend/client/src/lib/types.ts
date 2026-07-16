// Customer types matching Flask backend DTOs
export interface Customer {
  uuid: string;
  company_name: string;
  full_name: string;
  phone_number: string;
  email_address?: string;
  full_address: string;
  category: string;
  notes?: string;
  business_cards?: string;
  coordinates?: string;
  created_at: string;
  is_deleted: boolean;
  balance_per_currency: Record<string, number>;
}

export interface CustomerFormData {
  company_name: string;
  full_name: string;
  phone_number: string;
  email_address?: string | null;
  full_address: string;
  category: string;
  notes?: string | null;
  coordinates?: string | null;
}

export interface CustomerPage {
  customers: Customer[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

// User types matching Flask backend DTOs
export enum PermissionScope {
  SUPER_ADMIN = "superuser",
  ADMIN = "admin",
  OPERATION_MANAGER = "operation_manager",
  ACCOUNTANT = "accountant",
  OPERATOR = "operator",
  DRIVER = "driver",
  SALES = "sales"
}

export interface User {
  uuid: string;
  username: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone_number?: string;
  language?: string;
  created_at: string;
  permission_scope?: string;
  is_deleted: boolean;
  track_location?: boolean;
  location_ping_seconds?: number;
}

export interface UserFormData {
  username: string;
  first_name: string;
  last_name: string;
  password: string;
  email?: string;
  phone_number?: string;
  language?: string;
  permission_scope?: string;
  rfid_token?: string;
}

export interface UserUpdateData {
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  language?: string;
  password?: string;
  permission_scope?: string;
  rfid_token?: string;
  track_location?: boolean;
  location_ping_seconds?: number;
}

export interface UserFilters {
  username?: string;
  email?: string;
  permission_scope?: PermissionScope;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  uuid?: string;
  page?: number;
  per_page?: number;
}

export interface UserPage {
  users: User[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

// Financial Account Types
export interface FinancialAccount {
  uuid: string;
  account_name: string;
  currency: string;
  notes?: string | null;
  created_by_uuid?: string | null;
  created_at: string;
  balance: number;
  is_deleted: boolean;
  is_external: boolean;
}

export interface FinancialAccountCreate {
  account_name: string;
  currency: string;
  notes?: string;
  created_by_uuid?: string;
  is_external?: boolean;
}

export interface FinancialAccountUpdate {
  account_name?: string;
  notes?: string | null;
  currency?: string;
  is_external?: boolean;
}

export interface FinancialAccountListParams {
  uuid?: string;
  account_name?: string;
  page: number;
  per_page: number;
}

export interface FinancialAccountPage {
  accounts: FinancialAccount[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

export type Currency = string;

// Vendor Types
export enum VendorCategory {
  RAW_MATERIALS = "raw_materials",
  EQUIPMENT = "equipment", 
  SERVICES = "services",
  OTHER = "other"
}

export interface Vendor {
  uuid: string;
  company_name: string;
  full_name: string;
  phone_number: string;
  email_address?: string;
  full_address?: string;
  business_cards?: string;
  notes?: string;
  category?: VendorCategory;
  coordinates?: string;
  created_at: string;
  created_by_uuid?: string;
  is_deleted: boolean;
  balance_per_currency: Record<string, number>;
}

export interface VendorFormData {
  company_name: string;
  full_name: string;
  phone_number: string;
  email_address?: string | null;
  full_address?: string | null;
  business_cards?: string | null;
  notes?: string | null;
  category?: VendorCategory;
  coordinates?: string | null;
}

export interface VendorUpdateData {
  company_name?: string;
  full_name?: string;
  phone_number?: string;
  email_address?: string | null;
  full_address?: string | null;
  business_cards?: string | null;
  notes?: string | null;
  category?: VendorCategory;
  coordinates?: string | null;
}

export interface VendorFilters {
  uuid?: string;
  category?: VendorCategory;
  company_name?: string;
  full_name?: string;
  phone_number?: string;
  email_address?: string;
  page?: number;
  per_page?: number;
  within_polygon?: string;
}

export interface VendorPage {
  vendors: Vendor[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface Warehouse {
  uuid: string;
  name: string;
  address: string;
  coordinates?: string;
  notes?: string;
  created_by_uuid?: string;
  created_at: string;
  is_deleted: boolean;
}

export interface WarehouseFilters {
  uuid?: string;
  name?: string;
  page?: number;
  per_page?: number;
  within_polygon?: string;
}

export interface WarehousePage {
  warehouses: Warehouse[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

// Employee Types
export enum EmployeeRole {
  ADMIN = "admin",
  MANAGER = "manager",
  OPERATOR = "employee",
  ACCOUNTANT = "accountant",
  DRIVER = "driver",
  SALES = "sales"
}

export interface Employee {
  uuid: string;
  full_name: string;
  phone_number: string;
  email_address?: string;
  full_address?: string;
  identification?: string;
  notes?: string;
  role?: EmployeeRole;
  image?: string;
  created_by_uuid?: string;
  created_at: string;
  is_deleted: boolean;
}

export interface EmployeeFormData {
  full_name: string;
  phone_number: string;
  email_address?: string | null;
  full_address?: string | null;
  identification?: string | null;
  notes?: string | null;
  role?: EmployeeRole;
  image?: string | null;
}

export interface EmployeeUpdateData {
  full_name?: string;
  phone_number?: string;
  email_address?: string | null;
  full_address?: string | null;
  identification?: string | null;
  notes?: string | null;
  role?: EmployeeRole;
  image?: string | null;
}

export interface EmployeeFilters {
  uuid?: string;
  full_name?: string;
  phone_number?: string;
  email_address?: string;
  role?: EmployeeRole;
  page?: number;
  per_page?: number;
}

export interface EmployeePage {
  employees: Employee[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

// Material Types
export interface Material {
  uuid: string;
  name: string;
  sku: string;
  description?: string;
  type: string;
  measure_unit?: string;
  created_by_uuid?: string;
  created_at: string;
  is_deleted: boolean;
}

export interface MaterialFormData {
  name: string;
  sku: string;
  type: string;
  description?: string | null;
  measure_unit?: string | null;
}

export interface MaterialUpdateData {
  name?: string;
  sku?: string;
  type?: string;
  description?: string | null;
  measure_unit?: string | null;
}

export interface MaterialFilters {
  uuid?: string;
  name?: string;
  sku?: string;
  type?: string;
  page?: number;
  per_page?: number;
}

export interface MaterialPage {
  materials: Material[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

// Pricing Types
export interface Pricing {
  uuid: string;
  material_uuid: string;
  price_per_unit: number;
  currency: string;
  created_by_uuid?: string;
  created_at: string;
  is_deleted: boolean;
  unit?: string;
}

export interface PricingFormData {
  material_uuid: string;
  price_per_unit: number | string;
  currency: string;
}

export interface PricingUpdateData {
  price_per_unit?: number;
  currency?: string;
}

export interface PricingFilters {
  uuid?: string;
  material_uuid?: string;
  currency?: string;
  page?: number;
  per_page?: number;
}

export interface PricingPage {
  pricings: Pricing[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

// Vehicle Types
export enum VehicleStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SOLD = "sold",
  MAINTENANCE = "maintenance",
  RETIRED = "retired",
  UTILIZED = "utilized"
}

export interface Vehicle {
  uuid: string;
  created_by_uuid?: string;
  created_at: string;
  plate_number: string;
  model: string;
  make: string;
  year: number;
  color: string;
  status: VehicleStatus;
  notes?: string;
  vin?: string;
  is_deleted: boolean;
}

export interface VehicleFormData {
  plate_number: string;
  model: string;
  make: string;
  year: number;
  color: string;
  status: VehicleStatus;
  notes?: string;
  vin?: string;
}

export interface VehicleUpdateData {
  plate_number?: string;
  model?: string;
  make?: string;
  year?: number;
  color?: string;
  status?: VehicleStatus;
  notes?: string;
  vin?: string;
}

export interface VehicleFilters {
  uuid?: string;
  created_by_uuid?: string;
  plate_number?: string;
  model?: string;
  make?: string;
  year?: number;
  color?: string;
  status?: VehicleStatus;
  vin?: string;
  page?: number;
  per_page?: number;
}

export interface VehiclePage {
  items: Vehicle[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

// Trip types matching Flask backend DTOs
export enum TripStatus {
  PLANNED = "planned",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export interface InventoryInput {
  inventory_uuid: string;
  quantity: number;
  material_name?: string;
  lot_id?: string;
}

export interface TripOutput {
  cash_collected: number;
  inventory_left: InventoryInput[];
}

export interface TripData {
  input_inventory?: InventoryInput[];
  output?: TripOutput;
}

export interface Trip {
  uuid: string;
  created_by_uuid?: string;
  created_at: string;
  vehicle_uuid: string;
  service_area_uuid?: string;
  distribution_area?: string;
  notes?: string;
  status: TripStatus;
  start_warehouse_uuid?: string;
  end_warehouse_uuid?: string;
  start_time?: string;
  end_time?: string;
  start_point?: string;
  end_point?: string;
  data?: TripData;
  workflow_execution_uuid?: string;
  vehicle_plate?: string | null;
  assigned_username?: string | null;
  start_inventory?: Record<string, number> | null;
  end_inventory?: Record<string, number> | null;
  inventory_reconciliation?: Record<
    string,
    { start: number; sold: number; expected_end: number; actual_end: number | null; variance: number | null }
  > | null;
  expected_cash?: Record<string, number> | null;
}

export interface TripFormData {
  vehicle_uuid: string;
  service_area_names?: string[];
  distribution_area?: string;
  notes?: string;
  status: TripStatus;
  start_warehouse_uuid?: string;
  end_warehouse_uuid?: string;
  start_time?: string;
  end_time?: string;
  start_point?: string;
  end_point?: string;
  data?: TripData;
  workflow_execution_uuid?: string;
}

export interface TripUpdateData {
  vehicle_uuid?: string;
  service_area_uuid?: string;
  distribution_area?: string;
  notes?: string;
  status?: TripStatus;
  start_warehouse_uuid?: string;
  end_warehouse_uuid?: string;
  start_time?: string;
  end_time?: string;
  start_point?: string;
  end_point?: string;
  data?: TripData;
  workflow_execution_uuid?: string;
}

export interface TripFilters {
  uuid?: string;
  created_by_uuid?: string;
  vehicle_uuid?: string;
  service_area_uuid?: string;
  status?: TripStatus;
  intersects_area?: string;
  page?: number;
  per_page?: number;
}

export interface TripPage {
  items: Trip[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}