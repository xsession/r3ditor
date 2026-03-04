//! Sheet metal cutting and bending estimators.
//!
//! Models: Fiber laser, CO₂ laser, plasma, waterjet cutting speeds.
//! Press brake: tonnage, bend allowance, springback.

use shared_types::estimation::{BendingEstimation, CuttingMethod, SheetCuttingEstimation};
use shared_types::materials::SheetMaterial;

/// Sheet metal cutting parameters
#[derive(Debug, Clone)]
pub struct CuttingParams {
    pub method: CuttingMethod,
    pub power_watts: f64,      // Laser power or equivalent
    pub thickness_mm: f64,      // Sheet thickness
    pub total_cut_length_mm: f64,
    pub pierce_count: u32,
    pub sheet_width_mm: f64,
    pub sheet_height_mm: f64,
    pub parts_area_mm2: f64,    // Total area of all parts
    pub machine_rate_cents_per_hour: i64,
}

/// Estimate sheet metal cutting
pub fn estimate_cutting(material: &SheetMaterial, params: &CuttingParams) -> SheetCuttingEstimation {
    let k_mat = match params.method {
        CuttingMethod::FiberLaser => material.laser_k_factor,
        CuttingMethod::Co2Laser => material.laser_k_factor,
        CuttingMethod::Plasma => material.plasma_k_factor,
        CuttingMethod::Waterjet => material.waterjet_k_factor,
    };

    let cutting_speed = params.method.cutting_speed(params.power_watts, params.thickness_mm, k_mat);
    let cutting_time = params.total_cut_length_mm / cutting_speed;

    // Pierce time: ~0.5s for laser, ~1s for plasma, ~3s for waterjet
    let pierce_time_each = match params.method {
        CuttingMethod::FiberLaser => 0.5 / 60.0,
        CuttingMethod::Co2Laser => 0.8 / 60.0,
        CuttingMethod::Plasma => 1.0 / 60.0,
        CuttingMethod::Waterjet => 3.0 / 60.0,
    };
    let pierce_time = pierce_time_each * params.pierce_count as f64;

    let sheet_area = params.sheet_width_mm * params.sheet_height_mm;
    let nesting_efficiency = if sheet_area > 0.0 {
        (params.parts_area_mm2 / sheet_area * 100.0).min(100.0)
    } else {
        0.0
    };
    let sheets_required = if nesting_efficiency > 0.0 {
        (100.0 / nesting_efficiency).ceil() as u32
    } else {
        1
    };

    SheetCuttingEstimation {
        cutting_speed_mm_per_min: cutting_speed,
        total_cut_length_mm: params.total_cut_length_mm,
        cutting_time_min: cutting_time,
        pierce_count: params.pierce_count,
        pierce_time_min: pierce_time,
        nesting_efficiency_pct: nesting_efficiency,
        sheets_required,
    }
}

/// Bending parameters
#[derive(Debug, Clone)]
pub struct BendingParams {
    pub thickness_mm: f64,
    pub bend_length_mm: f64,
    pub bend_angle_deg: f64,
    pub inner_radius_mm: f64,
    pub die_opening_mm: f64,
}

/// Calculate press brake tonnage
/// T = C × L × t² × σ_u / (W × 1000)
pub fn tonnage(material: &SheetMaterial, params: &BendingParams) -> f64 {
    let c = 1.33; // V-die bending constant
    let l = params.bend_length_mm;
    let t = params.thickness_mm;
    let sigma_u = material.tensile_strength_mpa;
    let w = params.die_opening_mm;
    c * l * t * t * sigma_u / (w * 1000.0)
}

/// Calculate bend allowance
/// BA = (π/180) × θ × (r + k × t)
pub fn bend_allowance(material: &SheetMaterial, params: &BendingParams) -> f64 {
    let theta = params.bend_angle_deg;
    let r = params.inner_radius_mm;
    let k = material.bend_k_factor;
    let t = params.thickness_mm;
    (std::f64::consts::PI / 180.0) * theta * (r + k * t)
}

/// Calculate springback angle correction
/// α_correction = σ_y × t / (2 × E × r)
pub fn springback_correction(material: &SheetMaterial, params: &BendingParams) -> f64 {
    let sigma_y = material.yield_strength_mpa;
    let t = params.thickness_mm;
    let e = material.elastic_modulus_gpa * 1000.0; // Convert to MPa
    let r = params.inner_radius_mm;

    if r > 0.0 {
        (sigma_y * t / (2.0 * e * r)).to_degrees()
    } else {
        0.0
    }
}

/// Full bending estimation
pub fn estimate_bending(
    material: &SheetMaterial,
    bends: &[BendingParams],
    time_per_bend_min: f64,
) -> BendingEstimation {
    let bend_allowances: Vec<f64> = bends.iter().map(|b| bend_allowance(material, b)).collect();
    let springback_corrections: Vec<f64> = bends
        .iter()
        .map(|b| springback_correction(material, b))
        .collect();

    let max_tonnage = bends
        .iter()
        .map(|b| tonnage(material, b))
        .fold(0.0f64, f64::max);

    BendingEstimation {
        tonnage_tons: max_tonnage,
        bend_count: bends.len() as u32,
        bending_time_min: bends.len() as f64 * time_per_bend_min,
        bend_allowances,
        springback_corrections,
    }
}
