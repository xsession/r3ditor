//! Cost estimation types and physics-based models.

use serde::{Deserialize, Serialize};

/// CNC machining estimation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CncEstimation {
    /// Kienzle cutting force Fc (N)
    pub cutting_force_n: f64,
    /// Material removal rate (cm³/min)
    pub mrr_cm3_per_min: f64,
    /// Estimated machining time (min)
    pub machining_time_min: f64,
    /// Spindle power required (kW)
    pub spindle_power_kw: f64,
    /// Taylor tool life (min)
    pub tool_life_min: f64,
    /// Loewen-Shaw cutting temperature (°C)
    pub cutting_temp_c: f64,
    /// Surface roughness Ra (μm)
    pub surface_roughness_ra: f64,
    /// Altintas chatter stability limit (mm)
    pub chatter_limit_mm: f64,
    /// Total cost breakdown
    pub cost: CncCostBreakdown,
}

/// CNC cost breakdown
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CncCostBreakdown {
    pub material_cost_cents: i64,
    pub machining_cost_cents: i64,
    pub tool_cost_cents: i64,
    pub setup_cost_cents: i64,
    pub finishing_cost_cents: i64,
    pub total_cents: i64,
}

/// Sheet metal cutting estimation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetCuttingEstimation {
    /// Cutting speed (mm/min)
    pub cutting_speed_mm_per_min: f64,
    /// Total cut length (mm)
    pub total_cut_length_mm: f64,
    /// Cutting time (min)
    pub cutting_time_min: f64,
    /// Pierce count
    pub pierce_count: u32,
    /// Pierce time total (min)
    pub pierce_time_min: f64,
    /// Nesting efficiency (%)
    pub nesting_efficiency_pct: f64,
    /// Sheet utilization
    pub sheets_required: u32,
}

/// Sheet metal bending estimation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BendingEstimation {
    /// Required tonnage (tons)
    pub tonnage_tons: f64,
    /// Bend count
    pub bend_count: u32,
    /// Total bending time (min)
    pub bending_time_min: f64,
    /// Bend allowance per bend (mm)
    pub bend_allowances: Vec<f64>,
    /// Springback angle correction (degrees)
    pub springback_corrections: Vec<f64>,
}

/// Cutting method
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CuttingMethod {
    FiberLaser,
    Co2Laser,
    Plasma,
    Waterjet,
}

impl CuttingMethod {
    /// Compute cutting speed (mm/min) given power/current, thickness, and material factor
    pub fn cutting_speed(&self, power_or_current: f64, thickness_mm: f64, k_mat: f64) -> f64 {
        match self {
            CuttingMethod::FiberLaser => {
                (power_or_current / thickness_mm.powf(1.6)) * k_mat
            }
            CuttingMethod::Co2Laser => {
                (power_or_current / thickness_mm.powf(1.6)) * k_mat * 0.75
            }
            CuttingMethod::Plasma => {
                (power_or_current / thickness_mm.powf(0.8)) * k_mat
            }
            CuttingMethod::Waterjet => {
                // power_or_current = pump pressure, k_mat already accounts for hardness
                (power_or_current / thickness_mm.powf(1.2)) * k_mat
            }
        }
    }
}

/// Full quote estimation combining all processes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteEstimation {
    pub cnc: Option<CncEstimation>,
    pub cutting: Option<SheetCuttingEstimation>,
    pub bending: Option<BendingEstimation>,
    pub total_cost_cents: i64,
    pub lead_time_days: i32,
}
