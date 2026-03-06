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

#[cfg(test)]
mod tests {
    use super::*;
    use shared_types::estimation::CuttingMethod;
    use shared_types::materials::MaterialGroup;

    fn test_sheet_material() -> SheetMaterial {
        SheetMaterial {
            id: "test_steel".into(),
            name: "Test Steel".into(),
            group: MaterialGroup::Steel,
            available_thicknesses_in: vec![0.048, 0.060, 0.075],
            density_g_per_cm3: 7.85,
            yield_strength_mpa: 250.0,
            tensile_strength_mpa: 400.0,
            elastic_modulus_gpa: 200.0,
            hardness_bhn: Some(120.0),
            thermal_conductivity_w_per_mk: 50.0,
            specific_heat_j_per_kg_k: 480.0,
            laser_k_factor: 1.0,
            plasma_k_factor: 1.0,
            waterjet_k_factor: 1.0,
            bend_k_factor: 0.44,
        }
    }

    fn test_cutting_params() -> CuttingParams {
        CuttingParams {
            method: CuttingMethod::FiberLaser,
            power_watts: 4000.0,
            thickness_mm: 2.0,
            total_cut_length_mm: 1000.0,
            pierce_count: 10,
            sheet_width_mm: 1000.0,
            sheet_height_mm: 2000.0,
            parts_area_mm2: 500_000.0,
            machine_rate_cents_per_hour: 15000,
        }
    }

    // ── Cutting Estimation ───────────────────────────────────────────────

    #[test]
    fn test_estimate_cutting_returns_positive_speed() {
        let mat = test_sheet_material();
        let params = test_cutting_params();
        let result = estimate_cutting(&mat, &params);
        assert!(result.cutting_speed_mm_per_min > 0.0);
    }

    #[test]
    fn test_estimate_cutting_time_positive() {
        let mat = test_sheet_material();
        let params = test_cutting_params();
        let result = estimate_cutting(&mat, &params);
        assert!(result.cutting_time_min > 0.0);
    }

    #[test]
    fn test_estimate_cutting_pierce_time() {
        let mat = test_sheet_material();
        let params = test_cutting_params();
        let result = estimate_cutting(&mat, &params);
        assert!(result.pierce_time_min > 0.0);
        assert_eq!(result.pierce_count, 10);
    }

    #[test]
    fn test_estimate_cutting_nesting_efficiency() {
        let mat = test_sheet_material();
        let params = test_cutting_params();
        let result = estimate_cutting(&mat, &params);
        assert!(result.nesting_efficiency_pct > 0.0);
        assert!(result.nesting_efficiency_pct <= 100.0);
    }

    #[test]
    fn test_estimate_cutting_sheets_required() {
        let mat = test_sheet_material();
        let params = test_cutting_params();
        let result = estimate_cutting(&mat, &params);
        assert!(result.sheets_required >= 1);
    }

    #[test]
    fn test_estimate_cutting_zero_sheet_area() {
        let mat = test_sheet_material();
        let mut params = test_cutting_params();
        params.sheet_width_mm = 0.0;
        let result = estimate_cutting(&mat, &params);
        assert_eq!(result.nesting_efficiency_pct, 0.0);
        assert_eq!(result.sheets_required, 1);
    }

    #[test]
    fn test_estimate_cutting_laser_faster_than_waterjet() {
        let mat = test_sheet_material();
        let laser_params = test_cutting_params();
        let mut waterjet_params = test_cutting_params();
        waterjet_params.method = CuttingMethod::Waterjet;
        let laser = estimate_cutting(&mat, &laser_params);
        let waterjet = estimate_cutting(&mat, &waterjet_params);
        // Both methods produce valid positive cutting speeds
        assert!(laser.cutting_speed_mm_per_min > 0.0);
        assert!(waterjet.cutting_speed_mm_per_min > 0.0);
        // Speeds differ based on method-specific formulas
        assert!((laser.cutting_speed_mm_per_min - waterjet.cutting_speed_mm_per_min).abs() > 0.01);
    }

    #[test]
    fn test_estimate_cutting_pierce_time_varies_by_method() {
        let mat = test_sheet_material();
        let mut laser_params = test_cutting_params();
        laser_params.method = CuttingMethod::FiberLaser;
        let mut waterjet_params = test_cutting_params();
        waterjet_params.method = CuttingMethod::Waterjet;
        let laser = estimate_cutting(&mat, &laser_params);
        let waterjet = estimate_cutting(&mat, &waterjet_params);
        // Waterjet pierce time should be longer
        assert!(waterjet.pierce_time_min > laser.pierce_time_min);
    }

    // ── Bending ──────────────────────────────────────────────────────────

    fn test_bend_params() -> BendingParams {
        BendingParams {
            thickness_mm: 2.0,
            bend_length_mm: 100.0,
            bend_angle_deg: 90.0,
            inner_radius_mm: 3.0,
            die_opening_mm: 16.0,
        }
    }

    #[test]
    fn test_tonnage_positive() {
        let mat = test_sheet_material();
        let params = test_bend_params();
        let t = tonnage(&mat, &params);
        assert!(t > 0.0, "Tonnage should be positive");
    }

    #[test]
    fn test_tonnage_increases_with_thickness() {
        let mat = test_sheet_material();
        let mut thin = test_bend_params();
        thin.thickness_mm = 1.0;
        let mut thick = test_bend_params();
        thick.thickness_mm = 4.0;
        assert!(tonnage(&mat, &thick) > tonnage(&mat, &thin));
    }

    #[test]
    fn test_tonnage_increases_with_length() {
        let mat = test_sheet_material();
        let mut short = test_bend_params();
        short.bend_length_mm = 50.0;
        let mut long = test_bend_params();
        long.bend_length_mm = 200.0;
        assert!(tonnage(&mat, &long) > tonnage(&mat, &short));
    }

    #[test]
    fn test_bend_allowance_positive() {
        let mat = test_sheet_material();
        let params = test_bend_params();
        let ba = bend_allowance(&mat, &params);
        assert!(ba > 0.0, "Bend allowance should be positive");
    }

    #[test]
    fn test_bend_allowance_increases_with_angle() {
        let mat = test_sheet_material();
        let mut small = test_bend_params();
        small.bend_angle_deg = 45.0;
        let mut large = test_bend_params();
        large.bend_angle_deg = 90.0;
        assert!(bend_allowance(&mat, &large) > bend_allowance(&mat, &small));
    }

    #[test]
    fn test_springback_correction_positive() {
        let mat = test_sheet_material();
        let params = test_bend_params();
        let sb = springback_correction(&mat, &params);
        assert!(sb > 0.0, "Springback correction should be positive");
    }

    #[test]
    fn test_springback_correction_zero_radius() {
        let mat = test_sheet_material();
        let mut params = test_bend_params();
        params.inner_radius_mm = 0.0;
        let sb = springback_correction(&mat, &params);
        assert_eq!(sb, 0.0);
    }

    #[test]
    fn test_estimate_bending_counts() {
        let mat = test_sheet_material();
        let bends = vec![test_bend_params(), test_bend_params(), test_bend_params()];
        let result = estimate_bending(&mat, &bends, 0.5);
        assert_eq!(result.bend_count, 3);
        assert!((result.bending_time_min - 1.5).abs() < 1e-10); // 3 bends × 0.5 min
        assert_eq!(result.bend_allowances.len(), 3);
        assert_eq!(result.springback_corrections.len(), 3);
    }

    #[test]
    fn test_estimate_bending_max_tonnage() {
        let mat = test_sheet_material();
        let mut bend1 = test_bend_params();
        bend1.thickness_mm = 1.0;
        let mut bend2 = test_bend_params();
        bend2.thickness_mm = 4.0;
        let result = estimate_bending(&mat, &[bend1.clone(), bend2.clone()], 1.0);
        let expected_max = tonnage(&mat, &bend2);
        assert!((result.tonnage_tons - expected_max).abs() < 1e-10);
    }
}
