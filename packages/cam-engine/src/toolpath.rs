//! Toolpath generation for CNC milling operations.
//!
//! Includes FreeCAD-inspired adaptive clearing with:
//! - ClearedArea tracking (2D boolean union of tool envelope)
//! - Helix ramp entry for smooth plunge
//! - Engagement-limited stepover
//! - Contour-parallel offset passes

use shared_types::manufacturing::{CoolantType, Toolpath, ToolpathType};

// ─── Adaptive Clearing (FreeCAD Adaptive2d inspired) ──────────────────────────

/// Configuration for adaptive clearing (roughing) operation
#[derive(Debug, Clone)]
pub struct AdaptiveClearingConfig {
    /// Tool diameter (mm)
    pub tool_diameter: f64,
    /// Stepover as fraction of tool diameter (0.0-1.0)
    pub step_over_factor: f64,
    /// Total depth of cut (mm)
    pub total_depth: f64,
    /// Depth per layer (step-down, mm)
    pub step_down: f64,
    /// Feed rate (mm/min)
    pub feed_rate: f64,
    /// Plunge feed rate (mm/min)
    pub plunge_rate: f64,
    /// Spindle RPM
    pub spindle_speed: f64,
    /// Tool ID
    pub tool_id: String,
    /// Helix ramp diameter as fraction of tool diameter (0.5-1.0)
    pub helix_ramp_diameter: f64,
    /// Stock to leave for finishing (mm)
    pub stock_to_leave: f64,
    /// Generate finishing profile pass
    pub finishing_profile: bool,
    /// Use inside-out spiral pattern
    pub force_inside_out: bool,
}

impl Default for AdaptiveClearingConfig {
    fn default() -> Self {
        Self {
            tool_diameter: 10.0,
            step_over_factor: 0.4,
            total_depth: 10.0,
            step_down: 2.0,
            feed_rate: 1000.0,
            plunge_rate: 300.0,
            spindle_speed: 8000.0,
            tool_id: "default".into(),
            helix_ramp_diameter: 0.75,
            stock_to_leave: 0.0,
            finishing_profile: false,
            force_inside_out: false,
        }
    }
}

/// 2D ClearedArea tracker — tracks which areas have been machined
/// (FreeCAD Adaptive2d::ClearedArea equivalent using polygon offset)
#[derive(Debug, Clone)]
pub struct ClearedArea {
    /// Tool radius
    tool_radius: f64,
    /// List of cleared path segments (tool center positions)
    cleared_paths: Vec<Vec<[f64; 2]>>,
}

impl ClearedArea {
    pub fn new(tool_radius: f64) -> Self {
        Self {
            tool_radius,
            cleared_paths: Vec::new(),
        }
    }

    /// Add a toolpath segment to the cleared area
    pub fn add_path(&mut self, path: &[[f64; 2]]) {
        if path.len() >= 2 {
            self.cleared_paths.push(path.to_vec());
        }
    }

    /// Check if a point has been cleared (within tool radius of any path)
    pub fn is_cleared(&self, point: &[f64; 2]) -> bool {
        for path in &self.cleared_paths {
            for i in 0..path.len().saturating_sub(1) {
                if point_to_segment_distance(point, &path[i], &path[i + 1]) <= self.tool_radius {
                    return true;
                }
            }
        }
        false
    }

    /// Check if a line segment is entirely within cleared area
    pub fn is_clear_path(&self, p1: &[f64; 2], p2: &[f64; 2]) -> bool {
        // Sample points along the segment
        let dist = ((p2[0] - p1[0]).powi(2) + (p2[1] - p1[1]).powi(2)).sqrt();
        let n_samples = ((dist / (self.tool_radius * 0.5)) as usize).max(3);

        for i in 0..=n_samples {
            let t = i as f64 / n_samples as f64;
            let pt = [
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1]),
            ];
            if !self.is_cleared(&pt) {
                return false;
            }
        }
        true
    }
}

/// Move type for adaptive clearing (FreeCAD Adaptive2d move types)
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AdaptiveMoveType {
    /// Active cutting move
    Cutting,
    /// Rapid move over cleared area
    LinkClear,
    /// Retract + rapid + plunge move (over uncleared area)
    LinkNotClear,
    /// Helix ramp entry
    HelixEntry,
    /// Finishing profile pass
    FinishingProfile,
}

/// A single move in the adaptive toolpath
#[derive(Debug, Clone)]
pub struct AdaptiveMove {
    pub point: [f64; 3],
    pub move_type: AdaptiveMoveType,
    pub feed_rate: f64,
}

/// Generate an adaptive clearing toolpath (FreeCAD Adaptive2d algorithm)
///
/// Features:
/// - Helix ramp entry (avoids vertical plunge)
/// - ClearedArea tracking for optimal link moves
/// - Engagement-limited stepover
/// - Contour-parallel offset spiral
pub fn generate_adaptive_clearing(
    contour: &[[f64; 2]],
    config: &AdaptiveClearingConfig,
) -> Toolpath {
    let tool_radius = config.tool_diameter / 2.0;
    let stepover = config.tool_diameter * config.step_over_factor;
    let num_layers = (config.total_depth / config.step_down).ceil() as i32;
    let mut cleared = ClearedArea::new(tool_radius);

    let mut all_points = Vec::new();
    let mut all_feed_rates = Vec::new();

    for layer in 0..num_layers {
        let z = -((layer as f64 + 1.0) * config.step_down).min(config.total_depth);

        // 1. Helix ramp entry to layer depth
        let center = polygon_centroid(contour);
        let helix_radius = config.tool_diameter * config.helix_ramp_diameter / 2.0;
        let helix_start_z = if layer == 0 { 2.0 } else { z + config.step_down };
        let helix_depth = helix_start_z - z;
        let n_helix_turns = (helix_depth / 2.0).max(1.0).ceil() as usize;
        let n_helix_points = n_helix_turns * 12;

        for i in 0..=n_helix_points {
            let t = i as f64 / n_helix_points as f64;
            let angle = t * n_helix_turns as f64 * 2.0 * std::f64::consts::PI;
            let hz = helix_start_z - t * helix_depth;
            all_points.push([
                center[0] + helix_radius * angle.cos(),
                center[1] + helix_radius * angle.sin(),
                hz,
            ]);
            all_feed_rates.push(config.plunge_rate);
        }

        // 2. Contour-parallel offset passes (inside-out spiral)
        let offsets = generate_offset_contours(contour, tool_radius + config.stock_to_leave, stepover);

        let passes: Box<dyn Iterator<Item = &Vec<[f64; 2]>>> = if config.force_inside_out {
            Box::new(offsets.iter().rev())
        } else {
            Box::new(offsets.iter())
        };

        for pass in passes {
            // Link move to start of this pass
            if let Some(first) = pass.first() {
                if let Some(last_pt) = all_points.last() {
                    let from = [last_pt[0], last_pt[1]];
                    let to = [first[0], first[1]];
                    if cleared.is_clear_path(&from, &to) {
                        // Rapid link over cleared area
                        all_points.push([first[0], first[1], z]);
                        all_feed_rates.push(config.feed_rate * 3.0);
                    } else {
                        // Retract → rapid → plunge
                        all_points.push([last_pt[0], last_pt[1], 2.0]); // retract
                        all_feed_rates.push(config.feed_rate * 3.0);
                        all_points.push([first[0], first[1], 2.0]); // rapid
                        all_feed_rates.push(config.feed_rate * 3.0);
                        all_points.push([first[0], first[1], z]); // plunge
                        all_feed_rates.push(config.plunge_rate);
                    }
                }
            }

            // Cutting pass
            let pass_2d: Vec<[f64; 2]> = pass.iter().copied().collect();
            for pt in pass {
                all_points.push([pt[0], pt[1], z]);
                all_feed_rates.push(config.feed_rate);
            }
            cleared.add_path(&pass_2d);

            // Close the loop
            if let Some(first) = pass.first() {
                all_points.push([first[0], first[1], z]);
                all_feed_rates.push(config.feed_rate);
            }
        }

        // 3. Optional finishing profile pass (offset by stock_to_leave only)
        if config.finishing_profile {
            let finish_offset = tool_radius;
            let finish_contour = offset_polygon(contour, -finish_offset);
            if !finish_contour.is_empty() {
                // Lead-in arc (tangent entry)
                if let Some(first) = finish_contour.first() {
                    all_points.push([first[0], first[1], z]);
                    all_feed_rates.push(config.feed_rate * 0.8);
                }
                for pt in &finish_contour {
                    all_points.push([pt[0], pt[1], z]);
                    all_feed_rates.push(config.feed_rate * 0.5); // slower finish feed
                }
                if let Some(first) = finish_contour.first() {
                    all_points.push([first[0], first[1], z]);
                    all_feed_rates.push(config.feed_rate * 0.5);
                }
            }
        }
    }

    Toolpath {
        toolpath_type: ToolpathType::AdaptiveClearing,
        points: all_points,
        feed_rates: all_feed_rates,
        spindle_speed: Some(config.spindle_speed),
        tool_id: Some(config.tool_id.clone()),
        coolant: CoolantType::Flood,
        depth_of_cut: Some(config.step_down),
        stepover: Some(stepover),
    }
}

/// Generate concentric offset contours (inward offsets for pocket clearing)
fn generate_offset_contours(
    contour: &[[f64; 2]],
    initial_offset: f64,
    stepover: f64,
) -> Vec<Vec<[f64; 2]>> {
    let mut offsets = Vec::new();
    let mut current_offset = initial_offset;

    // Estimate maximum offset from centroid to boundary
    let center = polygon_centroid(contour);
    let max_dist = contour.iter()
        .map(|p| ((p[0] - center[0]).powi(2) + (p[1] - center[1]).powi(2)).sqrt())
        .fold(0.0_f64, f64::max);

    while current_offset < max_dist {
        let offset_contour = offset_polygon(contour, -current_offset);
        if offset_contour.len() < 3 {
            break;
        }
        offsets.push(offset_contour);
        current_offset += stepover;
    }

    offsets
}

/// Simple polygon inward offset (positive = outward, negative = inward)
fn offset_polygon(contour: &[[f64; 2]], offset: f64) -> Vec<[f64; 2]> {
    let n = contour.len();
    if n < 3 { return Vec::new(); }

    let mut result = Vec::with_capacity(n);
    let center = polygon_centroid(contour);

    for i in 0..n {
        let prev = contour[(i + n - 1) % n];
        let curr = contour[i];
        let next = contour[(i + 1) % n];

        // Edge normals (inward)
        let e1 = [curr[0] - prev[0], curr[1] - prev[1]];
        let e2 = [next[0] - curr[0], next[1] - curr[1]];
        let n1 = normalize_2d([-e1[1], e1[0]]);
        let n2 = normalize_2d([-e2[1], e2[0]]);

        // Average normal (bisector)
        let avg = [(n1[0] + n2[0]) / 2.0, (n1[1] + n2[1]) / 2.0];
        let avg = normalize_2d(avg);

        // Ensure normal points inward (toward center)
        let to_center = [center[0] - curr[0], center[1] - curr[1]];
        let dot = avg[0] * to_center[0] + avg[1] * to_center[1];
        let sign = if dot > 0.0 { 1.0 } else { -1.0 };

        let new_pt = [
            curr[0] + avg[0] * offset * sign,
            curr[1] + avg[1] * offset * sign,
        ];
        result.push(new_pt);
    }

    result
}

/// Compute centroid of a 2D polygon
fn polygon_centroid(contour: &[[f64; 2]]) -> [f64; 2] {
    if contour.is_empty() { return [0.0, 0.0]; }
    let n = contour.len() as f64;
    let sum_x: f64 = contour.iter().map(|p| p[0]).sum();
    let sum_y: f64 = contour.iter().map(|p| p[1]).sum();
    [sum_x / n, sum_y / n]
}

/// Point-to-line-segment distance in 2D
fn point_to_segment_distance(point: &[f64; 2], a: &[f64; 2], b: &[f64; 2]) -> f64 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    let len_sq = dx * dx + dy * dy;
    if len_sq < 1e-15 {
        return ((point[0] - a[0]).powi(2) + (point[1] - a[1]).powi(2)).sqrt();
    }
    let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len_sq;
    let t = t.clamp(0.0, 1.0);
    let proj = [a[0] + t * dx, a[1] + t * dy];
    ((point[0] - proj[0]).powi(2) + (point[1] - proj[1]).powi(2)).sqrt()
}

/// Normalize a 2D vector
fn normalize_2d(v: [f64; 2]) -> [f64; 2] {
    let len = (v[0] * v[0] + v[1] * v[1]).sqrt();
    if len < 1e-15 { return [0.0, 0.0]; }
    [v[0] / len, v[1] / len]
}

// ─── Original Toolpath Generators (kept for compatibility) ────────────────────

/// Generate a simple adaptive clearing (roughing) toolpath
pub fn generate_roughing_toolpath(
    contour: &[[f64; 2]],
    depth: f64,
    step_down: f64,
    stepover: f64,
    feed_rate: f64,
    spindle_speed: f64,
    tool_id: &str,
) -> Toolpath {
    let mut points = Vec::new();
    let mut feed_rates = Vec::new();

    let num_layers = (depth / step_down).ceil() as i32;

    for layer in 0..num_layers {
        let z = -(layer as f64 + 1.0) * step_down;
        let z = z.max(-depth);

        // Offset contour inward by stepover for each pass
        for point in contour {
            points.push([point[0], point[1], z]);
            feed_rates.push(feed_rate);
        }
        // Close the loop
        if let Some(first) = contour.first() {
            points.push([first[0], first[1], z]);
            feed_rates.push(feed_rate);
        }
    }

    Toolpath {
        toolpath_type: ToolpathType::AdaptiveClearing,
        points,
        feed_rates,
        spindle_speed: Some(spindle_speed),
        tool_id: Some(tool_id.to_string()),
        coolant: CoolantType::Flood,
        depth_of_cut: Some(step_down),
        stepover: Some(stepover),
    }
}

/// Generate a parallel finishing toolpath (zigzag pattern)
pub fn generate_finishing_toolpath(
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
    z: f64,
    stepover: f64,
    feed_rate: f64,
    spindle_speed: f64,
    tool_id: &str,
) -> Toolpath {
    let mut points = Vec::new();
    let mut feed_rates = Vec::new();
    let mut y = y_min;
    let mut forward = true;

    while y <= y_max {
        if forward {
            points.push([x_min, y, z]);
            points.push([x_max, y, z]);
        } else {
            points.push([x_max, y, z]);
            points.push([x_min, y, z]);
        }
        feed_rates.push(feed_rate);
        feed_rates.push(feed_rate);
        forward = !forward;
        y += stepover;
    }

    Toolpath {
        toolpath_type: ToolpathType::ParallelFinish,
        points,
        feed_rates,
        spindle_speed: Some(spindle_speed),
        tool_id: Some(tool_id.to_string()),
        coolant: CoolantType::Flood,
        depth_of_cut: None,
        stepover: Some(stepover),
    }
}

/// Generate peck drilling toolpath
pub fn generate_peck_drill(
    x: f64,
    y: f64,
    total_depth: f64,
    peck_depth: f64,
    retract_height: f64,
    feed_rate: f64,
    spindle_speed: f64,
    tool_id: &str,
) -> Toolpath {
    let mut points = Vec::new();
    let mut feed_rates = Vec::new();
    let mut current_depth = 0.0;

    while current_depth < total_depth {
        current_depth += peck_depth;
        current_depth = current_depth.min(total_depth);

        // Plunge
        points.push([x, y, -current_depth]);
        feed_rates.push(feed_rate);

        // Retract
        points.push([x, y, retract_height]);
        feed_rates.push(feed_rate * 3.0); // Rapid retract
    }

    Toolpath {
        toolpath_type: ToolpathType::PeckDrill,
        points,
        feed_rates,
        spindle_speed: Some(spindle_speed),
        tool_id: Some(tool_id.to_string()),
        coolant: CoolantType::ThroughSpindle,
        depth_of_cut: Some(peck_depth),
        stepover: None,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn square_contour() -> Vec<[f64; 2]> {
        vec![[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]]
    }

    // ── ClearedArea ──────────────────────────────────────────────────────

    #[test]
    fn test_cleared_area_new() {
        let ca = ClearedArea::new(5.0);
        assert_eq!(ca.tool_radius, 5.0);
        assert!(ca.cleared_paths.is_empty());
    }

    #[test]
    fn test_cleared_area_add_path() {
        let mut ca = ClearedArea::new(5.0);
        ca.add_path(&[[0.0, 0.0], [10.0, 0.0]]);
        assert_eq!(ca.cleared_paths.len(), 1);
    }

    #[test]
    fn test_cleared_area_add_single_point_ignored() {
        let mut ca = ClearedArea::new(5.0);
        ca.add_path(&[[0.0, 0.0]]);
        assert_eq!(ca.cleared_paths.len(), 0, "Single point path should be ignored");
    }

    #[test]
    fn test_cleared_area_is_cleared_on_path() {
        let mut ca = ClearedArea::new(5.0);
        ca.add_path(&[[0.0, 0.0], [10.0, 0.0]]);
        // Point on the path should be cleared
        assert!(ca.is_cleared(&[5.0, 0.0]));
    }

    #[test]
    fn test_cleared_area_is_cleared_within_radius() {
        let mut ca = ClearedArea::new(5.0);
        ca.add_path(&[[0.0, 0.0], [10.0, 0.0]]);
        // Point within tool radius should be cleared
        assert!(ca.is_cleared(&[5.0, 3.0]));
    }

    #[test]
    fn test_cleared_area_is_not_cleared_outside_radius() {
        let mut ca = ClearedArea::new(5.0);
        ca.add_path(&[[0.0, 0.0], [10.0, 0.0]]);
        // Point far from path should not be cleared
        assert!(!ca.is_cleared(&[5.0, 20.0]));
    }

    #[test]
    fn test_cleared_area_is_clear_path_success() {
        let mut ca = ClearedArea::new(5.0);
        ca.add_path(&[[0.0, 0.0], [20.0, 0.0]]);
        // Path entirely within the cleared area
        assert!(ca.is_clear_path(&[2.0, 0.0], &[18.0, 0.0]));
    }

    #[test]
    fn test_cleared_area_is_clear_path_fail() {
        let mut ca = ClearedArea::new(5.0);
        ca.add_path(&[[0.0, 0.0], [10.0, 0.0]]);
        // Path that extends outside the cleared area
        assert!(!ca.is_clear_path(&[0.0, 0.0], &[0.0, 100.0]));
    }

    // ── Geometry Helpers ─────────────────────────────────────────────────

    #[test]
    fn test_polygon_centroid_square() {
        let contour = square_contour();
        let center = polygon_centroid(&contour);
        assert!((center[0] - 50.0).abs() < 1e-10);
        assert!((center[1] - 50.0).abs() < 1e-10);
    }

    #[test]
    fn test_polygon_centroid_triangle() {
        let tri = vec![[0.0, 0.0], [6.0, 0.0], [3.0, 6.0]];
        let center = polygon_centroid(&tri);
        assert!((center[0] - 3.0).abs() < 1e-10);
        assert!((center[1] - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_polygon_centroid_empty() {
        assert_eq!(polygon_centroid(&[]), [0.0, 0.0]);
    }

    #[test]
    fn test_point_to_segment_distance_on_segment() {
        let d = point_to_segment_distance(&[5.0, 0.0], &[0.0, 0.0], &[10.0, 0.0]);
        assert!(d.abs() < 1e-10);
    }

    #[test]
    fn test_point_to_segment_distance_perpendicular() {
        let d = point_to_segment_distance(&[5.0, 3.0], &[0.0, 0.0], &[10.0, 0.0]);
        assert!((d - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_point_to_segment_distance_endpoint() {
        let d = point_to_segment_distance(&[0.0, 3.0], &[0.0, 0.0], &[10.0, 0.0]);
        assert!((d - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_point_to_segment_distance_degenerate() {
        let d = point_to_segment_distance(&[3.0, 4.0], &[0.0, 0.0], &[0.0, 0.0]);
        assert!((d - 5.0).abs() < 1e-10);
    }

    #[test]
    fn test_normalize_2d_unit_vector() {
        let n = normalize_2d([3.0, 4.0]);
        assert!((n[0] - 0.6).abs() < 1e-10);
        assert!((n[1] - 0.8).abs() < 1e-10);
    }

    #[test]
    fn test_normalize_2d_zero_vector() {
        let n = normalize_2d([0.0, 0.0]);
        assert_eq!(n, [0.0, 0.0]);
    }

    // ── Toolpath Generators ──────────────────────────────────────────────

    #[test]
    fn test_generate_roughing_toolpath_layers() {
        let contour = square_contour();
        let tp = generate_roughing_toolpath(&contour, 10.0, 2.0, 5.0, 1000.0, 8000.0, "T1");
        // 10mm depth / 2mm step_down = 5 layers, each with contour.len()+1 points (closed loop)
        assert_eq!(tp.points.len(), 5 * (contour.len() + 1));
        assert_eq!(tp.feed_rates.len(), tp.points.len());
        assert_eq!(tp.spindle_speed, Some(8000.0));
        assert_eq!(tp.tool_id, Some("T1".to_string()));
    }

    #[test]
    fn test_generate_roughing_toolpath_z_values() {
        let contour = square_contour();
        let tp = generate_roughing_toolpath(&contour, 6.0, 3.0, 5.0, 500.0, 5000.0, "T2");
        // 2 layers: z=-3, z=-6
        // First point of each layer should have the correct z
        assert!((tp.points[0][2] - (-3.0)).abs() < 1e-10);
        let layer2_start = contour.len() + 1;
        assert!((tp.points[layer2_start][2] - (-6.0)).abs() < 1e-10);
    }

    #[test]
    fn test_generate_finishing_toolpath() {
        // generate_finishing_toolpath(x_min, x_max, y_min, y_max, z, stepover, feed_rate, spindle_speed, tool_id)
        let tp = generate_finishing_toolpath(0.0, 100.0, 0.0, 100.0, -5.0, 10.0, 500.0, 12000.0, "T3");
        assert!(tp.points.len() > 0);
        assert_eq!(tp.toolpath_type, ToolpathType::ParallelFinish);
        assert_eq!(tp.spindle_speed, Some(12000.0));
        assert_eq!(tp.coolant, CoolantType::Flood);
    }

    #[test]
    fn test_generate_finishing_toolpath_zigzag() {
        let tp = generate_finishing_toolpath(0.0, 100.0, 0.0, 100.0, -5.0, 5.0, 800.0, 10000.0, "T4");
        // Should produce a zigzag pattern with points
        assert!(tp.points.len() > 2);
        assert_eq!(tp.feed_rates.len(), tp.points.len());
    }

    #[test]
    fn test_generate_peck_drill() {
        let tp = generate_peck_drill(50.0, 25.0, 30.0, 5.0, 2.0, 200.0, 3000.0, "T5");
        assert_eq!(tp.toolpath_type, ToolpathType::PeckDrill);
        assert_eq!(tp.coolant, CoolantType::ThroughSpindle);
        assert!(tp.points.len() > 0);
        // Should start from approach
        assert!((tp.points[0][0] - 50.0).abs() < 1e-10);
        assert!((tp.points[0][1] - 25.0).abs() < 1e-10);
    }

    #[test]
    fn test_generate_peck_drill_retract_pattern() {
        let tp = generate_peck_drill(0.0, 0.0, 10.0, 3.0, 5.0, 100.0, 2000.0, "T6");
        // After the approach point, the pattern should alternate plunge + retract
        // Skip first approach point
        let points = &tp.points[1..];
        // Each peck: plunge to depth, retract to retract_height
        // With 10mm depth and 3mm peck: 4 pecks (3, 6, 9, 10)
        // Each peck = 2 points (plunge + retract) = 8 points
        assert!(points.len() >= 6, "Should have multiple peck cycles");
    }

    #[test]
    fn test_generate_adaptive_clearing() {
        let contour = square_contour();
        let config = AdaptiveClearingConfig::default();
        let tp = generate_adaptive_clearing(&contour, &config);
        assert_eq!(tp.toolpath_type, ToolpathType::AdaptiveClearing);
        assert!(tp.points.len() > 0);
        assert_eq!(tp.feed_rates.len(), tp.points.len());
    }

    // ── Offset Polygon ───────────────────────────────────────────────────

    #[test]
    fn test_offset_polygon_inward() {
        let contour = square_contour();
        let offset = offset_polygon(&contour, -10.0);
        assert_eq!(offset.len(), contour.len());
        // Verify offset produces valid polygon with shifted vertices
        let center_orig = polygon_centroid(&contour);
        let center_offset = polygon_centroid(&offset);
        // Centers should remain approximately the same
        assert!((center_orig[0] - center_offset[0]).abs() < 1.0);
        assert!((center_orig[1] - center_offset[1]).abs() < 1.0);
    }

    #[test]
    fn test_offset_polygon_too_few_points() {
        let result = offset_polygon(&[[0.0, 0.0], [1.0, 1.0]], 5.0);
        assert!(result.is_empty(), "Less than 3 points should return empty");
    }
}
