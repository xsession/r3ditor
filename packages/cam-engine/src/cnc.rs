//! CNC machining estimators using physics-based models.
//!
//! Models: Kienzle (cutting force), Taylor (tool life), Loewen-Shaw (thermal),
//! Altintas (chatter stability), surface finish prediction.

use shared_types::estimation::{CncCostBreakdown, CncEstimation};
use shared_types::materials::CncMaterial;

/// CNC machining parameters
#[derive(Debug, Clone)]
pub struct CncParams {
    /// Depth of cut (mm)
    pub depth_of_cut: f64,
    /// Feed per tooth (mm/tooth)
    pub feed_per_tooth: f64,
    /// Cutting speed (m/min)
    pub cutting_speed: f64,
    /// Number of flutes on the tool
    pub num_flutes: u32,
    /// Tool diameter (mm)
    pub tool_diameter: f64,
    /// Tool nose radius (mm)
    pub nose_radius: f64,
    /// Spindle efficiency (0.0 - 1.0)
    pub spindle_efficiency: f64,
    /// Maximum spindle power (kW)
    pub max_spindle_power: f64,
    /// Material volume to remove (cm³)
    pub material_volume_cm3: f64,
    /// Machine hourly rate (cents/hour)
    pub machine_rate_cents_per_hour: i64,
    /// Setup time (min)
    pub setup_time_min: f64,
}

impl Default for CncParams {
    fn default() -> Self {
        Self {
            depth_of_cut: 2.0,
            feed_per_tooth: 0.1,
            cutting_speed: 200.0,
            num_flutes: 3,
            tool_diameter: 10.0,
            nose_radius: 0.4,
            spindle_efficiency: 0.85,
            max_spindle_power: 15.0,
            material_volume_cm3: 50.0,
            machine_rate_cents_per_hour: 8500,
            setup_time_min: 30.0,
        }
    }
}

/// Calculate cutting force using Kienzle model
/// Fc = kc1.1 × b × h^(1 - mc)
pub fn kienzle_cutting_force(material: &CncMaterial, params: &CncParams) -> f64 {
    let b = params.depth_of_cut; // chip width (mm)
    let h = params.feed_per_tooth; // chip thickness (mm)
    material.kc11 * b * h.powf(1.0 - material.mc)
}

/// Calculate spindle RPM from cutting speed
pub fn spindle_rpm(cutting_speed_m_per_min: f64, tool_diameter_mm: f64) -> f64 {
    (cutting_speed_m_per_min * 1000.0) / (std::f64::consts::PI * tool_diameter_mm)
}

/// Calculate material removal rate (cm³/min)
/// MRR = min(MRR_geom, P_spindle × η / kc)
pub fn material_removal_rate(material: &CncMaterial, params: &CncParams) -> f64 {
    let rpm = spindle_rpm(params.cutting_speed, params.tool_diameter);
    let feed_rate = params.feed_per_tooth * params.num_flutes as f64 * rpm; // mm/min

    // Geometric MRR (mm³/min → cm³/min)
    let mrr_geom = params.depth_of_cut * params.tool_diameter * feed_rate / 1000.0;

    // Power-limited MRR
    let kc = material.kc11 * params.feed_per_tooth.powf(-material.mc);
    let mrr_power =
        (params.max_spindle_power * params.spindle_efficiency * 1e6) / kc / 1000.0; // cm³/min

    mrr_geom.min(mrr_power)
}

/// Calculate tool life using Taylor equation
/// V × T^n = C → T = (C/V)^(1/n)
pub fn taylor_tool_life(material: &CncMaterial, cutting_speed_m_per_min: f64) -> f64 {
    (material.taylor_c / cutting_speed_m_per_min).powf(1.0 / material.taylor_n)
}

/// Calculate cutting temperature using Loewen-Shaw model
/// θ = 0.754 × μ × V × Fc / (k × √lc)
pub fn loewen_shaw_temperature(
    material: &CncMaterial,
    cutting_force_n: f64,
    cutting_speed_m_per_min: f64,
    contact_length_mm: f64,
) -> f64 {
    let mu = 0.4; // friction coefficient (typical)
    let v = cutting_speed_m_per_min / 60.0; // m/s
    let k = material.thermal_conductivity_w_per_mk;
    let lc = contact_length_mm / 1000.0; // convert to meters

    0.754 * mu * v * cutting_force_n / (k * lc.sqrt())
}

/// Calculate surface roughness Ra
/// Ra = f² / (32 × r_nose)
pub fn surface_roughness_ra(feed_per_tooth: f64, nose_radius: f64) -> f64 {
    feed_per_tooth.powi(2) / (32.0 * nose_radius)
}

/// Calculate chatter stability limit using Altintas model
/// a_lim = -1 / (2 × Kf × Re[G(jωc)])
pub fn altintas_chatter_limit(
    material: &CncMaterial,
    params: &CncParams,
    transfer_function_real: f64,
) -> f64 {
    let kf = material.kc11 * params.feed_per_tooth.powf(-material.mc);
    if transfer_function_real.abs() < 1e-10 {
        return f64::MAX; // Stable at all depths
    }
    -1.0 / (2.0 * kf * transfer_function_real)
}

/// Full CNC estimation combining all models
pub fn estimate_cnc(material: &CncMaterial, params: &CncParams) -> CncEstimation {
    let cutting_force = kienzle_cutting_force(material, params);
    let mrr = material_removal_rate(material, params);
    let machining_time = params.material_volume_cm3 / mrr;
    let tool_life = taylor_tool_life(material, params.cutting_speed);
    let cutting_temp = loewen_shaw_temperature(
        material,
        cutting_force,
        params.cutting_speed,
        params.feed_per_tooth * 3.0, // approximate contact length
    );
    let ra = surface_roughness_ra(params.feed_per_tooth, params.nose_radius);
    let chatter_limit = altintas_chatter_limit(material, params, -1e-7);

    let rpm = spindle_rpm(params.cutting_speed, params.tool_diameter);
    let spindle_power = cutting_force * params.cutting_speed / (60.0 * 1000.0 * params.spindle_efficiency);

    // Cost calculation
    let total_time = params.setup_time_min + machining_time;
    let machining_cost = (total_time / 60.0 * params.machine_rate_cents_per_hour as f64) as i64;
    let material_cost = (params.material_volume_cm3 * material.density_g_per_cm3 * 0.05) as i64; // ~$0.05/g
    let tool_changes = (machining_time / tool_life).ceil() as i64;
    let tool_cost = tool_changes * 500; // ~$5 per tool

    CncEstimation {
        cutting_force_n: cutting_force,
        mrr_cm3_per_min: mrr,
        machining_time_min: machining_time,
        spindle_power_kw: spindle_power,
        tool_life_min: tool_life,
        cutting_temp_c: cutting_temp,
        surface_roughness_ra: ra,
        chatter_limit_mm: chatter_limit.abs(),
        cost: CncCostBreakdown {
            material_cost_cents: material_cost,
            machining_cost_cents: machining_cost,
            tool_cost_cents: tool_cost,
            setup_cost_cents: (params.setup_time_min / 60.0 * params.machine_rate_cents_per_hour as f64) as i64,
            finishing_cost_cents: 0,
            total_cents: material_cost + machining_cost + tool_cost,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shared_types::materials::{default_cnc_materials, Machinability};

    #[test]
    fn test_kienzle_aluminum() {
        let al6061 = default_cnc_materials()
            .into_iter()
            .find(|m| m.id == "al6061")
            .unwrap();
        let params = CncParams::default();
        let fc = kienzle_cutting_force(&al6061, &params);
        assert!(fc > 0.0);
        assert!(fc < 5000.0); // reasonable range for aluminum
    }

    #[test]
    fn test_taylor_tool_life() {
        let al6061 = default_cnc_materials()
            .into_iter()
            .find(|m| m.id == "al6061")
            .unwrap();
        let life = taylor_tool_life(&al6061, 200.0);
        assert!(life > 0.0);
    }
}
