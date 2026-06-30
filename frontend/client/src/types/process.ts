export interface ProcessInputItem {
  quantity: number;
  material_uuid: string;
  cost_per_unit?: number;
}

export interface InputsUsedItem {
  inventory_uuid: string;
  quantity: number;
}

export interface ProcessOutputItem {
  inputs_used?: InputsUsedItem[];
  material_uuid: string;
  quantity: number;
  cost_per_unit?: number;
  total_cost?: number;
}

export interface ProcessData {
  inputs: ProcessInputItem[];
  outputs: ProcessOutputItem[];
  output_warehouse_uuid?: string;
}

export interface ProcessBase {
  created_by_uuid?: string;
  type: ProcessType;
  notes?: string;
  data: ProcessData;
  workflow_execution_uuid?: string;
}

export interface ProcessCreate extends ProcessBase {}

export interface ProcessUpdate {
  notes?: string;
}

export interface ProcessRead extends ProcessBase {
  uuid: string;
  created_at: string;
  is_deleted: boolean;
}

export interface ProcessListParams {
  uuid?: string;
  type?: ProcessType;
  start_date?: string;
  end_date?: string;
  created_by_uuid?: string;
  page: number;
  per_page: number;
}

export interface ProcessPage {
  items: ProcessRead[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

export enum ProcessType {
  COATED_PEANUT_BATCH = "coated_peanut_batch",
  FLOUR_STARCH_POWDER_PREPARATION = "coated_peanut_powder_preparation",
  WATER_DIXTRIN_SOLUTION_PREPARATION = "water_dextrin_solution_preparation",
  RAW_PEANUT_FILTER = "raw_peanut_filter",
  PALM_OIL_PREPARATION = "palm_oil_preparation",
  FRYER_FUEL_PREPARATION = "fryer_fuel_preparation",
  SPICES_PREPARATION = "spices_preparation",
}

export const ProcessTypeLabels: Record<ProcessType, string> = {
  [ProcessType.COATED_PEANUT_BATCH]: "Coated Peanut Batch",
  [ProcessType.FLOUR_STARCH_POWDER_PREPARATION]: "Flour Starch Powder Preparation",
  [ProcessType.WATER_DIXTRIN_SOLUTION_PREPARATION]: "Water Dextrin Solution Preparation",
  [ProcessType.RAW_PEANUT_FILTER]: "Raw Peanut Filter",
  [ProcessType.PALM_OIL_PREPARATION]: "Palm Oil Preparation",
  [ProcessType.FRYER_FUEL_PREPARATION]: "Fryer Fuel Preparation",
  [ProcessType.SPICES_PREPARATION]: "Spices Preparation",
};