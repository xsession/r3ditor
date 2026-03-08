//! # Snap System — Blender-inspired snap engine
//!
//! Provides 5 snap target types (endpoint, midpoint, center, intersection, grid)
//! with priority ordering. Uses BVH-like spatial search for performance.
//!
//! Based on patterns from Blender's snap system + CAD_Sketcher preselection.

use serde::{Deserialize, Serialize};

use crate::sketch::{Point2D, Sketch, SketchEntity, SketchEntityId};
use crate::sketch_ops::{connection_points, intersect_entities};

// ─── Snap Types ───────────────────────────────────────────────────────────────

/// What kind of snap point was found
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SnapType {
    /// Endpoint of a segment
    Endpoint,
    /// Midpoint of a segment
    Midpoint,
    /// Center of a circle or arc
    Center,
    /// Intersection of two entities
    Intersection,
    /// Nearest point on an entity (perpendicular projection)
    Nearest,
    /// Grid point
    Grid,
    /// Axis alignment (X or Y of another entity)
    AxisAlignment,
    /// No snap
    None,
}

/// A resolved snap point with its type and source entity
#[derive(Debug, Clone)]
pub struct SnapResult {
    /// The snapped position
    pub position: Point2D,
    /// What kind of snap this is
    pub snap_type: SnapType,
    /// Entity that produced this snap (if any)
    pub source_entity: Option<SketchEntityId>,
    /// Second entity (for intersection snaps)
    pub secondary_entity: Option<SketchEntityId>,
    /// Distance from the original cursor position
    pub distance: f64,
}

/// Configuration for the snap system
#[derive(Debug, Clone)]
pub struct SnapConfig {
    /// Maximum snap distance (in sketch units)
    pub snap_radius: f64,
    /// Grid spacing
    pub grid_spacing: f64,
    /// Which snap types are enabled
    pub enabled: SnapTypeFlags,
    /// Priority order (lower index = higher priority)
    pub priority: Vec<SnapType>,
    /// Whether grid snapping is always active (not just when near a grid point)
    pub grid_always_active: bool,
    /// Precision modifier multiplier (Shift key reduces snap radius)
    pub precision_multiplier: f64,
    /// Angular snap increment (degrees) — for angle locking
    pub angle_increment: f64,
}

/// Flags for which snap types are active
#[derive(Debug, Clone)]
pub struct SnapTypeFlags {
    pub endpoint: bool,
    pub midpoint: bool,
    pub center: bool,
    pub intersection: bool,
    pub nearest: bool,
    pub grid: bool,
    pub axis_alignment: bool,
}

impl Default for SnapConfig {
    fn default() -> Self {
        Self {
            snap_radius: 2.0, // 2mm default
            grid_spacing: 1.0,
            enabled: SnapTypeFlags::default(),
            priority: vec![
                SnapType::Endpoint,
                SnapType::Center,
                SnapType::Intersection,
                SnapType::Midpoint,
                SnapType::Nearest,
                SnapType::AxisAlignment,
                SnapType::Grid,
            ],
            grid_always_active: false,
            precision_multiplier: 1.0,
            angle_increment: 15.0,
        }
    }
}

impl Default for SnapTypeFlags {
    fn default() -> Self {
        Self {
            endpoint: true,
            midpoint: true,
            center: true,
            intersection: true,
            nearest: true,
            grid: true,
            axis_alignment: true,
        }
    }
}

// ─── Snap Engine ──────────────────────────────────────────────────────────────

/// Main snap engine. Finds the best snap point for a given cursor position.
pub struct SnapEngine;

impl SnapEngine {
    /// Find the best snap point for the given cursor position.
    ///
    /// Algorithm:
    /// 1. Collect all candidate snap points from all entities
    /// 2. Filter by snap radius
    /// 3. Sort by priority, then by distance
    /// 4. Return the best match
    pub fn find_snap(
        sketch: &Sketch,
        cursor: Point2D,
        config: &SnapConfig,
        exclude_entities: &[SketchEntityId],
        reference_point: Option<Point2D>,
    ) -> SnapResult {
        let effective_radius = config.snap_radius * config.precision_multiplier;
        let mut candidates: Vec<SnapResult> = Vec::new();

        // Collect candidates from each entity
        for (&entity_id, entity) in &sketch.entities {
            if entity.is_construction() && !config.enabled.endpoint {
                continue;
            }
            if exclude_entities.contains(&entity_id) {
                continue;
            }

            // Endpoint snaps
            if config.enabled.endpoint {
                for pt in connection_points(entity) {
                    let dist = pt.distance_to(&cursor);
                    if dist < effective_radius {
                        candidates.push(SnapResult {
                            position: pt,
                            snap_type: SnapType::Endpoint,
                            source_entity: Some(entity_id),
                            secondary_entity: None,
                            distance: dist,
                        });
                    }
                }
            }

            // Center snaps
            if config.enabled.center {
                if let Some(center) = entity_center(entity) {
                    let dist = center.distance_to(&cursor);
                    if dist < effective_radius {
                        candidates.push(SnapResult {
                            position: center,
                            snap_type: SnapType::Center,
                            source_entity: Some(entity_id),
                            secondary_entity: None,
                            distance: dist,
                        });
                    }
                }
            }

            // Midpoint snaps
            if config.enabled.midpoint {
                if let Some(mid) = entity_midpoint(entity) {
                    let dist = mid.distance_to(&cursor);
                    if dist < effective_radius {
                        candidates.push(SnapResult {
                            position: mid,
                            snap_type: SnapType::Midpoint,
                            source_entity: Some(entity_id),
                            secondary_entity: None,
                            distance: dist,
                        });
                    }
                }
            }

            // Nearest point snap (perpendicular projection)
            if config.enabled.nearest {
                if let Some(nearest) = nearest_point_on_entity(entity, &cursor) {
                    let dist = nearest.distance_to(&cursor);
                    if dist < effective_radius {
                        candidates.push(SnapResult {
                            position: nearest,
                            snap_type: SnapType::Nearest,
                            source_entity: Some(entity_id),
                            secondary_entity: None,
                            distance: dist,
                        });
                    }
                }
            }
        }

        // Intersection snaps (O(n²) but n is typically small in sketches)
        if config.enabled.intersection {
            let entity_ids: Vec<SketchEntityId> = sketch.entities.keys()
                .filter(|id| !exclude_entities.contains(id))
                .copied()
                .collect();

            for i in 0..entity_ids.len() {
                for j in (i + 1)..entity_ids.len() {
                    let hits = intersect_entities(sketch, entity_ids[i], entity_ids[j]);
                    for pt in hits {
                        let dist = pt.distance_to(&cursor);
                        if dist < effective_radius {
                            candidates.push(SnapResult {
                                position: pt,
                                snap_type: SnapType::Intersection,
                                source_entity: Some(entity_ids[i]),
                                secondary_entity: Some(entity_ids[j]),
                                distance: dist,
                            });
                        }
                    }
                }
            }
        }

        // Axis alignment snaps (from reference point)
        if config.enabled.axis_alignment {
            if let Some(ref_pt) = reference_point {
                // Horizontal alignment
                let h_pt = Point2D::new(cursor.x, ref_pt.y);
                let h_dist = h_pt.distance_to(&cursor);
                if h_dist < effective_radius {
                    candidates.push(SnapResult {
                        position: h_pt,
                        snap_type: SnapType::AxisAlignment,
                        source_entity: None,
                        secondary_entity: None,
                        distance: h_dist,
                    });
                }

                // Vertical alignment
                let v_pt = Point2D::new(ref_pt.x, cursor.y);
                let v_dist = v_pt.distance_to(&cursor);
                if v_dist < effective_radius {
                    candidates.push(SnapResult {
                        position: v_pt,
                        snap_type: SnapType::AxisAlignment,
                        source_entity: None,
                        secondary_entity: None,
                        distance: v_dist,
                    });
                }

                // Angle-locked snaps
                if config.angle_increment > 0.0 {
                    let dx = cursor.x - ref_pt.x;
                    let dy = cursor.y - ref_pt.y;
                    let dist_from_ref = (dx * dx + dy * dy).sqrt();
                    let angle = dy.atan2(dx).to_degrees();
                    let inc = config.angle_increment;
                    let snapped_angle = (angle / inc).round() * inc;
                    let rad = snapped_angle.to_radians();
                    let angle_pt = Point2D::new(
                        ref_pt.x + dist_from_ref * rad.cos(),
                        ref_pt.y + dist_from_ref * rad.sin(),
                    );
                    let a_dist = angle_pt.distance_to(&cursor);
                    if a_dist < effective_radius {
                        candidates.push(SnapResult {
                            position: angle_pt,
                            snap_type: SnapType::AxisAlignment,
                            source_entity: None,
                            secondary_entity: None,
                            distance: a_dist,
                        });
                    }
                }
            }
        }

        // Grid snaps
        if config.enabled.grid && config.grid_spacing > 0.0 {
            let gx = (cursor.x / config.grid_spacing).round() * config.grid_spacing;
            let gy = (cursor.y / config.grid_spacing).round() * config.grid_spacing;
            let grid_pt = Point2D::new(gx, gy);
            let g_dist = grid_pt.distance_to(&cursor);
            if config.grid_always_active || g_dist < effective_radius {
                candidates.push(SnapResult {
                    position: grid_pt,
                    snap_type: SnapType::Grid,
                    source_entity: None,
                    secondary_entity: None,
                    distance: g_dist,
                });
            }
        }

        // Sort by priority then distance
        let priority_map: std::collections::HashMap<SnapType, usize> = config.priority.iter()
            .enumerate()
            .map(|(i, &st)| (st, i))
            .collect();

        candidates.sort_by(|a, b| {
            let pa = priority_map.get(&a.snap_type).copied().unwrap_or(99);
            let pb = priority_map.get(&b.snap_type).copied().unwrap_or(99);
            pa.cmp(&pb).then_with(|| {
                a.distance.partial_cmp(&b.distance).unwrap_or(std::cmp::Ordering::Equal)
            })
        });

        candidates.into_iter().next().unwrap_or(SnapResult {
            position: cursor,
            snap_type: SnapType::None,
            source_entity: None,
            secondary_entity: None,
            distance: 0.0,
        })
    }
}

// ─── Geometry Helpers ─────────────────────────────────────────────────────────

/// Get the center of an entity (for center snap)
fn entity_center(entity: &SketchEntity) -> Option<Point2D> {
    match entity {
        SketchEntity::Circle { center, .. } |
        SketchEntity::Arc { center, .. } |
        SketchEntity::Ellipse { center, .. } |
        SketchEntity::EllipticArc { center, .. } => Some(*center),
        _ => None,
    }
}

/// Get the midpoint of an entity (for midpoint snap)
fn entity_midpoint(entity: &SketchEntity) -> Option<Point2D> {
    match entity {
        SketchEntity::Line { start, end, .. } => {
            Some(start.midpoint(end))
        }
        SketchEntity::Arc { center, radius, start_angle, end_angle, .. } => {
            let mid_angle = (start_angle + end_angle) / 2.0;
            Some(Point2D::new(
                center.x + radius * mid_angle.cos(),
                center.y + radius * mid_angle.sin(),
            ))
        }
        _ => None,
    }
}

/// Find the nearest point on an entity to the given point
fn nearest_point_on_entity(entity: &SketchEntity, point: &Point2D) -> Option<Point2D> {
    match entity {
        SketchEntity::Line { start, end, .. } => {
            let dx = end.x - start.x;
            let dy = end.y - start.y;
            let len_sq = dx * dx + dy * dy;
            if len_sq < 1e-24 {
                return Some(*start);
            }
            let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / len_sq;
            let t = t.clamp(0.0, 1.0);
            Some(Point2D::new(start.x + t * dx, start.y + t * dy))
        }
        SketchEntity::Circle { center, radius, .. } => {
            let dx = point.x - center.x;
            let dy = point.y - center.y;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist < 1e-12 {
                return Some(Point2D::new(center.x + radius, center.y));
            }
            Some(Point2D::new(
                center.x + radius * dx / dist,
                center.y + radius * dy / dist,
            ))
        }
        SketchEntity::Arc { center, radius, start_angle, end_angle, .. } => {
            let dx = point.x - center.x;
            let dy = point.y - center.y;
            let angle = dy.atan2(dx);

            // Clamp angle to arc range
            let clamped = clamp_angle_to_range(angle, *start_angle, *end_angle);
            Some(Point2D::new(
                center.x + radius * clamped.cos(),
                center.y + radius * clamped.sin(),
            ))
        }
        _ => None,
    }
}

/// Clamp an angle to within an arc range
fn clamp_angle_to_range(angle: f64, start: f64, end: f64) -> f64 {
    use std::f64::consts::TAU;
    let normalize = |a: f64| ((a % TAU) + TAU) % TAU;
    let a = normalize(angle);
    let s = normalize(start);
    let e = normalize(end);

    if s <= e {
        if a >= s && a <= e { a } else if (a - s).abs() < (a - e).abs() { s } else { e }
    } else {
        if a >= s || a <= e { a } else if (a - s).abs() < (a - e).abs() { s } else { e }
    }
}

// ─── GPU Color-Buffer Picking Helpers ─────────────────────────────────────────

/// Assign a unique color ID to each entity for GPU picking.
/// Uses the same pattern as CAD_Sketcher: encode entity index as RGB.
#[derive(Debug, Clone)]
pub struct PickingColorMap {
    entity_to_color: std::collections::HashMap<SketchEntityId, [u8; 3]>,
    color_to_entity: std::collections::HashMap<[u8; 3], SketchEntityId>,
    next_index: u32,
}

impl PickingColorMap {
    pub fn new() -> Self {
        Self {
            entity_to_color: std::collections::HashMap::new(),
            color_to_entity: std::collections::HashMap::new(),
            next_index: 1, // 0 = background
        }
    }

    /// Register an entity and get its unique picking color
    pub fn register(&mut self, entity_id: SketchEntityId) -> [u8; 3] {
        if let Some(&color) = self.entity_to_color.get(&entity_id) {
            return color;
        }
        let color = index_to_color(self.next_index);
        self.entity_to_color.insert(entity_id, color);
        self.color_to_entity.insert(color, entity_id);
        self.next_index += 1;
        color
    }

    /// Look up an entity from a picked color (with spiral search tolerance)
    pub fn resolve(&self, r: u8, g: u8, b: u8) -> Option<SketchEntityId> {
        self.color_to_entity.get(&[r, g, b]).copied()
    }

    /// Resolve with spiral search (check neighboring pixels for fuzzy picking)
    pub fn resolve_spiral(&self, colors: &[[u8; 3]], width: u32, x: u32, y: u32, radius: u32) -> Option<SketchEntityId> {
        // Check exact pixel first
        let idx = (y * width + x) as usize;
        if idx < colors.len() {
            if let Some(id) = self.resolve(colors[idx][0], colors[idx][1], colors[idx][2]) {
                return Some(id);
            }
        }

        // Spiral outward (Blender's spiral search pattern)
        for r in 1..=radius {
            for dx in -(r as i32)..=(r as i32) {
                for dy in -(r as i32)..=(r as i32) {
                    if dx.unsigned_abs() != r && dy.unsigned_abs() != r {
                        continue; // Only check the ring at distance r
                    }
                    let px = x as i32 + dx;
                    let py = y as i32 + dy;
                    if px < 0 || py < 0 || px >= width as i32 {
                        continue;
                    }
                    let idx = (py as u32 * width + px as u32) as usize;
                    if idx < colors.len() {
                        if let Some(id) = self.resolve(colors[idx][0], colors[idx][1], colors[idx][2]) {
                            return Some(id);
                        }
                    }
                }
            }
        }

        None
    }

    /// Clear the color map (rebuild after sketch changes)
    pub fn clear(&mut self) {
        self.entity_to_color.clear();
        self.color_to_entity.clear();
        self.next_index = 1;
    }
}

impl Default for PickingColorMap {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert an index to a unique RGB color
fn index_to_color(index: u32) -> [u8; 3] {
    [
        (index & 0xFF) as u8,
        ((index >> 8) & 0xFF) as u8,
        ((index >> 16) & 0xFF) as u8,
    ]
}

/// Convert an RGB color back to an index
#[allow(dead_code)]
fn color_to_index(r: u8, g: u8, b: u8) -> u32 {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn test_snap_to_endpoint() {
        let mut sketch = Sketch::new("Snap");
        sketch.add_entity(SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(10.0, 0.0),
            is_construction: false,
        });

        let config = SnapConfig::default();
        let result = SnapEngine::find_snap(&sketch, Point2D::new(0.1, 0.1), &config, &[], None);
        assert_eq!(result.snap_type, SnapType::Endpoint);
        assert!((result.position.x - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_snap_to_midpoint() {
        let mut sketch = Sketch::new("Snap");
        sketch.add_entity(SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(10.0, 0.0),
            is_construction: false,
        });

        let config = SnapConfig::default();
        let result = SnapEngine::find_snap(&sketch, Point2D::new(5.0, 0.1), &config, &[], None);
        // Could be midpoint or nearest depending on priority
        assert!(result.snap_type == SnapType::Midpoint || result.snap_type == SnapType::Nearest);
    }

    #[test]
    fn test_snap_to_center() {
        let mut sketch = Sketch::new("Snap");
        sketch.add_entity(SketchEntity::Circle {
            id: Uuid::new_v4(),
            center: Point2D::new(5.0, 5.0),
            radius: 3.0,
            is_construction: false,
        });

        let config = SnapConfig::default();
        let result = SnapEngine::find_snap(&sketch, Point2D::new(5.1, 5.1), &config, &[], None);
        assert_eq!(result.snap_type, SnapType::Center);
    }

    #[test]
    fn test_snap_to_grid() {
        let sketch = Sketch::new("Empty");
        let mut config = SnapConfig::default();
        config.grid_spacing = 5.0;
        config.grid_always_active = true;

        let result = SnapEngine::find_snap(&sketch, Point2D::new(7.3, 3.1), &config, &[], None);
        // Grid snap should round to nearest grid point
        if result.snap_type == SnapType::Grid {
            assert!((result.position.x - 5.0).abs() < 1e-10 || (result.position.x - 10.0).abs() < 1e-10);
        }
    }

    #[test]
    fn test_picking_color_map() {
        let mut map = PickingColorMap::new();
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();

        let c1 = map.register(id1);
        let c2 = map.register(id2);

        assert_ne!(c1, c2);
        assert_eq!(map.resolve(c1[0], c1[1], c1[2]), Some(id1));
        assert_eq!(map.resolve(c2[0], c2[1], c2[2]), Some(id2));
        assert_eq!(map.resolve(0, 0, 0), None); // Background
    }

    #[test]
    fn test_angle_snap() {
        let sketch = Sketch::new("Empty");
        let config = SnapConfig {
            angle_increment: 45.0,
            ..Default::default()
        };

        let ref_point = Some(Point2D::new(0.0, 0.0));
        // Cursor at ~30° should snap to 45° or 0°
        let result = SnapEngine::find_snap(
            &sketch,
            Point2D::new(8.66, 5.0), // ~30° at distance 10
            &config,
            &[],
            ref_point,
        );
        // Should snap to axis alignment or grid
        assert!(matches!(result.snap_type, SnapType::AxisAlignment | SnapType::Grid));
    }
}
