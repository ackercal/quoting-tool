export interface Project {
  id: number;
  name: string;
  quantity_of_assemblies: number;
  material_type: string | null;
  ht_type: string | null;
  internal_margin: number;
  year_of_execution: number;
  assembly_pp_internal: number;
  assembly_pp_external: number;
  assembly_first_part_setup: number;
  setup_splitting_hrs: number;
  shipping_cost: number;
  osp_margin: number;
  labor_constants: string;
  internal_notes: string | null;
  is_active: number;
  author_email: string | null;
  author_name: string | null;
  access_tag: string;
  parts_count?: number;
  quoted_price?: number | null;
  pricing_stale?: boolean;
  created_at: string;
  updated_at: string;
  parts?: Part[];
}

export interface Me {
  email: string;
  display_name: string;
  is_admin: boolean;
  access_scope: string;
  acknowledged_version: string | null;
}

export interface AppUser {
  email: string;
  display_name: string | null;
  is_admin: boolean;
  access_scope: string;
  acknowledged_version: string | null;
  first_seen: string;
  last_seen: string;
  access_count: number;
}

export interface Part {
  id: number;
  project_id: number;
  name: string;
  quantity_per_assembly: number;
  skirted_geometry_file: string | null;
  minimum_thickness_mm: number | null;
  on_cell_surface_finish_ra: number | null;
  profile_tolerance_mm: number | null;
  forming_time_hrs: number;
  scanning_time_hrs: number;
  cutting_time_hrs: number;
  stress_relief_time_hrs: number;
  est_pre_if_procedures: number;
  est_if_procedures: number;
  sheet_type: string | null;
  parts_per_sheet: number;
  cost_per_sheet: number;
  ht_cost_per_part: number;
  unistrut: number;
  robot_strength: string;
  pp_internal: number;
  pp_external: number;
  first_part_additional_setup: number;
  setup_skirt_path_plan_sim_hrs: number;
  shipping_cost_per_part: number;
  manufacturing_method: string;
  other_mfg_internal: number;
  other_mfg_cost: number;
  other_mfg_cost_dup: number;
  custom_robot_cost_per_hr: number | null;
  internal_notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PartBreakdown {
  pre_if_trials: number;
  if_trials: number;
  rpe_setup: number;
  purchaser_setup: number;
  pm_setup: number;
  prep_shipping: number;
  unistrut: number;
  purchaser_overhead: number;
  pm_overhead: number;
  post_processing: number;
  final_scan_cut_scan: number;
}

export interface DupBreakdown {
  duplicate_procedure: number;
  prep_shipping: number;
  unistrut: number;
  purchaser_overhead: number;
  pm_overhead: number;
  post_processing: number;
}

export interface CategoryBreakdown {
  labor: number;
  robot: number;
  materials: number;
  heat_treat: number;
  shipping: number;
  non_roboformed: number;
}

export interface PartCostDetail {
  first_assembly: number;
  dup_assembly: number;
  first_part_cost: number;
  dup_part_cost: number;
  first_breakdown: PartBreakdown;
  dup_breakdown: DupBreakdown;
  first_category_breakdown: CategoryBreakdown;
  dup_category_breakdown: CategoryBreakdown;
  first_detailed_breakdown?: [string, number][];
  dup_detailed_breakdown?: [string, number][];
}

export interface YearPrice {
  quoted_price: number;
  total_cost: number;
  first_assembly_price: number;
  dup_assembly_price: number;
}

export interface Snapshot {
  id: number;
  project_id: number;
  created_at: string;
  created_by: string | null;
  label: string | null;
  pricing_version: string | null;
  pricing_summary: string | null;
  quoted_price: number | null;
  is_active: boolean;
  is_reconstructed: boolean;
}

export interface PriceHistoryRow {
  effective: string | null; // when this pricing became live; null = earliest/original
  rates: { Small: number; Medium: number; Large: number };
  quoted_price: number;
  first_assembly_price: number;
  dup_assembly_price: number;
  is_current: boolean;
}

export interface ProjectEdit {
  id: number;
  project_id: number;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  summary: string | null;
}

export interface QuoteResult {
  total_cost: number;
  quoted_price: number;
  first_assembly_cost: number;
  dup_assembly_cost: number;
  first_assembly_price: number;
  dup_assembly_price: number;
  num_dup_assemblies: number;
  rpe_splitting: number;
  proj_purchaser: number;
  proj_pm: number;
  margin: number;
  part_details: PartCostDetail[];
  year_prices: Record<number, YearPrice>;
  project_category_breakdown?: CategoryBreakdown;
  project: Project;
  parts: Part[];
  // snapshot / versioning metadata (added by the snapshot layer)
  snapshot?: Snapshot;
  stale?: boolean;
  current_pricing_summary?: string;
  current_pricing_version?: string;
  current_preview?: {
    quoted_price: number;
    first_assembly_price: number;
    dup_assembly_price: number;
    year_prices: Record<number, YearPrice>;
  };
}

export interface Constant {
  key: string;
  value: number;
  description: string | null;
  category: string | null;
}
