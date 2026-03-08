//! # Sketch Operations — CAD_Sketcher-inspired algorithms
//!
//! Implements the advanced sketch operations extracted from Blender's CAD_Sketcher addon:
//! - **Entity Walker** — path finding via shared connection points
//! - **Trim** — split a segment at intersection points nearest to a click
//! - **Bevel** — create a fillet arc at a point shared by two segments
//! - **Offset** — create a parallel copy of a connected path
//! - **Bezier Converter** — convert sketch entities to cubic bezier curves
//! - **Sketch→Mesh** — tessellate sketch profiles into triangle meshes

use std::collections::HashMap;
use uuid::Uuid;

use crate::sketch::{Point2D, Sketch, SketchConstraint, SketchEntity, SketchEntityId, PointOnEntity};

// ─── Connection Points (CAD_Sketcher entity.connection_points()) ──────────────

/// Returns the topological connection points of an entity — the endpoints
/// that can be shared with other entities to form paths.
pub fn connection_points(entity: &SketchEntity) -> Vec<Point2D> {
    match entity {
        SketchEntity::Point { position, .. } => vec![*position],
        SketchEntity::Line { start, end, .. } => vec![*start, *end],
        SketchEntity::Arc { center, radius, start_angle, end_angle, .. } => {
            let p1 = Point2D::new(
                center.x + radius * start_angle.cos(),
                center.y + radius * start_angle.sin(),
            );
            let p2 = Point2D::new(
                center.x + radius * end_angle.cos(),
                center.y + radius * end_angle.sin(),
            );
            vec![p1, p2]
        }
        SketchEntity::Circle { .. } => vec![], // Closed — no free endpoints
        SketchEntity::Ellipse { .. } => vec![], // Closed
        SketchEntity::EllipticArc { center, semi_major, semi_minor, rotation, start_angle, end_angle, .. } => {
            let cos_r = rotation.cos();
            let sin_r = rotation.sin();
            let point_at = |angle: f64| {
                let x = semi_major * angle.cos();
                let y = semi_minor * angle.sin();
                Point2D::new(
                    center.x + x * cos_r - y * sin_r,
                    center.y + x * sin_r + y * cos_r,
                )
            };
            vec![point_at(*start_angle), point_at(*end_angle)]
        }
        SketchEntity::BSpline { control_points, .. } => {
            if control_points.len() >= 2 {
                vec![control_points[0], *control_points.last().unwrap()]
            } else {
                vec![]
            }
        }
    }
}

/// Returns true if the entity is a segment (has two connection points, i.e., is a path entity)
pub fn is_segment(entity: &SketchEntity) -> bool {
    matches!(entity,
        SketchEntity::Line { .. } |
        SketchEntity::Arc { .. } |
        SketchEntity::EllipticArc { .. } |
        SketchEntity::BSpline { .. }
    )
}

/// Returns true if the entity is closed (circle, ellipse)
pub fn is_closed(entity: &SketchEntity) -> bool {
    matches!(entity, SketchEntity::Circle { .. } | SketchEntity::Ellipse { .. })
}

// ─── Point-Entity Adjacency Map (CAD_Sketcher walker.point_entity_mapping) ────

const POINT_TOLERANCE: f64 = 1e-6;

/// Build a mapping from discretized point locations to the entities that share them.
/// This is the foundation for path walking.
pub fn point_entity_mapping(sketch: &Sketch) -> HashMap<PointKey, Vec<SketchEntityId>> {
    let mut map: HashMap<PointKey, Vec<SketchEntityId>> = HashMap::new();
    for (&id, entity) in &sketch.entities {
        if entity.is_construction() || !is_segment(entity) {
            continue;
        }
        for pt in connection_points(entity) {
            let key = PointKey::from(pt);
            map.entry(key).or_default().push(id);
        }
    }
    map
}

/// Discretized point key for HashMap lookups (snapped to tolerance grid)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PointKey {
    pub x: i64,
    pub y: i64,
}

impl PointKey {
    pub fn from(pt: Point2D) -> Self {
        let scale = 1.0 / POINT_TOLERANCE;
        Self {
            x: (pt.x * scale).round() as i64,
            y: (pt.y * scale).round() as i64,
        }
    }
}

// ─── Entity Walker (CAD_Sketcher utilities/walker.py) ─────────────────────────

/// A discovered path of connected sketch segments
#[derive(Debug, Clone)]
pub struct SketchPath {
    /// Ordered list of entity IDs forming the path
    pub segments: Vec<SketchEntityId>,
    /// Direction flags: true = entity traversed in its natural direction
    pub directions: Vec<bool>,
    /// Whether the path forms a closed loop
    pub cyclic: bool,
}

/// Walks sketch entities to discover connected paths via shared endpoints.
/// Equivalent to CAD_Sketcher's `EntityWalker._run()`.
pub fn find_paths(sketch: &Sketch) -> Vec<SketchPath> {
    let adj = point_entity_mapping(sketch);
    let mut unvisited: Vec<SketchEntityId> = sketch.entities.iter()
        .filter(|(_, e)| !e.is_construction() && is_segment(e))
        .map(|(&id, _)| id)
        .collect();

    // Also handle closed entities (circles) as single-entity paths
    let mut paths = Vec::new();
    for (&id, entity) in &sketch.entities {
        if entity.is_construction() {
            continue;
        }
        if is_closed(entity) {
            paths.push(SketchPath {
                segments: vec![id],
                directions: vec![true],
                cyclic: true,
            });
            unvisited.retain(|&uid| uid != id);
        }
    }

    while !unvisited.is_empty() {
        let start = unvisited[0];
        let mut path_segments = Vec::new();
        let mut path_directions = Vec::new();
        walker(sketch, &adj, start, &mut unvisited, &mut path_segments, &mut path_directions, None);

        if path_segments.is_empty() {
            // Entity couldn't be walked (orphan point?)
            unvisited.retain(|&uid| uid != start);
            continue;
        }

        let cyclic = is_cyclic_path(sketch, &path_segments);
        paths.push(SketchPath {
            segments: path_segments,
            directions: path_directions,
            cyclic,
        });
    }

    paths
}

/// Recursive path walker — follows entities through shared connection points
fn walker(
    sketch: &Sketch,
    adj: &HashMap<PointKey, Vec<SketchEntityId>>,
    entity_id: SketchEntityId,
    unvisited: &mut Vec<SketchEntityId>,
    path: &mut Vec<SketchEntityId>,
    directions: &mut Vec<bool>,
    ignore_point: Option<PointKey>,
) {
    if !unvisited.contains(&entity_id) {
        return;
    }
    unvisited.retain(|&uid| uid != entity_id);
    path.push(entity_id);

    let entity = match sketch.entities.get(&entity_id) {
        Some(e) => e,
        None => {
            directions.push(true);
            return;
        }
    };

    let cps = connection_points(entity);
    let direction = if let Some(ref ignore) = ignore_point {
        // If we entered through the start point, we're going forward
        cps.first().map(|p| &PointKey::from(*p) != ignore).unwrap_or(true)
    } else {
        true
    };
    directions.push(direction);

    for pt in &cps {
        let key = PointKey::from(*pt);
        if Some(key) == ignore_point {
            continue;
        }
        if let Some(connected) = adj.get(&key) {
            for &connected_id in connected {
                if unvisited.contains(&connected_id) {
                    walker(sketch, adj, connected_id, unvisited, path, directions, Some(key));
                    return; // Follow one path (no branching in simple walker)
                }
            }
        }
    }
}

/// Check if first and last segments share a connection point → closed path
fn is_cyclic_path(sketch: &Sketch, segments: &[SketchEntityId]) -> bool {
    if segments.len() < 2 {
        return false;
    }
    let first = match sketch.entities.get(&segments[0]) {
        Some(e) => e,
        None => return false,
    };
    let last = match sketch.entities.get(segments.last().unwrap()) {
        Some(e) => e,
        None => return false,
    };
    let first_pts = connection_points(first);
    let last_pts = connection_points(last);
    for fp in &first_pts {
        for lp in &last_pts {
            if fp.distance_to(lp) < POINT_TOLERANCE {
                return true;
            }
        }
    }
    false
}

/// Get the longest path, preferring closed paths (CAD_Sketcher walker.main_path)
pub fn main_path(paths: &[SketchPath]) -> Option<&SketchPath> {
    // Prefer closed paths
    let closed: Vec<&SketchPath> = paths.iter().filter(|p| p.cyclic).collect();
    if let Some(longest_closed) = closed.iter().max_by_key(|p| p.segments.len()) {
        return Some(longest_closed);
    }
    paths.iter().max_by_key(|p| p.segments.len())
}

// ─── Entity Intersections (CAD_Sketcher entity.intersect()) ───────────────────

/// Intersection result between two sketch entities
#[derive(Debug, Clone)]
pub struct Intersection {
    pub point: Point2D,
    /// The entity that was intersected with
    pub other_entity: SketchEntityId,
    /// Is this an endpoint of the source segment?
    pub is_endpoint: bool,
}

/// Find all intersection points between a segment and another entity
pub fn intersect_entities(sketch: &Sketch, entity_a: SketchEntityId, entity_b: SketchEntityId) -> Vec<Point2D> {
    let ea = match sketch.entities.get(&entity_a) {
        Some(e) => e,
        None => return vec![],
    };
    let eb = match sketch.entities.get(&entity_b) {
        Some(e) => e,
        None => return vec![],
    };

    match (ea, eb) {
        (SketchEntity::Line { start: s1, end: e1, .. },
         SketchEntity::Line { start: s2, end: e2, .. }) => {
            line_line_intersection(*s1, *e1, *s2, *e2).into_iter().collect()
        }
        (SketchEntity::Line { start, end, .. },
         SketchEntity::Circle { center, radius, .. }) |
        (SketchEntity::Circle { center, radius, .. },
         SketchEntity::Line { start, end, .. }) => {
            line_circle_intersection(*start, *end, *center, *radius)
        }
        (SketchEntity::Line { start, end, .. },
         SketchEntity::Arc { center, radius, start_angle, end_angle, .. }) |
        (SketchEntity::Arc { center, radius, start_angle, end_angle, .. },
         SketchEntity::Line { start, end, .. }) => {
            line_arc_intersection(*start, *end, *center, *radius, *start_angle, *end_angle)
        }
        (SketchEntity::Circle { center: c1, radius: r1, .. },
         SketchEntity::Circle { center: c2, radius: r2, .. }) => {
            circle_circle_intersection(*c1, *r1, *c2, *r2)
        }
        _ => vec![], // Other combinations: TODO
    }
}

/// Line-line intersection (finite segments)
fn line_line_intersection(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D) -> Option<Point2D> {
    let dx_a = a2.x - a1.x;
    let dy_a = a2.y - a1.y;
    let dx_b = b2.x - b1.x;
    let dy_b = b2.y - b1.y;

    let denom = dx_a * dy_b - dy_a * dx_b;
    if denom.abs() < 1e-12 {
        return None; // Parallel or coincident
    }

    let t = ((b1.x - a1.x) * dy_b - (b1.y - a1.y) * dx_b) / denom;
    let u = ((b1.x - a1.x) * dy_a - (b1.y - a1.y) * dx_a) / denom;

    if (0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u) {
        Some(Point2D::new(a1.x + t * dx_a, a1.y + t * dy_a))
    } else {
        None
    }
}

/// Line-circle intersection (finite line segment vs circle)
fn line_circle_intersection(p1: Point2D, p2: Point2D, center: Point2D, radius: f64) -> Vec<Point2D> {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let fx = p1.x - center.x;
    let fy = p1.y - center.y;

    let a = dx * dx + dy * dy;
    let b = 2.0 * (fx * dx + fy * dy);
    let c = fx * fx + fy * fy - radius * radius;

    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return vec![];
    }

    let mut results = Vec::new();
    let sqrt_d = discriminant.sqrt();
    for t in [(-b - sqrt_d) / (2.0 * a), (-b + sqrt_d) / (2.0 * a)] {
        if (0.0..=1.0).contains(&t) {
            results.push(Point2D::new(p1.x + t * dx, p1.y + t * dy));
        }
    }
    results
}

/// Line-arc intersection
fn line_arc_intersection(
    p1: Point2D, p2: Point2D,
    center: Point2D, radius: f64,
    start_angle: f64, end_angle: f64,
) -> Vec<Point2D> {
    let circle_hits = line_circle_intersection(p1, p2, center, radius);
    circle_hits.into_iter().filter(|pt| {
        let angle = (pt.y - center.y).atan2(pt.x - center.x);
        angle_in_range(angle, start_angle, end_angle)
    }).collect()
}

/// Circle-circle intersection
fn circle_circle_intersection(c1: Point2D, r1: f64, c2: Point2D, r2: f64) -> Vec<Point2D> {
    let d = c1.distance_to(&c2);
    if d > r1 + r2 + 1e-12 || d < (r1 - r2).abs() - 1e-12 || d < 1e-12 {
        return vec![];
    }

    let a = (r1 * r1 - r2 * r2 + d * d) / (2.0 * d);
    let h_sq = r1 * r1 - a * a;
    if h_sq < 0.0 {
        return vec![];
    }
    let h = h_sq.sqrt();

    let px = c1.x + a * (c2.x - c1.x) / d;
    let py = c1.y + a * (c2.y - c1.y) / d;

    if h.abs() < 1e-12 {
        return vec![Point2D::new(px, py)];
    }

    let ox = h * (c2.y - c1.y) / d;
    let oy = h * (c2.x - c1.x) / d;
    vec![
        Point2D::new(px + ox, py - oy),
        Point2D::new(px - ox, py + oy),
    ]
}

/// Check if angle is within [start_angle, end_angle] range (handles wrapping)
fn angle_in_range(angle: f64, start: f64, end: f64) -> bool {
    use std::f64::consts::TAU;
    let normalize = |a: f64| ((a % TAU) + TAU) % TAU;
    let a = normalize(angle);
    let s = normalize(start);
    let e = normalize(end);
    if s <= e {
        a >= s && a <= e
    } else {
        a >= s || a <= e
    }
}

// ─── Distance Along Segment (for trim sorting) ───────────────────────────────

/// Compute parametric distance of a point along a segment from its start
pub fn distance_along_segment(entity: &SketchEntity, point: &Point2D) -> f64 {
    match entity {
        SketchEntity::Line { start, end, .. } => {
            let dx = end.x - start.x;
            let dy = end.y - start.y;
            let len_sq = dx * dx + dy * dy;
            if len_sq < 1e-24 {
                return 0.0;
            }
            let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / len_sq;
            t.clamp(0.0, 1.0)
        }
        SketchEntity::Arc { center, start_angle, end_angle, .. } => {
            let angle = (point.y - center.y).atan2(point.x - center.x);
            let span = end_angle - start_angle;
            if span.abs() < 1e-12 {
                return 0.0;
            }
            let t = (angle - start_angle) / span;
            ((t % 1.0) + 1.0) % 1.0
        }
        _ => 0.0,
    }
}

// ─── Trim Algorithm (CAD_Sketcher utilities/trimming.py) ──────────────────────

/// Result of a trim operation
#[derive(Debug, Clone)]
pub struct TrimResult {
    /// New entities created by the trim
    pub new_entities: Vec<SketchEntity>,
    /// New constraints to add (copied from original)
    pub new_constraints: Vec<SketchConstraint>,
    /// Entity IDs to remove after trim
    pub entities_to_remove: Vec<SketchEntityId>,
}

/// Trim a segment at the two nearest intersection points bracketing the click position.
///
/// Algorithm (from CAD_Sketcher):
/// 1. Find all intersection points between the segment and other sketch entities
/// 2. Add segment endpoints as intersection points
/// 3. Sort intersections by distance_along_segment from the click point
/// 4. Find the two closest non-endpoint intersections bracketing the click
/// 5. Replace the segment portion between those two points
pub fn trim_segment(
    sketch: &Sketch,
    segment_id: SketchEntityId,
    click_pos: Point2D,
) -> Result<TrimResult, String> {
    let segment = sketch.entities.get(&segment_id)
        .ok_or("Segment not found")?;

    if !is_segment(segment) {
        return Err("Entity is not a trimmable segment".into());
    }

    // Collect all intersections
    let mut intersections: Vec<(Point2D, bool)> = Vec::new(); // (point, is_endpoint)

    // Add endpoint intersections
    for pt in connection_points(segment) {
        intersections.push((pt, true));
    }

    // Find intersections with every other entity in the sketch
    for (&other_id, _other_entity) in &sketch.entities {
        if other_id == segment_id {
            continue;
        }
        let hits = intersect_entities(sketch, segment_id, other_id);
        for pt in hits {
            // Skip if too close to an existing endpoint
            let is_near_endpoint = intersections.iter()
                .any(|(ep, is_ep)| *is_ep && ep.distance_to(&pt) < POINT_TOLERANCE);
            if !is_near_endpoint {
                intersections.push((pt, false));
            }
        }
    }

    // Sort by distance along segment from click position
    let click_t = distance_along_segment(segment, &click_pos);
    intersections.sort_by(|a, b| {
        let ta = distance_along_segment(segment, &a.0);
        let tb = distance_along_segment(segment, &b.0);
        let da = (ta - click_t).abs();
        let db = (tb - click_t).abs();
        da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
    });

    // Find the two intersections bracketing the click (one before, one after)
    let all_with_t: Vec<(Point2D, bool, f64)> = intersections.iter()
        .map(|(pt, is_ep)| {
            let t = distance_along_segment(segment, pt);
            (*pt, *is_ep, t)
        })
        .collect();

    let mut sorted_by_t = all_with_t.clone();
    sorted_by_t.sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap());

    // Find the two non-endpoint intersections that bracket click_t
    let non_endpoints: Vec<&(Point2D, bool, f64)> = sorted_by_t.iter()
        .filter(|(_, is_ep, _)| !is_ep)
        .collect();

    if non_endpoints.is_empty() {
        return Err("No intersections found — nothing to trim".into());
    }

    // If only one intersection, trim from that point to the nearest endpoint
    // If multiple, find the bracket
    let (trim_start_t, trim_end_t) = if non_endpoints.len() == 1 {
        let ix_t = non_endpoints[0].2;
        if click_t < ix_t {
            (0.0, ix_t)
        } else {
            (ix_t, 1.0)
        }
    } else {
        // Find the bracket: the intersection just before and just after click_t
        let mut before_t = 0.0_f64;
        let mut after_t = 1.0_f64;
        for ix in &non_endpoints {
            if ix.2 <= click_t && ix.2 > before_t {
                before_t = ix.2;
            }
            if ix.2 >= click_t && ix.2 < after_t {
                after_t = ix.2;
            }
        }
        (before_t, after_t)
    };

    // Create replacement entities for the portions OUTSIDE the trim zone
    let mut result = TrimResult {
        new_entities: Vec::new(),
        new_constraints: Vec::new(),
        entities_to_remove: vec![segment_id],
    };

    match segment {
        SketchEntity::Line { start, end, is_construction, .. } => {
            let dx = end.x - start.x;
            let dy = end.y - start.y;

            // Left portion: [0, trim_start_t]
            if trim_start_t > POINT_TOLERANCE {
                let cut_pt = Point2D::new(start.x + trim_start_t * dx, start.y + trim_start_t * dy);
                result.new_entities.push(SketchEntity::Line {
                    id: Uuid::new_v4(),
                    start: *start,
                    end: cut_pt,
                    is_construction: *is_construction,
                });
            }

            // Right portion: [trim_end_t, 1]
            if trim_end_t < 1.0 - POINT_TOLERANCE {
                let cut_pt = Point2D::new(start.x + trim_end_t * dx, start.y + trim_end_t * dy);
                result.new_entities.push(SketchEntity::Line {
                    id: Uuid::new_v4(),
                    start: cut_pt,
                    end: *end,
                    is_construction: *is_construction,
                });
            }
        }
        SketchEntity::Arc { center, radius, start_angle, end_angle, is_construction, .. } => {
            let span = end_angle - start_angle;

            // Left arc portion
            if trim_start_t > POINT_TOLERANCE {
                result.new_entities.push(SketchEntity::Arc {
                    id: Uuid::new_v4(),
                    center: *center,
                    radius: *radius,
                    start_angle: *start_angle,
                    end_angle: start_angle + trim_start_t * span,
                    is_construction: *is_construction,
                });
            }

            // Right arc portion
            if trim_end_t < 1.0 - POINT_TOLERANCE {
                result.new_entities.push(SketchEntity::Arc {
                    id: Uuid::new_v4(),
                    center: *center,
                    radius: *radius,
                    start_angle: start_angle + trim_end_t * span,
                    end_angle: *end_angle,
                    is_construction: *is_construction,
                });
            }
        }
        _ => {
            return Err("Trim not supported for this entity type".into());
        }
    }

    Ok(result)
}

// ─── Bevel Algorithm (CAD_Sketcher operators/bevel.py) ────────────────────────

/// Result of a bevel (fillet) operation
#[derive(Debug, Clone)]
pub struct BevelResult {
    /// The new arc entity
    pub arc: SketchEntity,
    /// Modified first segment (shortened)
    pub segment_a: SketchEntity,
    /// Modified second segment (shortened)
    pub segment_b: SketchEntity,
    /// Original entity IDs to remove
    pub entities_to_remove: Vec<SketchEntityId>,
}

/// Create a fillet arc at the junction of two line segments.
///
/// Algorithm (from CAD_Sketcher):
/// 1. Find the two segments connected at the picked point
/// 2. Compute offset lines at distance = radius
/// 3. Intersect offset lines to find the arc center
/// 4. Project the center onto each segment to find tangent points
/// 5. Create the arc and shorten both segments
pub fn bevel_at_point(
    sketch: &Sketch,
    point: Point2D,
    radius: f64,
) -> Result<BevelResult, String> {
    // Find segments whose endpoints are near the picked point
    let connected: Vec<(SketchEntityId, &SketchEntity)> = sketch.entities.iter()
        .filter(|(_, e)| !e.is_construction() && is_segment(e))
        .filter(|(_, e)| {
            connection_points(e).iter().any(|p| p.distance_to(&point) < POINT_TOLERANCE * 100.0)
        })
        .map(|(&id, e)| (id, e))
        .collect();

    if connected.len() != 2 {
        return Err(format!("Expected 2 connected segments at point, found {}", connected.len()));
    }

    let (id_a, seg_a) = &connected[0];
    let (id_b, seg_b) = &connected[1];

    // For now, only handle line-line bevels
    match (seg_a, seg_b) {
        (SketchEntity::Line { start: s1, end: e1, is_construction: c1, .. },
         SketchEntity::Line { start: s2, end: e2, is_construction: c2, .. }) => {
            bevel_line_line(*id_a, *s1, *e1, *c1, *id_b, *s2, *e2, *c2, point, radius)
        }
        _ => Err("Bevel currently only supports line-line junctions".into()),
    }
}

/// Line-line bevel implementation
fn bevel_line_line(
    id_a: SketchEntityId, s1: Point2D, e1: Point2D, c1: bool,
    id_b: SketchEntityId, s2: Point2D, e2: Point2D, c2: bool,
    junction: Point2D, radius: f64,
) -> Result<BevelResult, String> {
    // Determine which endpoints are at the junction
    let (far_a, near_a) = if s1.distance_to(&junction) < e1.distance_to(&junction) {
        (e1, s1) // junction is at start
    } else {
        (s1, e1) // junction is at end
    };

    let (far_b, near_b) = if s2.distance_to(&junction) < e2.distance_to(&junction) {
        (e2, s2)
    } else {
        (s2, e2)
    };

    // Direction vectors away from junction
    let dir_a = normalize_vec(far_a.x - near_a.x, far_a.y - near_a.y);
    let dir_b = normalize_vec(far_b.x - near_b.x, far_b.y - near_b.y);

    // Compute tangent points at distance 'radius' from junction along each line
    let tangent_a = Point2D::new(near_a.x + dir_a.0 * radius, near_a.y + dir_a.1 * radius);
    let tangent_b = Point2D::new(near_b.x + dir_b.0 * radius, near_b.y + dir_b.1 * radius);

    // Find arc center: offset each line by radius perpendicular, find intersection
    let normal_a = (-dir_a.1, dir_a.0); // perpendicular
    let normal_b = (-dir_b.1, dir_b.0);

    // Determine which side the arc center should be (bisector direction)
    let bisector = normalize_vec(dir_a.0 + dir_b.0, dir_a.1 + dir_b.1);

    // Arc center is at radius distance from both lines
    // Use offset line intersection
    let offset_a1 = Point2D::new(near_a.x + normal_a.0 * radius, near_a.y + normal_a.1 * radius);
    let offset_a2 = Point2D::new(far_a.x + normal_a.0 * radius, far_a.y + normal_a.1 * radius);
    let offset_b1 = Point2D::new(near_b.x + normal_b.0 * radius, near_b.y + normal_b.1 * radius);
    let offset_b2 = Point2D::new(far_b.x + normal_b.0 * radius, far_b.y + normal_b.1 * radius);

    // Try both offset directions
    let center = line_line_intersection_unbounded(offset_a1, offset_a2, offset_b1, offset_b2)
        .or_else(|| {
            let offset_a1n = Point2D::new(near_a.x - normal_a.0 * radius, near_a.y - normal_a.1 * radius);
            let offset_a2n = Point2D::new(far_a.x - normal_a.0 * radius, far_a.y - normal_a.1 * radius);
            let offset_b1n = Point2D::new(near_b.x - normal_b.0 * radius, near_b.y - normal_b.1 * radius);
            let offset_b2n = Point2D::new(far_b.x - normal_b.0 * radius, far_b.y - normal_b.1 * radius);
            line_line_intersection_unbounded(offset_a1n, offset_a2n, offset_b1n, offset_b2n)
        })
        .ok_or("Could not find arc center — lines may be parallel")?;

    // Compute arc angles
    let start_angle = (tangent_a.y - center.y).atan2(tangent_a.x - center.x);
    let end_angle = (tangent_b.y - center.y).atan2(tangent_b.x - center.x);

    // Create the arc
    let arc = SketchEntity::Arc {
        id: Uuid::new_v4(),
        center,
        radius,
        start_angle,
        end_angle,
        is_construction: false,
    };

    // Create shortened segments
    let seg_a_new = SketchEntity::Line {
        id: Uuid::new_v4(),
        start: if s1.distance_to(&junction) < e1.distance_to(&junction) {
            tangent_a
        } else {
            s1
        },
        end: if s1.distance_to(&junction) < e1.distance_to(&junction) {
            e1
        } else {
            tangent_a
        },
        is_construction: c1,
    };

    let seg_b_new = SketchEntity::Line {
        id: Uuid::new_v4(),
        start: if s2.distance_to(&junction) < e2.distance_to(&junction) {
            tangent_b
        } else {
            s2
        },
        end: if s2.distance_to(&junction) < e2.distance_to(&junction) {
            e2
        } else {
            tangent_b
        },
        is_construction: c2,
    };

    Ok(BevelResult {
        arc,
        segment_a: seg_a_new,
        segment_b: seg_b_new,
        entities_to_remove: vec![id_a, id_b],
    })
}

/// Unbounded line-line intersection (for offset line computation)
fn line_line_intersection_unbounded(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D) -> Option<Point2D> {
    let dx_a = a2.x - a1.x;
    let dy_a = a2.y - a1.y;
    let dx_b = b2.x - b1.x;
    let dy_b = b2.y - b1.y;

    let denom = dx_a * dy_b - dy_a * dx_b;
    if denom.abs() < 1e-12 {
        return None;
    }

    let t = ((b1.x - a1.x) * dy_b - (b1.y - a1.y) * dx_b) / denom;
    Some(Point2D::new(a1.x + t * dx_a, a1.y + t * dy_a))
}

fn normalize_vec(x: f64, y: f64) -> (f64, f64) {
    let len = (x * x + y * y).sqrt();
    if len < 1e-12 {
        (0.0, 0.0)
    } else {
        (x / len, y / len)
    }
}

// ─── Offset Algorithm (CAD_Sketcher operators/offset.py) ──────────────────────

/// Result of an offset operation
#[derive(Debug, Clone)]
pub struct OffsetResult {
    /// New entities forming the offset path
    pub new_entities: Vec<SketchEntity>,
}

/// Create an offset copy of a connected path at the given distance.
///
/// Algorithm (from CAD_Sketcher):
/// 1. Use EntityWalker to find the path containing the picked entity
/// 2. For each segment, compute the parallel offset
/// 3. Compute intersection points between consecutive offset segments
/// 4. Create new entities connecting the offset intersections
pub fn offset_path(
    sketch: &Sketch,
    entity_id: SketchEntityId,
    distance: f64,
) -> Result<OffsetResult, String> {
    let entity = sketch.entities.get(&entity_id)
        .ok_or("Entity not found")?;

    // Special case: circle offset = concentric circle
    if let SketchEntity::Circle { center, radius, is_construction, .. } = entity {
        let new_radius = radius + distance;
        if new_radius <= 0.0 {
            return Err("Offset distance too large — would create negative radius".into());
        }
        return Ok(OffsetResult {
            new_entities: vec![SketchEntity::Circle {
                id: Uuid::new_v4(),
                center: *center,
                radius: new_radius,
                is_construction: *is_construction,
            }],
        });
    }

    // Find path containing this entity
    let paths = find_paths(sketch);
    let path = paths.iter()
        .find(|p| p.segments.contains(&entity_id))
        .ok_or("Entity not part of any connected path")?;

    // Compute offset segments
    let mut offset_entities = Vec::new();

    for (i, &seg_id) in path.segments.iter().enumerate() {
        let seg = sketch.entities.get(&seg_id)
            .ok_or("Path segment not found")?;

        match seg {
            SketchEntity::Line { start, end, is_construction, .. } => {
                let dx = end.x - start.x;
                let dy = end.y - start.y;
                let len = (dx * dx + dy * dy).sqrt();
                if len < 1e-12 {
                    continue;
                }
                // Perpendicular direction (offset direction)
                let nx = -dy / len * distance;
                let ny = dx / len * distance;

                offset_entities.push(SketchEntity::Line {
                    id: Uuid::new_v4(),
                    start: Point2D::new(start.x + nx, start.y + ny),
                    end: Point2D::new(end.x + nx, end.y + ny),
                    is_construction: *is_construction,
                });
            }
            SketchEntity::Arc { center, radius, start_angle, end_angle, is_construction, .. } => {
                let new_radius = radius + distance;
                if new_radius <= 0.0 {
                    continue;
                }
                offset_entities.push(SketchEntity::Arc {
                    id: Uuid::new_v4(),
                    center: *center,
                    radius: new_radius,
                    start_angle: *start_angle,
                    end_angle: *end_angle,
                    is_construction: *is_construction,
                });
            }
            _ => {} // Skip unsupported entity types
        }
    }

    // For consecutive offset segments, find their intersections and trim
    // to create a clean offset path
    if offset_entities.len() >= 2 {
        let mut trimmed = Vec::new();
        for i in 0..offset_entities.len() {
            let next_i = (i + 1) % offset_entities.len();
            if next_i == 0 && !path.cyclic {
                trimmed.push(offset_entities[i].clone());
                break;
            }
            // For lines, intersect consecutive offset lines and trim
            let current = &offset_entities[i];
            let _next = &offset_entities[next_i];
            // Simplified: just add the offset segment as-is
            // Full implementation would intersect and trim consecutive segments
            trimmed.push(current.clone());
        }
        return Ok(OffsetResult { new_entities: trimmed });
    }

    Ok(OffsetResult { new_entities: offset_entities })
}

// ─── Bezier Conversion (CAD_Sketcher converters.py) ───────────────────────────

/// A cubic bezier control point set
#[derive(Debug, Clone, Copy)]
pub struct CubicBezierSegment {
    pub p0: Point2D,
    pub p1: Point2D, // Control point 1
    pub p2: Point2D, // Control point 2
    pub p3: Point2D,
}

/// Convert a sketch entity to cubic bezier segments.
/// Uses the optimal approximation formula: q = (4/3) * tan(π / (2n))
pub fn to_bezier(entity: &SketchEntity) -> Vec<CubicBezierSegment> {
    match entity {
        SketchEntity::Line { start, end, .. } => {
            // Line → bezier with coincident control points (straight)
            vec![CubicBezierSegment {
                p0: *start,
                p1: Point2D::new(
                    start.x + (end.x - start.x) / 3.0,
                    start.y + (end.y - start.y) / 3.0,
                ),
                p2: Point2D::new(
                    start.x + 2.0 * (end.x - start.x) / 3.0,
                    start.y + 2.0 * (end.y - start.y) / 3.0,
                ),
                p3: *end,
            }]
        }
        SketchEntity::Arc { center, radius, start_angle, end_angle, .. } => {
            arc_to_bezier(*center, *radius, *start_angle, *end_angle)
        }
        SketchEntity::Circle { center, radius, .. } => {
            // Full circle = 4 quarter-turn bezier segments
            use std::f64::consts::FRAC_PI_2;
            let mut segments = Vec::new();
            for i in 0..4 {
                let sa = FRAC_PI_2 * i as f64;
                let ea = FRAC_PI_2 * (i + 1) as f64;
                segments.extend(arc_to_bezier(*center, *radius, sa, ea));
            }
            segments
        }
        _ => vec![], // BSpline, Ellipse: TODO
    }
}

/// Convert an arc to cubic bezier using the q = (4/3) * tan(π/(2n)) formula
fn arc_to_bezier(center: Point2D, radius: f64, start_angle: f64, end_angle: f64) -> Vec<CubicBezierSegment> {
    use std::f64::consts::FRAC_PI_2;
    let span = end_angle - start_angle;
    let n_segments = ((span.abs() / FRAC_PI_2).ceil() as usize).max(1);

    let mut segments = Vec::new();
    let step = span / n_segments as f64;

    for i in 0..n_segments {
        let sa = start_angle + step * i as f64;
        let ea = sa + step;
        let half = (ea - sa) / 2.0;
        let q = (4.0 / 3.0) * (half / 2.0).tan();

        let p0 = Point2D::new(center.x + radius * sa.cos(), center.y + radius * sa.sin());
        let p3 = Point2D::new(center.x + radius * ea.cos(), center.y + radius * ea.sin());

        // Control points perpendicular to radii at q * radius distance
        let p1 = Point2D::new(
            p0.x - q * radius * sa.sin(),
            p0.y + q * radius * sa.cos(),
        );
        let p2 = Point2D::new(
            p3.x + q * radius * ea.sin(),
            p3.y - q * radius * ea.cos(),
        );

        segments.push(CubicBezierSegment { p0, p1, p2, p3 });
    }

    segments
}

// ─── Sketch → Mesh Conversion (CAD_Sketcher converters.py) ────────────────────

use shared_types::geometry::{TriMesh, BoundingBox3D};
use glam::Vec3;

/// Tessellate a bezier curve into a polyline
pub fn tessellate_bezier(segments: &[CubicBezierSegment], resolution: u32) -> Vec<Point2D> {
    let mut points = Vec::new();
    let steps = resolution.max(2);

    for (i, seg) in segments.iter().enumerate() {
        let start_t = if i == 0 { 0 } else { 1 }; // Skip duplicate start point
        for step in start_t..=steps {
            let t = step as f64 / steps as f64;
            let u = 1.0 - t;
            let x = u * u * u * seg.p0.x + 3.0 * u * u * t * seg.p1.x
                + 3.0 * u * t * t * seg.p2.x + t * t * t * seg.p3.x;
            let y = u * u * u * seg.p0.y + 3.0 * u * u * t * seg.p1.y
                + 3.0 * u * t * t * seg.p2.y + t * t * t * seg.p3.y;
            points.push(Point2D::new(x, y));
        }
    }

    points
}

/// Convert a closed sketch profile to a triangulated mesh (for extrusion preview).
/// Uses simple ear-clipping triangulation.
pub fn sketch_profile_to_mesh(sketch: &Sketch, resolution: u32) -> Option<TriMesh> {
    let paths = find_paths(sketch);
    let path = main_path(&paths)?;

    if !path.cyclic {
        return None; // Need a closed profile
    }

    // Convert each segment to bezier, then tessellate
    let mut polygon = Vec::new();
    for &seg_id in &path.segments {
        let entity = sketch.entities.get(&seg_id)?;
        let bezier_segs = to_bezier(entity);
        let tessellated = tessellate_bezier(&bezier_segs, resolution);
        if polygon.is_empty() {
            polygon.extend(tessellated);
        } else {
            // Skip the first point (should be same as last of previous)
            polygon.extend(tessellated.into_iter().skip(1));
        }
    }

    // Remove last point if it's the same as first (closed)
    if polygon.len() > 2 {
        if polygon.first()?.distance_to(polygon.last()?) < POINT_TOLERANCE {
            polygon.pop();
        }
    }

    if polygon.len() < 3 {
        return None;
    }

    // Ear-clipping triangulation
    let triangles = ear_clip_triangulate(&polygon)?;

    // Build TriMesh with proper [f32; 3] arrays
    let positions: Vec<[f32; 3]> = polygon.iter()
        .map(|p| [p.x as f32, p.y as f32, 0.0_f32])
        .collect();
    let normals: Vec<[f32; 3]> = (0..polygon.len())
        .map(|_| [0.0_f32, 0.0, 1.0])
        .collect();
    let uvs: Vec<[f32; 2]> = polygon.iter()
        .map(|p| [p.x as f32 * 0.1, p.y as f32 * 0.1])
        .collect();

    // Compute bounding box
    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;
    for p in &polygon {
        min_x = min_x.min(p.x as f32);
        min_y = min_y.min(p.y as f32);
        max_x = max_x.max(p.x as f32);
        max_y = max_y.max(p.y as f32);
    }

    Some(TriMesh {
        positions,
        normals,
        uvs: Some(uvs),
        indices: triangles,
        bounds: BoundingBox3D::new(
            Vec3::new(min_x, min_y, 0.0),
            Vec3::new(max_x, max_y, 0.0),
        ),
    })
}

/// Simple ear-clipping polygon triangulation
fn ear_clip_triangulate(polygon: &[Point2D]) -> Option<Vec<u32>> {
    let n = polygon.len();
    if n < 3 {
        return None;
    }

    let mut indices: Vec<usize> = (0..n).collect();
    let mut triangles = Vec::new();

    while indices.len() > 2 {
        let len = indices.len();
        let mut found_ear = false;

        for i in 0..len {
            let prev = indices[(i + len - 1) % len];
            let curr = indices[i];
            let next = indices[(i + 1) % len];

            let a = &polygon[prev];
            let b = &polygon[curr];
            let c = &polygon[next];

            // Check if this is a convex vertex (left turn)
            let cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
            if cross <= 0.0 {
                continue; // Reflex vertex — not an ear
            }

            // Check no other vertex is inside this triangle
            let mut point_inside = false;
            for j in 0..len {
                let idx = indices[j];
                if idx == prev || idx == curr || idx == next {
                    continue;
                }
                if point_in_triangle(&polygon[idx], a, b, c) {
                    point_inside = true;
                    break;
                }
            }

            if !point_inside {
                triangles.push(prev as u32);
                triangles.push(curr as u32);
                triangles.push(next as u32);
                indices.remove(i);
                found_ear = true;
                break;
            }
        }

        if !found_ear {
            break; // Degenerate polygon
        }
    }

    Some(triangles)
}

/// Point-in-triangle test using barycentric coordinates
fn point_in_triangle(p: &Point2D, a: &Point2D, b: &Point2D, c: &Point2D) -> bool {
    let v0x = c.x - a.x;
    let v0y = c.y - a.y;
    let v1x = b.x - a.x;
    let v1y = b.y - a.y;
    let v2x = p.x - a.x;
    let v2y = p.y - a.y;

    let dot00 = v0x * v0x + v0y * v0y;
    let dot01 = v0x * v1x + v0y * v1y;
    let dot02 = v0x * v2x + v0y * v2y;
    let dot11 = v1x * v1x + v1y * v1y;
    let dot12 = v1x * v2x + v1y * v2y;

    let inv_denom = 1.0 / (dot00 * dot11 - dot01 * dot01);
    let u = (dot11 * dot02 - dot01 * dot12) * inv_denom;
    let v = (dot00 * dot12 - dot01 * dot02) * inv_denom;

    u >= 0.0 && v >= 0.0 && u + v <= 1.0
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_points_line() {
        let line = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(10.0, 0.0),
            is_construction: false,
        };
        let pts = connection_points(&line);
        assert_eq!(pts.len(), 2);
        assert!((pts[0].x - 0.0).abs() < 1e-10);
        assert!((pts[1].x - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_connection_points_circle_has_none() {
        let circle = SketchEntity::Circle {
            id: Uuid::new_v4(),
            center: Point2D::new(0.0, 0.0),
            radius: 5.0,
            is_construction: false,
        };
        assert!(connection_points(&circle).is_empty());
    }

    #[test]
    fn test_line_line_intersection() {
        let hit = line_line_intersection(
            Point2D::new(0.0, 0.0), Point2D::new(10.0, 10.0),
            Point2D::new(0.0, 10.0), Point2D::new(10.0, 0.0),
        );
        assert!(hit.is_some());
        let p = hit.unwrap();
        assert!((p.x - 5.0).abs() < 1e-10);
        assert!((p.y - 5.0).abs() < 1e-10);
    }

    #[test]
    fn test_line_circle_intersection() {
        let hits = line_circle_intersection(
            Point2D::new(-10.0, 0.0), Point2D::new(10.0, 0.0),
            Point2D::new(0.0, 0.0), 5.0,
        );
        assert_eq!(hits.len(), 2);
    }

    #[test]
    fn test_find_paths_rectangle() {
        let mut sketch = Sketch::new("Rect");
        let l1 = SketchEntity::Line { id: Uuid::new_v4(), start: Point2D::new(0.0, 0.0), end: Point2D::new(10.0, 0.0), is_construction: false };
        let l2 = SketchEntity::Line { id: Uuid::new_v4(), start: Point2D::new(10.0, 0.0), end: Point2D::new(10.0, 5.0), is_construction: false };
        let l3 = SketchEntity::Line { id: Uuid::new_v4(), start: Point2D::new(10.0, 5.0), end: Point2D::new(0.0, 5.0), is_construction: false };
        let l4 = SketchEntity::Line { id: Uuid::new_v4(), start: Point2D::new(0.0, 5.0), end: Point2D::new(0.0, 0.0), is_construction: false };
        sketch.add_entity(l1);
        sketch.add_entity(l2);
        sketch.add_entity(l3);
        sketch.add_entity(l4);

        let paths = find_paths(&sketch);
        assert_eq!(paths.len(), 1);
        assert!(paths[0].cyclic);
        assert_eq!(paths[0].segments.len(), 4);
    }

    #[test]
    fn test_find_paths_circle() {
        let mut sketch = Sketch::new("Circle");
        sketch.add_entity(SketchEntity::Circle {
            id: Uuid::new_v4(),
            center: Point2D::new(0.0, 0.0),
            radius: 5.0,
            is_construction: false,
        });
        let paths = find_paths(&sketch);
        assert_eq!(paths.len(), 1);
        assert!(paths[0].cyclic);
    }

    #[test]
    fn test_to_bezier_line() {
        let line = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(10.0, 0.0),
            is_construction: false,
        };
        let beziers = to_bezier(&line);
        assert_eq!(beziers.len(), 1);
        assert!((beziers[0].p0.x - 0.0).abs() < 1e-10);
        assert!((beziers[0].p3.x - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_to_bezier_circle() {
        let circle = SketchEntity::Circle {
            id: Uuid::new_v4(),
            center: Point2D::new(0.0, 0.0),
            radius: 5.0,
            is_construction: false,
        };
        let beziers = to_bezier(&circle);
        assert_eq!(beziers.len(), 4); // 4 quarter-turn segments
    }

    #[test]
    fn test_tessellate_bezier() {
        let seg = CubicBezierSegment {
            p0: Point2D::new(0.0, 0.0),
            p1: Point2D::new(1.0, 2.0),
            p2: Point2D::new(3.0, 2.0),
            p3: Point2D::new(4.0, 0.0),
        };
        let pts = tessellate_bezier(&[seg], 10);
        assert_eq!(pts.len(), 11);
        assert!((pts[0].x - 0.0).abs() < 1e-10);
        assert!((pts[10].x - 4.0).abs() < 1e-10);
    }

    #[test]
    fn test_sketch_profile_to_mesh() {
        let mut sketch = Sketch::new("Rect");
        sketch.add_entity(SketchEntity::Line { id: Uuid::new_v4(), start: Point2D::new(0.0, 0.0), end: Point2D::new(10.0, 0.0), is_construction: false });
        sketch.add_entity(SketchEntity::Line { id: Uuid::new_v4(), start: Point2D::new(10.0, 0.0), end: Point2D::new(10.0, 5.0), is_construction: false });
        sketch.add_entity(SketchEntity::Line { id: Uuid::new_v4(), start: Point2D::new(10.0, 5.0), end: Point2D::new(0.0, 5.0), is_construction: false });
        sketch.add_entity(SketchEntity::Line { id: Uuid::new_v4(), start: Point2D::new(0.0, 5.0), end: Point2D::new(0.0, 0.0), is_construction: false });

        let mesh = sketch_profile_to_mesh(&sketch, 4);
        assert!(mesh.is_some());
        let m = mesh.unwrap();
        assert!(!m.indices.is_empty());
    }

    #[test]
    fn test_trim_line_at_intersection() {
        let mut sketch = Sketch::new("Trim");
        let l1 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(20.0, 0.0),
            is_construction: false,
        };
        let l1_id = l1.id();
        let l2 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(5.0, -5.0),
            end: Point2D::new(5.0, 5.0),
            is_construction: false,
        };
        let l3 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(15.0, -5.0),
            end: Point2D::new(15.0, 5.0),
            is_construction: false,
        };
        sketch.add_entity(l1);
        sketch.add_entity(l2);
        sketch.add_entity(l3);

        // Click between the two intersections (at x=10)
        let result = trim_segment(&sketch, l1_id, Point2D::new(10.0, 0.0));
        assert!(result.is_ok());
        let r = result.unwrap();
        // Should create two line segments (0→5 and 15→20)
        assert_eq!(r.new_entities.len(), 2);
        assert_eq!(r.entities_to_remove.len(), 1);
    }

    #[test]
    fn test_bevel_right_angle() {
        let mut sketch = Sketch::new("Bevel");
        let l1 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(10.0, 0.0),
            is_construction: false,
        };
        let l2 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(0.0, 10.0),
            is_construction: false,
        };
        sketch.add_entity(l1);
        sketch.add_entity(l2);

        let result = bevel_at_point(&sketch, Point2D::new(0.0, 0.0), 2.0);
        assert!(result.is_ok());
        let r = result.unwrap();
        assert!(matches!(r.arc, SketchEntity::Arc { .. }));
    }

    #[test]
    fn test_offset_circle() {
        let mut sketch = Sketch::new("Offset");
        let c = SketchEntity::Circle {
            id: Uuid::new_v4(),
            center: Point2D::new(0.0, 0.0),
            radius: 5.0,
            is_construction: false,
        };
        let cid = c.id();
        sketch.add_entity(c);

        let result = offset_path(&sketch, cid, 2.0);
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r.new_entities.len(), 1);
        if let SketchEntity::Circle { radius, .. } = &r.new_entities[0] {
            assert!((radius - 7.0).abs() < 1e-10);
        } else {
            panic!("Expected circle");
        }
    }
}
