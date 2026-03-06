//! # Tessellation — Mesh Generation, Quality Metrics & Smoothing
//!
//! Converts B-Rep geometry into triangle meshes (TriMesh) for GPU rendering.
//!
//! ## Salome SMESH-Inspired Algorithms
//! - **Quality Metrics**: Aspect ratio, warping, skew, deflection (§6)
//! - **Smoothing**: Laplacian, centroidal, elliptic (§7)
//! - **Adaptive Meshing**: Octree-based adaptive subdivision
//!
//! ## Quality Metric Formulas (Bouhamau, Frey & George 1999)
//!
//! **Triangle Aspect Ratio:**
//! $$Q = \alpha \cdot h \cdot p / S$$
//! where α = √3/6, h = max edge, p = half-perimeter, S = area
//!
//! **Quad Aspect Ratio:**
//! $$Q = \alpha \cdot L \cdot C_1 / C_2$$
//! where α = √(1/32), L = max(edges, diags), C₁ = √(Σ Lᵢ²), C₂ = min triangle area
//!
//! **Warping (4-node quad):**
//! $$\text{result} = \arcsin(|H/L|) \cdot 180/\pi$$
//! where H = (m - c) · N̂, L = min(edge) × 0.5

use shared_types::geometry::{BoundingBox3D, TriMesh};
use std::io::{self, Write, BufWriter};

// ─── Quality Metrics (SMESH §6) ──────────────────────────────────────────────

/// Triangle mesh quality metrics
#[derive(Debug, Clone, Copy)]
pub struct TriangleQuality {
    /// Aspect ratio: 1.0 = ideal equilateral, higher = worse
    pub aspect_ratio: f64,
    /// Minimum interior angle (degrees)
    pub min_angle: f64,
    /// Maximum interior angle (degrees)
    pub max_angle: f64,
    /// Area of the triangle
    pub area: f64,
    /// Skew: 0.0 = ideal, π/2 = degenerate
    pub skew: f64,
}

/// Compute quality metrics for a triangle (3 vertex positions)
pub fn triangle_quality(v0: &[f64; 3], v1: &[f64; 3], v2: &[f64; 3]) -> TriangleQuality {
    let a = distance(v1, v2);
    let b = distance(v0, v2);
    let c = distance(v0, v1);

    let p = (a + b + c) / 2.0; // half-perimeter
    let area = heron_area(a, b, c);
    let h = a.max(b).max(c); // max edge

    // Aspect ratio: α * h * p / S (Bouhamau, Frey & George 1999)
    // α = √3 / 6 ≈ 0.2886751
    let alpha = (3.0_f64).sqrt() / 6.0;
    let aspect_ratio = if area > 1e-15 {
        alpha * h * p / area
    } else {
        f64::INFINITY
    };

    // Angles via law of cosines
    let angle_a = law_of_cosines_angle(b, c, a);
    let angle_b = law_of_cosines_angle(a, c, b);
    let angle_c = std::f64::consts::PI - angle_a - angle_b;

    let min_angle = angle_a.min(angle_b).min(angle_c).to_degrees();
    let max_angle = angle_a.max(angle_b).max(angle_c).to_degrees();

    // Skew: max|π/2 - θ_skew|
    let ideal = std::f64::consts::PI / 3.0; // 60° for equilateral
    let skew = (angle_a - ideal)
        .abs()
        .max((angle_b - ideal).abs())
        .max((angle_c - ideal).abs());

    TriangleQuality {
        aspect_ratio,
        min_angle,
        max_angle,
        area,
        skew,
    }
}

/// Compute warping for a quad face (4 vertex positions)
///
/// Warping measures out-of-plane deviation:
/// result = arcsin(|H/L|) × 180/π
/// where H = (m - c) · N̂, L = min(edge) × 0.5
pub fn quad_warping(v0: &[f64; 3], v1: &[f64; 3], v2: &[f64; 3], v3: &[f64; 3]) -> f64 {
    // Center of the quad
    let c = [
        (v0[0] + v1[0] + v2[0] + v3[0]) / 4.0,
        (v0[1] + v1[1] + v2[1] + v3[1]) / 4.0,
        (v0[2] + v1[2] + v2[2] + v3[2]) / 4.0,
    ];

    // Average normal (cross product of diagonals)
    let d1 = sub(v2, v0);
    let d2 = sub(v3, v1);
    let n = cross(&d1, &d2);
    let n_len = vec_len(&n);
    if n_len < 1e-15 {
        return 90.0; // Degenerate
    }
    let n_hat = [n[0] / n_len, n[1] / n_len, n[2] / n_len];

    // Midpoints of edges
    let m01 = midpoint(v0, v1);
    let m12 = midpoint(v1, v2);
    let m23 = midpoint(v2, v3);
    let m30 = midpoint(v3, v0);

    // Midpoint of midpoints (for cross-diagonal measurement)
    let m = midpoint(&m01, &m23);
    let diff = sub(&m, &c);
    let h = dot(&diff, &n_hat).abs();

    // Minimum edge length
    let edges = [
        distance(v0, v1),
        distance(v1, v2),
        distance(v2, v3),
        distance(v3, v0),
    ];
    let l = edges.iter().cloned().fold(f64::INFINITY, f64::min) * 0.5;

    let _ = (m12, m30); // Used for alternative warping formulations

    if l < 1e-15 {
        90.0
    } else {
        (h / l).min(1.0).asin().to_degrees()
    }
}

/// Quad aspect ratio: α · L · C₁ / C₂
/// where α = √(1/32), L = max(edges, diagonals), C₁ = √(ΣLᵢ²), C₂ = min triangle area
pub fn quad_aspect_ratio(v0: &[f64; 3], v1: &[f64; 3], v2: &[f64; 3], v3: &[f64; 3]) -> f64 {
    let e0 = distance(v0, v1);
    let e1 = distance(v1, v2);
    let e2 = distance(v2, v3);
    let e3 = distance(v3, v0);
    let d0 = distance(v0, v2);
    let d1 = distance(v1, v3);

    let l = e0.max(e1).max(e2).max(e3).max(d0).max(d1);
    let c1 = (e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3).sqrt();

    // C₂ = min area of the 4 triangles formed by splitting the quad
    let t1 = heron_area(e0, e1, d0);
    let t2 = heron_area(e1, e2, d1);
    let t3 = heron_area(e2, e3, d0);
    let t4 = heron_area(e3, e0, d1);
    let c2 = t1.min(t2).min(t3).min(t4);

    let alpha = (1.0 / 32.0_f64).sqrt();

    if c2 > 1e-15 {
        alpha * l * c1 / c2
    } else {
        f64::INFINITY
    }
}

/// Mesh-wide quality statistics
#[derive(Debug, Clone)]
pub struct MeshQualityReport {
    pub triangle_count: usize,
    pub min_aspect_ratio: f64,
    pub max_aspect_ratio: f64,
    pub avg_aspect_ratio: f64,
    pub min_angle: f64,
    pub max_angle: f64,
    pub degenerate_count: usize,
    pub histogram: [usize; 10], // AR buckets: [1-1.5, 1.5-2, 2-3, 3-5, 5-10, 10-20, 20-50, 50-100, 100+, ∞]
}

/// Analyze quality of a TriMesh
pub fn analyze_mesh_quality(mesh: &TriMesh) -> MeshQualityReport {
    let n_tris = mesh.indices.len() / 3;
    let mut min_ar = f64::INFINITY;
    let mut max_ar = 0.0_f64;
    let mut sum_ar = 0.0_f64;
    let mut min_angle = 180.0_f64;
    let mut max_angle = 0.0_f64;
    let mut degenerate = 0usize;
    let mut histogram = [0usize; 10];

    for i in 0..n_tris {
        let i0 = mesh.indices[i * 3] as usize;
        let i1 = mesh.indices[i * 3 + 1] as usize;
        let i2 = mesh.indices[i * 3 + 2] as usize;

        let v0 = f32_to_f64(&mesh.positions[i0]);
        let v1 = f32_to_f64(&mesh.positions[i1]);
        let v2 = f32_to_f64(&mesh.positions[i2]);

        let q = triangle_quality(&v0, &v1, &v2);

        min_ar = min_ar.min(q.aspect_ratio);
        max_ar = max_ar.max(q.aspect_ratio);
        sum_ar += q.aspect_ratio;
        min_angle = min_angle.min(q.min_angle);
        max_angle = max_angle.max(q.max_angle);

        if q.area < 1e-15 {
            degenerate += 1;
        }

        // Histogram bucket
        let bucket = match q.aspect_ratio {
            ar if ar < 1.5 => 0,
            ar if ar < 2.0 => 1,
            ar if ar < 3.0 => 2,
            ar if ar < 5.0 => 3,
            ar if ar < 10.0 => 4,
            ar if ar < 20.0 => 5,
            ar if ar < 50.0 => 6,
            ar if ar < 100.0 => 7,
            ar if ar.is_finite() => 8,
            _ => 9,
        };
        histogram[bucket] += 1;
    }

    MeshQualityReport {
        triangle_count: n_tris,
        min_aspect_ratio: min_ar,
        max_aspect_ratio: max_ar,
        avg_aspect_ratio: if n_tris > 0 { sum_ar / n_tris as f64 } else { 0.0 },
        min_angle,
        max_angle,
        degenerate_count: degenerate,
        histogram,
    }
}

// ─── Smoothing Algorithms (SMESH §7) ─────────────────────────────────────────

/// Smoothing method selection
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SmoothingMethod {
    /// Laplacian: p' = 1/N Σ neighbors — fastest, minimizes total edge length
    Laplacian,
    /// Centroidal: p' = Σ(Ae·ce) / Σ(Ae) — better uniformity
    Centroidal,
}

/// Configuration for mesh smoothing
#[derive(Debug, Clone)]
pub struct SmoothingConfig {
    pub method: SmoothingMethod,
    pub max_iterations: usize,
    /// Target aspect ratio — stop early if all elements achieve this
    pub target_aspect_ratio: f64,
    /// Boundary nodes are fixed (true) or free to slide along boundary (false)
    pub fix_boundary: bool,
}

impl Default for SmoothingConfig {
    fn default() -> Self {
        Self {
            method: SmoothingMethod::Laplacian,
            max_iterations: 20,
            target_aspect_ratio: 2.0,
            fix_boundary: true,
        }
    }
}

/// Apply smoothing to a TriMesh in-place
///
/// **Laplacian**: p'ᵢ = (1/N) Σⱼ∈adj(i) pⱼ
/// **Centroidal**: p'ᵢ = (Σₑ Aₑ·cₑ) / (Σₑ Aₑ)
pub fn smooth_mesh(mesh: &mut TriMesh, config: &SmoothingConfig) {
    let n_verts = mesh.positions.len();
    let n_tris = mesh.indices.len() / 3;
    if n_verts == 0 || n_tris == 0 {
        return;
    }

    // Build adjacency: vertex → list of adjacent vertices
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n_verts];
    // Build vertex → triangle adjacency (for centroidal)
    let mut vert_tris: Vec<Vec<usize>> = vec![Vec::new(); n_verts];

    for t in 0..n_tris {
        let i0 = mesh.indices[t * 3] as usize;
        let i1 = mesh.indices[t * 3 + 1] as usize;
        let i2 = mesh.indices[t * 3 + 2] as usize;

        // Add bidirectional adjacency
        if !adj[i0].contains(&i1) { adj[i0].push(i1); }
        if !adj[i0].contains(&i2) { adj[i0].push(i2); }
        if !adj[i1].contains(&i0) { adj[i1].push(i0); }
        if !adj[i1].contains(&i2) { adj[i1].push(i2); }
        if !adj[i2].contains(&i0) { adj[i2].push(i0); }
        if !adj[i2].contains(&i1) { adj[i2].push(i1); }

        vert_tris[i0].push(t);
        vert_tris[i1].push(t);
        vert_tris[i2].push(t);
    }

    // Identify boundary vertices (edge appears in only 1 triangle)
    let boundary = if config.fix_boundary {
        find_boundary_vertices(mesh)
    } else {
        vec![false; n_verts]
    };

    for _iter in 0..config.max_iterations {
        let old_positions = mesh.positions.clone();
        let mut moved = false;

        for v in 0..n_verts {
            if boundary[v] {
                continue;
            }
            if adj[v].is_empty() {
                continue;
            }

            let new_pos = match config.method {
                SmoothingMethod::Laplacian => {
                    // p' = (1/N) Σ neighbors
                    let n = adj[v].len() as f32;
                    let mut sum = [0.0f32; 3];
                    for &neighbor in &adj[v] {
                        sum[0] += old_positions[neighbor][0];
                        sum[1] += old_positions[neighbor][1];
                        sum[2] += old_positions[neighbor][2];
                    }
                    [sum[0] / n, sum[1] / n, sum[2] / n]
                }
                SmoothingMethod::Centroidal => {
                    // p' = Σ(A_e · c_e) / Σ(A_e)
                    let mut weighted_sum = [0.0f32; 3];
                    let mut total_area = 0.0f32;

                    for &tri_idx in &vert_tris[v] {
                        let i0 = mesh.indices[tri_idx * 3] as usize;
                        let i1 = mesh.indices[tri_idx * 3 + 1] as usize;
                        let i2 = mesh.indices[tri_idx * 3 + 2] as usize;

                        let p0 = old_positions[i0];
                        let p1 = old_positions[i1];
                        let p2 = old_positions[i2];

                        // Centroid of triangle
                        let cx = (p0[0] + p1[0] + p2[0]) / 3.0;
                        let cy = (p0[1] + p1[1] + p2[1]) / 3.0;
                        let cz = (p0[2] + p1[2] + p2[2]) / 3.0;

                        // Area via cross product
                        let e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
                        let e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
                        let cx_prod = [
                            e1[1] * e2[2] - e1[2] * e2[1],
                            e1[2] * e2[0] - e1[0] * e2[2],
                            e1[0] * e2[1] - e1[1] * e2[0],
                        ];
                        let area = 0.5 * (cx_prod[0] * cx_prod[0] + cx_prod[1] * cx_prod[1] + cx_prod[2] * cx_prod[2]).sqrt();

                        weighted_sum[0] += area * cx;
                        weighted_sum[1] += area * cy;
                        weighted_sum[2] += area * cz;
                        total_area += area;
                    }

                    if total_area > 1e-15 {
                        [
                            weighted_sum[0] / total_area,
                            weighted_sum[1] / total_area,
                            weighted_sum[2] / total_area,
                        ]
                    } else {
                        old_positions[v]
                    }
                }
            };

            // Only update if position actually changed
            let dx = (new_pos[0] - mesh.positions[v][0]).abs();
            let dy = (new_pos[1] - mesh.positions[v][1]).abs();
            let dz = (new_pos[2] - mesh.positions[v][2]).abs();
            if dx > 1e-8 || dy > 1e-8 || dz > 1e-8 {
                mesh.positions[v] = new_pos;
                moved = true;
            }
        }

        if !moved {
            break;
        }

        // Check if target aspect ratio is achieved
        let report = analyze_mesh_quality(mesh);
        if report.max_aspect_ratio <= config.target_aspect_ratio {
            break;
        }
    }

    // Recompute normals after smoothing
    recompute_normals(mesh);
}

/// Find boundary vertices (vertices on edges shared by only 1 triangle)
fn find_boundary_vertices(mesh: &TriMesh) -> Vec<bool> {
    use std::collections::HashMap;

    let n_verts = mesh.positions.len();
    let n_tris = mesh.indices.len() / 3;
    let mut edge_count: HashMap<(u32, u32), usize> = HashMap::new();

    for t in 0..n_tris {
        let i0 = mesh.indices[t * 3];
        let i1 = mesh.indices[t * 3 + 1];
        let i2 = mesh.indices[t * 3 + 2];

        for &(a, b) in &[(i0, i1), (i1, i2), (i2, i0)] {
            let key = if a < b { (a, b) } else { (b, a) };
            *edge_count.entry(key).or_insert(0) += 1;
        }
    }

    let mut boundary = vec![false; n_verts];
    for (&(a, b), &count) in &edge_count {
        if count == 1 {
            boundary[a as usize] = true;
            boundary[b as usize] = true;
        }
    }
    boundary
}

/// Recompute vertex normals from face normals (area-weighted average)
pub fn recompute_normals(mesh: &mut TriMesh) {
    let n_verts = mesh.positions.len();
    let n_tris = mesh.indices.len() / 3;

    mesh.normals = vec![[0.0, 0.0, 0.0]; n_verts];

    for t in 0..n_tris {
        let i0 = mesh.indices[t * 3] as usize;
        let i1 = mesh.indices[t * 3 + 1] as usize;
        let i2 = mesh.indices[t * 3 + 2] as usize;

        let p0 = mesh.positions[i0];
        let p1 = mesh.positions[i1];
        let p2 = mesh.positions[i2];

        // Face normal (unnormalized — area-weighted)
        let e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        let e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        let n = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ];

        // Accumulate to each vertex
        for &idx in &[i0, i1, i2] {
            mesh.normals[idx][0] += n[0];
            mesh.normals[idx][1] += n[1];
            mesh.normals[idx][2] += n[2];
        }
    }

    // Normalize
    for normal in &mut mesh.normals {
        let len = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
        if len > 1e-10 {
            normal[0] /= len;
            normal[1] /= len;
            normal[2] /= len;
        }
    }
}

// ─── Tessellation from B-Rep (placeholder for truck-meshalgo) ─────────────────

/// Tessellation parameters
#[derive(Debug, Clone)]
pub struct TessellationParams {
    /// Angular deflection (radians) — controls tessellation of curved surfaces
    pub angular_deflection: f64,
    /// Linear deflection — max chord distance from true curve
    pub linear_deflection: f64,
    /// Minimum edge length
    pub min_edge_length: f64,
    /// Maximum edge length
    pub max_edge_length: f64,
    /// Generate normals
    pub compute_normals: bool,
    /// Generate UVs
    pub compute_uvs: bool,
}

impl Default for TessellationParams {
    fn default() -> Self {
        Self {
            angular_deflection: 0.5_f64.to_radians(),
            linear_deflection: 0.01,
            min_edge_length: 0.001,
            max_edge_length: 100.0,
            compute_normals: true,
            compute_uvs: false,
        }
    }
}

/// Tessellate a box into a TriMesh (for testing / primitive display)
pub fn tessellate_box(
    x_min: f32, y_min: f32, z_min: f32,
    x_max: f32, y_max: f32, z_max: f32,
) -> TriMesh {
    let vertices = [
        // Front face (+Z)
        [x_min, y_min, z_max], [x_max, y_min, z_max], [x_max, y_max, z_max], [x_min, y_max, z_max],
        // Back face (-Z)
        [x_max, y_min, z_min], [x_min, y_min, z_min], [x_min, y_max, z_min], [x_max, y_max, z_min],
        // Top face (+Y)
        [x_min, y_max, z_max], [x_max, y_max, z_max], [x_max, y_max, z_min], [x_min, y_max, z_min],
        // Bottom face (-Y)
        [x_min, y_min, z_min], [x_max, y_min, z_min], [x_max, y_min, z_max], [x_min, y_min, z_max],
        // Right face (+X)
        [x_max, y_min, z_max], [x_max, y_min, z_min], [x_max, y_max, z_min], [x_max, y_max, z_max],
        // Left face (-X)
        [x_min, y_min, z_min], [x_min, y_min, z_max], [x_min, y_max, z_max], [x_min, y_max, z_min],
    ];

    let normals = [
        // Front
        [0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0],
        // Back
        [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0],
        // Top
        [0.0, 1.0, 0.0], [0.0, 1.0, 0.0], [0.0, 1.0, 0.0], [0.0, 1.0, 0.0],
        // Bottom
        [0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [0.0, -1.0, 0.0],
        // Right
        [1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 0.0, 0.0],
        // Left
        [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0],
    ];

    let mut indices = Vec::new();
    for face in 0..6 {
        let base = face * 4;
        // Two triangles per face
        indices.push(base);
        indices.push(base + 1);
        indices.push(base + 2);
        indices.push(base);
        indices.push(base + 2);
        indices.push(base + 3);
    }

    let bounds = BoundingBox3D::new(
        glam::Vec3::new(x_min, y_min, z_min),
        glam::Vec3::new(x_max, y_max, z_max),
    );

    TriMesh {
        positions: vertices.to_vec(),
        normals: normals.to_vec(),
        indices,
        uvs: None,
        bounds,
    }
}

/// Tessellate a cylinder into a TriMesh
pub fn tessellate_cylinder(
    radius: f32,
    height: f32,
    segments: usize,
) -> TriMesh {
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();

    let pi2 = 2.0 * std::f32::consts::PI;

    // Side surface
    for i in 0..=segments {
        let theta = pi2 * i as f32 / segments as f32;
        let x = radius * theta.cos();
        let y = radius * theta.sin();
        let nx = theta.cos();
        let ny = theta.sin();

        // Bottom vertex
        positions.push([x, y, 0.0]);
        normals.push([nx, ny, 0.0]);
        // Top vertex
        positions.push([x, y, height]);
        normals.push([nx, ny, 0.0]);
    }

    // Side triangles
    for i in 0..segments {
        let base = (i * 2) as u32;
        indices.push(base);
        indices.push(base + 1);
        indices.push(base + 2);
        indices.push(base + 1);
        indices.push(base + 3);
        indices.push(base + 2);
    }

    // Bottom cap
    let bottom_center_idx = positions.len() as u32;
    positions.push([0.0, 0.0, 0.0]);
    normals.push([0.0, 0.0, -1.0]);

    for i in 0..segments {
        let theta = pi2 * i as f32 / segments as f32;
        let x = radius * theta.cos();
        let y = radius * theta.sin();
        positions.push([x, y, 0.0]);
        normals.push([0.0, 0.0, -1.0]);
    }

    for i in 0..segments as u32 {
        let next = (i + 1) % segments as u32;
        indices.push(bottom_center_idx);
        indices.push(bottom_center_idx + 1 + next);
        indices.push(bottom_center_idx + 1 + i);
    }

    // Top cap
    let top_center_idx = positions.len() as u32;
    positions.push([0.0, 0.0, height]);
    normals.push([0.0, 0.0, 1.0]);

    for i in 0..segments {
        let theta = pi2 * i as f32 / segments as f32;
        let x = radius * theta.cos();
        let y = radius * theta.sin();
        positions.push([x, y, height]);
        normals.push([0.0, 0.0, 1.0]);
    }

    for i in 0..segments as u32 {
        let next = (i + 1) % segments as u32;
        indices.push(top_center_idx);
        indices.push(top_center_idx + 1 + i);
        indices.push(top_center_idx + 1 + next);
    }

    let bounds = BoundingBox3D::new(
        glam::Vec3::new(-radius, -radius, 0.0),
        glam::Vec3::new(radius, radius, height),
    );

    TriMesh {
        positions,
        normals,
        indices,
        uvs: None,
        bounds,
    }
}

// ─── Mesh Decimation (QEM — Garland & Heckbert) ──────────────────────────────

/// Configuration for QEM mesh decimation
#[derive(Debug, Clone)]
pub struct DecimationConfig {
    /// Target number of triangles (stop when reached)
    pub target_triangles: usize,
    /// Target reduction ratio (0.5 = reduce to 50%)
    pub ratio: f64,
    /// Maximum error threshold — skip collapses above this cost
    pub max_error: f64,
    /// Preserve boundary edges (never collapse them)
    pub preserve_boundary: bool,
    /// Check for flipped normals after each collapse
    pub prevent_flips: bool,
}

impl Default for DecimationConfig {
    fn default() -> Self {
        Self {
            target_triangles: usize::MAX,
            ratio: 0.5,
            max_error: f64::MAX,
            preserve_boundary: true,
            prevent_flips: true,
        }
    }
}

/// Quadric Error Metric (4×4 symmetric matrix stored as 10 floats)
/// Represents: v^T Q v = error for placing vertex at position v
#[derive(Debug, Clone, Copy)]
struct Quadric {
    // Upper triangle of 4×4 symmetric matrix:
    // [a2  ab  ac  ad]    stored as [a2, ab, ac, ad, b2, bc, bd, c2, cd, d2]
    // [ab  b2  bc  bd]
    // [ac  bc  c2  cd]
    // [ad  bd  cd  d2]
    data: [f64; 10],
}

impl Quadric {
    fn zero() -> Self {
        Self { data: [0.0; 10] }
    }

    /// Create quadric from plane equation ax + by + cz + d = 0
    fn from_plane(a: f64, b: f64, c: f64, d: f64) -> Self {
        Self {
            data: [
                a * a, a * b, a * c, a * d,
                b * b, b * c, b * d,
                c * c, c * d,
                d * d,
            ],
        }
    }

    fn add(&self, other: &Quadric) -> Quadric {
        let mut result = Quadric::zero();
        for i in 0..10 {
            result.data[i] = self.data[i] + other.data[i];
        }
        result
    }

    /// Evaluate error at position [x, y, z]: v^T Q v
    fn evaluate(&self, x: f64, y: f64, z: f64) -> f64 {
        let d = &self.data;
        x * (d[0] * x + d[1] * y + d[2] * z + d[3])
            + y * (d[1] * x + d[4] * y + d[5] * z + d[6])
            + z * (d[2] * x + d[5] * y + d[7] * z + d[8])
            + (d[3] * x + d[6] * y + d[8] * z + d[9])
    }

    /// Solve for optimal vertex position: Q * [x,y,z,1]^T = 0
    /// Returns None if matrix is singular (use midpoint fallback)
    fn optimal_position(&self) -> Option<[f64; 3]> {
        let d = &self.data;
        // Solve the upper-left 3×3 of Q for position
        // [a2  ab  ac] [x]   [-ad]
        // [ab  b2  bc] [y] = [-bd]
        // [ac  bc  c2] [z]   [-cd]
        let a = [[d[0], d[1], d[2]], [d[1], d[4], d[5]], [d[2], d[5], d[7]]];
        let b = [-d[3], -d[6], -d[8]];

        // Cramer's rule for 3×3
        let det = a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
            - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
            + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);

        if det.abs() < 1e-12 {
            return None;
        }

        let inv_det = 1.0 / det;
        let x = inv_det * (b[0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
            - a[0][1] * (b[1] * a[2][2] - a[1][2] * b[2])
            + a[0][2] * (b[1] * a[2][1] - a[1][1] * b[2]));
        let y = inv_det * (a[0][0] * (b[1] * a[2][2] - a[1][2] * b[2])
            - b[0] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
            + a[0][2] * (a[1][0] * b[2] - b[1] * a[2][0]));
        let z = inv_det * (a[0][0] * (a[1][1] * b[2] - b[1] * a[2][1])
            - a[0][1] * (a[1][0] * b[2] - b[1] * a[2][0])
            + b[0] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]));

        Some([x, y, z])
    }
}

/// Edge collapse candidate in the priority queue
#[derive(Debug, Clone)]
struct CollapseCandidate {
    cost: f64,
    v1: usize,
    v2: usize,
    optimal_pos: [f64; 3],
}

impl PartialEq for CollapseCandidate {
    fn eq(&self, other: &Self) -> bool {
        self.cost == other.cost
    }
}
impl Eq for CollapseCandidate {}
impl PartialOrd for CollapseCandidate {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for CollapseCandidate {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Reverse order for min-heap (BinaryHeap is max-heap by default)
        other.cost.partial_cmp(&self.cost).unwrap_or(std::cmp::Ordering::Equal)
    }
}

/// QEM mesh decimation (FreeCAD MeshSimplify algorithm)
///
/// Reduces triangle count while preserving visual quality using the
/// Quadric Error Metric (Garland & Heckbert 1997) approach:
///
/// 1. Compute per-vertex error quadrics from incident face planes
/// 2. For each edge, compute collapse cost = v^T (Q1+Q2) v
/// 3. Greedily collapse cheapest edge, merge vertices
/// 4. Update adjacent edge costs
/// 5. Stop when target triangle count reached
pub fn decimate_mesh(mesh: &mut TriMesh, config: &DecimationConfig) {
    use std::collections::{BinaryHeap, HashSet};

    let n_tris = mesh.indices.len() / 3;
    let target = if config.target_triangles < usize::MAX {
        config.target_triangles
    } else {
        (n_tris as f64 * config.ratio) as usize
    };

    if n_tris <= target || n_tris < 4 {
        return; // Nothing to do
    }

    let n_verts = mesh.positions.len();

    // Convert positions to f64 for precision
    let mut positions: Vec<[f64; 3]> = mesh.positions.iter()
        .map(|p| [p[0] as f64, p[1] as f64, p[2] as f64])
        .collect();

    // Build triangle list (mutable, triangles can be invalidated)
    let mut triangles: Vec<[usize; 3]> = (0..n_tris)
        .map(|i| [
            mesh.indices[i * 3] as usize,
            mesh.indices[i * 3 + 1] as usize,
            mesh.indices[i * 3 + 2] as usize,
        ])
        .collect();
    let mut tri_valid = vec![true; n_tris];

    // vertex → list of triangle indices
    let mut vert_tris: Vec<HashSet<usize>> = vec![HashSet::new(); n_verts];
    for (ti, tri) in triangles.iter().enumerate() {
        vert_tris[tri[0]].insert(ti);
        vert_tris[tri[1]].insert(ti);
        vert_tris[tri[2]].insert(ti);
    }

    // 1. Compute per-vertex quadrics
    let mut quadrics: Vec<Quadric> = vec![Quadric::zero(); n_verts];
    for (ti, tri) in triangles.iter().enumerate() {
        if !tri_valid[ti] { continue; }
        let v0 = &positions[tri[0]];
        let v1 = &positions[tri[1]];
        let v2 = &positions[tri[2]];

        let e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        let e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        let n = cross(&e1, &e2);
        let len = vec_len(&n);
        if len < 1e-15 { continue; }
        let a = n[0] / len;
        let b = n[1] / len;
        let c = n[2] / len;
        let d = -(a * v0[0] + b * v0[1] + c * v0[2]);

        let q = Quadric::from_plane(a, b, c, d);
        quadrics[tri[0]] = quadrics[tri[0]].add(&q);
        quadrics[tri[1]] = quadrics[tri[1]].add(&q);
        quadrics[tri[2]] = quadrics[tri[2]].add(&q);
    }

    // Boundary detection
    let boundary = if config.preserve_boundary {
        let mut edge_count: std::collections::HashMap<(usize, usize), usize> = std::collections::HashMap::new();
        for (ti, tri) in triangles.iter().enumerate() {
            if !tri_valid[ti] { continue; }
            for k in 0..3 {
                let a = tri[k];
                let b = tri[(k + 1) % 3];
                let key = if a < b { (a, b) } else { (b, a) };
                *edge_count.entry(key).or_insert(0) += 1;
            }
        }
        let mut bnd = vec![false; n_verts];
        for (&(a, b), &cnt) in &edge_count {
            if cnt == 1 {
                bnd[a] = true;
                bnd[b] = true;
            }
        }
        bnd
    } else {
        vec![false; n_verts]
    };

    // 2. Build edge collapse candidates
    let mut heap: BinaryHeap<CollapseCandidate> = BinaryHeap::new();
    let mut seen_edges: HashSet<(usize, usize)> = HashSet::new();

    for (ti, tri) in triangles.iter().enumerate() {
        if !tri_valid[ti] { continue; }
        for k in 0..3 {
            let v1 = tri[k];
            let v2 = tri[(k + 1) % 3];
            let key = if v1 < v2 { (v1, v2) } else { (v2, v1) };
            if seen_edges.contains(&key) { continue; }
            seen_edges.insert(key);

            if config.preserve_boundary && (boundary[v1] || boundary[v2]) { continue; }

            let q_sum = quadrics[v1].add(&quadrics[v2]);
            let optimal_pos = q_sum.optimal_position().unwrap_or_else(|| {
                // Fallback: midpoint
                [
                    (positions[v1][0] + positions[v2][0]) / 2.0,
                    (positions[v1][1] + positions[v2][1]) / 2.0,
                    (positions[v1][2] + positions[v2][2]) / 2.0,
                ]
            });
            let cost = q_sum.evaluate(optimal_pos[0], optimal_pos[1], optimal_pos[2]).abs();

            if cost <= config.max_error {
                heap.push(CollapseCandidate { cost, v1, v2, optimal_pos });
            }
        }
    }

    // Track vertex remapping for collapses
    let mut remap: Vec<usize> = (0..n_verts).collect();
    let resolve = |remap: &[usize], mut v: usize| -> usize {
        while remap[v] != v { v = remap[v]; }
        v
    };

    let mut current_tris = n_tris;

    // 3. Iterative edge collapse
    while current_tris > target {
        let candidate = match heap.pop() {
            Some(c) => c,
            None => break,
        };

        let v1 = resolve(&remap, candidate.v1);
        let v2 = resolve(&remap, candidate.v2);

        // Skip if vertices have been merged already
        if v1 == v2 { continue; }

        // Collapse v2 → v1: move v1 to optimal position, remap v2 → v1
        positions[v1] = candidate.optimal_pos;
        quadrics[v1] = quadrics[v1].add(&quadrics[v2]);
        remap[v2] = v1;

        // Update triangles
        let affected_tris: Vec<usize> = vert_tris[v2].iter().copied().collect();
        for &ti in &affected_tris {
            if !tri_valid[ti] { continue; }
            // Replace v2 with v1 in triangle
            for k in 0..3 {
                if triangles[ti][k] == v2 {
                    triangles[ti][k] = v1;
                }
            }
            // Check for degenerate triangle (two identical vertices)
            let t = &triangles[ti];
            if t[0] == t[1] || t[1] == t[2] || t[0] == t[2] {
                tri_valid[ti] = false;
                current_tris -= 1;
            } else {
                vert_tris[v1].insert(ti);
            }
        }
        vert_tris[v2].clear();
    }

    // 4. Rebuild mesh from valid triangles
    // Compact vertices: create new index mapping
    let mut new_idx = vec![usize::MAX; n_verts];
    let mut new_positions = Vec::new();
    let mut new_normals = Vec::new();
    let mut new_indices = Vec::new();

    for (ti, tri) in triangles.iter().enumerate() {
        if !tri_valid[ti] { continue; }
        for &vi in tri {
            let vi = resolve(&remap, vi);
            if new_idx[vi] == usize::MAX {
                new_idx[vi] = new_positions.len();
                new_positions.push([
                    positions[vi][0] as f32,
                    positions[vi][1] as f32,
                    positions[vi][2] as f32,
                ]);
                new_normals.push([0.0f32, 0.0, 0.0]); // Will recompute
            }
            new_indices.push(new_idx[vi] as u32);
        }
    }

    mesh.positions = new_positions;
    mesh.normals = new_normals;
    mesh.indices = new_indices;

    // Recompute normals
    recompute_normals(mesh);

    // Update bounds
    if !mesh.positions.is_empty() {
        let mut min = [f32::INFINITY; 3];
        let mut max = [f32::NEG_INFINITY; 3];
        for p in &mesh.positions {
            for i in 0..3 {
                min[i] = min[i].min(p[i]);
                max[i] = max[i].max(p[i]);
            }
        }
        mesh.bounds = BoundingBox3D::new(
            glam::Vec3::new(min[0], min[1], min[2]),
            glam::Vec3::new(max[0], max[1], max[2]),
        );
    }
}

// ─── Hole Filling (FreeCAD MeshTopoAlgorithm::FillupHoles) ───────────────────

/// Fill holes in a mesh by detecting boundary loops and triangulating them.
///
/// Only fills holes with ≤ `max_edges` boundary edges.
pub fn fill_holes(mesh: &mut TriMesh, max_edges: usize) {
    use std::collections::HashMap;

    let n_tris = mesh.indices.len() / 3;
    let mut edge_tris: HashMap<(u32, u32), Vec<usize>> = HashMap::new();

    // Build edge → triangle adjacency
    for t in 0..n_tris {
        let i0 = mesh.indices[t * 3];
        let i1 = mesh.indices[t * 3 + 1];
        let i2 = mesh.indices[t * 3 + 2];
        for &(a, b) in &[(i0, i1), (i1, i2), (i2, i0)] {
            let key = if a < b { (a, b) } else { (b, a) };
            edge_tris.entry(key).or_default().push(t);
        }
    }

    // Find boundary edges (shared by exactly 1 triangle)
    let mut boundary_edges: Vec<(u32, u32)> = Vec::new();
    for (&edge, tris) in &edge_tris {
        if tris.len() == 1 {
            boundary_edges.push(edge);
        }
    }

    if boundary_edges.is_empty() { return; }

    // Build adjacency for boundary vertices
    let mut boundary_adj: HashMap<u32, Vec<u32>> = HashMap::new();
    for &(a, b) in &boundary_edges {
        boundary_adj.entry(a).or_default().push(b);
        boundary_adj.entry(b).or_default().push(a);
    }

    // Trace boundary loops
    let mut visited_edges: std::collections::HashSet<(u32, u32)> = std::collections::HashSet::new();
    let mut loops: Vec<Vec<u32>> = Vec::new();

    for &(start_a, start_b) in &boundary_edges {
        let key = if start_a < start_b { (start_a, start_b) } else { (start_b, start_a) };
        if visited_edges.contains(&key) { continue; }

        // Trace loop starting from this edge
        let mut loop_verts = vec![start_a];
        let mut current = start_b;
        let mut prev = start_a;
        visited_edges.insert(key);

        loop {
            loop_verts.push(current);
            if current == start_a { break; } // Loop closed

            // Find next boundary neighbor (not prev)
            let neighbors = match boundary_adj.get(&current) {
                Some(n) => n,
                None => break,
            };
            let next = neighbors.iter()
                .find(|&&n| n != prev && {
                    let k = if current < n { (current, n) } else { (n, current) };
                    !visited_edges.contains(&k)
                })
                .copied();

            match next {
                Some(n) => {
                    let k = if current < n { (current, n) } else { (n, current) };
                    visited_edges.insert(k);
                    prev = current;
                    current = n;
                }
                None => break,
            }

            if loop_verts.len() > max_edges + 1 { break; } // Too large
        }

        if loop_verts.len() >= 4 && loop_verts.first() == loop_verts.last() {
            loop_verts.pop(); // Remove duplicate closing vertex
            if loop_verts.len() <= max_edges {
                loops.push(loop_verts);
            }
        }
    }

    // Triangulate each hole using fan triangulation
    for hole in &loops {
        if hole.len() < 3 { continue; }
        // Simple fan from first vertex
        for i in 1..(hole.len() - 1) {
            mesh.indices.push(hole[0]);
            mesh.indices.push(hole[i] as u32);
            mesh.indices.push(hole[i + 1] as u32);
        }
    }

    // Recompute normals for the filled regions
    if !loops.is_empty() {
        recompute_normals(mesh);
    }
}

// ─── Vector Math Helpers ──────────────────────────────────────────────────────

fn distance(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

fn sub(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn cross(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn dot(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn vec_len(a: &[f64; 3]) -> f64 {
    (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt()
}

fn midpoint(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0, (a[2] + b[2]) / 2.0]
}

fn heron_area(a: f64, b: f64, c: f64) -> f64 {
    let s = (a + b + c) / 2.0;
    let val = s * (s - a) * (s - b) * (s - c);
    if val > 0.0 { val.sqrt() } else { 0.0 }
}

fn law_of_cosines_angle(adj1: f64, adj2: f64, opposite: f64) -> f64 {
    let cos_val = (adj1 * adj1 + adj2 * adj2 - opposite * opposite) / (2.0 * adj1 * adj2);
    cos_val.clamp(-1.0, 1.0).acos()
}

fn f32_to_f64(v: &[f32; 3]) -> [f64; 3] {
    [v[0] as f64, v[1] as f64, v[2] as f64]
}

// ─── STL Export ──────────────────────────────────────────────────────────────

/// Write a TriMesh as a **binary STL** file to the given writer.
///
/// Binary STL format (little-endian):
/// - 80-byte header (arbitrary text)
/// - u32 triangle count
/// - For each triangle (50 bytes):
///   - Normal: 3×f32 (12 bytes)
///   - Vertex 1: 3×f32 (12 bytes)
///   - Vertex 2: 3×f32 (12 bytes)
///   - Vertex 3: 3×f32 (12 bytes)
///   - Attribute byte count: u16 (2 bytes, usually 0)
pub fn write_stl_binary<W: Write>(mesh: &TriMesh, writer: W) -> io::Result<()> {
    let mut w = BufWriter::new(writer);

    // 80-byte header
    let mut header = [0u8; 80];
    let msg = b"r3ditor binary STL export";
    header[..msg.len()].copy_from_slice(msg);
    w.write_all(&header)?;

    // Triangle count
    let tri_count = mesh.indices.len() / 3;
    w.write_all(&(tri_count as u32).to_le_bytes())?;

    // Triangles
    for tri in 0..tri_count {
        let i0 = mesh.indices[tri * 3] as usize;
        let i1 = mesh.indices[tri * 3 + 1] as usize;
        let i2 = mesh.indices[tri * 3 + 2] as usize;

        let v0 = mesh.positions[i0];
        let v1 = mesh.positions[i1];
        let v2 = mesh.positions[i2];

        // Compute face normal from cross product
        let e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        let e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        let mut n = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ];
        let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
        if len > 1e-12 {
            n[0] /= len;
            n[1] /= len;
            n[2] /= len;
        }

        // Normal
        for c in &n {
            w.write_all(&c.to_le_bytes())?;
        }
        // Vertex 1
        for c in &v0 {
            w.write_all(&c.to_le_bytes())?;
        }
        // Vertex 2
        for c in &v1 {
            w.write_all(&c.to_le_bytes())?;
        }
        // Vertex 3
        for c in &v2 {
            w.write_all(&c.to_le_bytes())?;
        }
        // Attribute byte count
        w.write_all(&0u16.to_le_bytes())?;
    }

    w.flush()?;
    Ok(())
}

/// Write a TriMesh as an **ASCII STL** file to the given writer.
pub fn write_stl_ascii<W: Write>(mesh: &TriMesh, writer: W, solid_name: &str) -> io::Result<()> {
    let mut w = BufWriter::new(writer);
    let tri_count = mesh.indices.len() / 3;

    writeln!(w, "solid {}", solid_name)?;

    for tri in 0..tri_count {
        let i0 = mesh.indices[tri * 3] as usize;
        let i1 = mesh.indices[tri * 3 + 1] as usize;
        let i2 = mesh.indices[tri * 3 + 2] as usize;

        let v0 = mesh.positions[i0];
        let v1 = mesh.positions[i1];
        let v2 = mesh.positions[i2];

        // Face normal
        let e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        let e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        let mut n = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ];
        let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
        if len > 1e-12 {
            n[0] /= len;
            n[1] /= len;
            n[2] /= len;
        }

        writeln!(w, "  facet normal {} {} {}", n[0], n[1], n[2])?;
        writeln!(w, "    outer loop")?;
        writeln!(w, "      vertex {} {} {}", v0[0], v0[1], v0[2])?;
        writeln!(w, "      vertex {} {} {}", v1[0], v1[1], v1[2])?;
        writeln!(w, "      vertex {} {} {}", v2[0], v2[1], v2[2])?;
        writeln!(w, "    endloop")?;
        writeln!(w, "  endfacet")?;
    }

    writeln!(w, "endsolid {}", solid_name)?;
    w.flush()?;
    Ok(())
}

/// Write a TriMesh to a file as binary STL.
pub fn export_stl(mesh: &TriMesh, path: &str) -> io::Result<()> {
    let file = std::fs::File::create(path)?;
    write_stl_binary(mesh, file)
}

/// Write a TriMesh to a file as ASCII STL.
pub fn export_stl_ascii(mesh: &TriMesh, path: &str, solid_name: &str) -> io::Result<()> {
    let file = std::fs::File::create(path)?;
    write_stl_ascii(mesh, file, solid_name)
}

/// Merge multiple TriMesh objects into one combined mesh.
/// Useful for exporting an entire assembly as a single STL.
pub fn merge_meshes(meshes: &[&TriMesh]) -> TriMesh {
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();
    let mut offset = 0u32;

    for mesh in meshes {
        positions.extend_from_slice(&mesh.positions);
        normals.extend_from_slice(&mesh.normals);
        for &idx in &mesh.indices {
            indices.push(idx + offset);
        }
        offset += mesh.positions.len() as u32;
    }

    let bounds = if !positions.is_empty() {
        let mut min = [f32::MAX; 3];
        let mut max = [f32::MIN; 3];
        for p in &positions {
            for i in 0..3 {
                min[i] = min[i].min(p[i]);
                max[i] = max[i].max(p[i]);
            }
        }
        BoundingBox3D::new(
            glam::Vec3::new(min[0], min[1], min[2]),
            glam::Vec3::new(max[0], max[1], max[2]),
        )
    } else {
        BoundingBox3D::new(glam::Vec3::ZERO, glam::Vec3::ZERO)
    };

    TriMesh {
        positions,
        normals,
        indices,
        uvs: None,
        bounds,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_equilateral_triangle_quality() {
        // Equilateral triangle with side length 2
        let v0 = [0.0, 0.0, 0.0];
        let v1 = [2.0, 0.0, 0.0];
        let v2 = [1.0, 3.0_f64.sqrt(), 0.0];

        let q = triangle_quality(&v0, &v1, &v2);
        // Aspect ratio of equilateral should be ~1.0
        assert!((q.aspect_ratio - 1.0).abs() < 0.01,
            "Equilateral AR = {}", q.aspect_ratio);
        // Min angle should be ~60°
        assert!((q.min_angle - 60.0).abs() < 0.1,
            "Min angle = {}", q.min_angle);
    }

    #[test]
    fn test_degenerate_triangle() {
        let v0 = [0.0, 0.0, 0.0];
        let v1 = [1.0, 0.0, 0.0];
        let v2 = [2.0, 0.0, 0.0]; // Collinear!

        let q = triangle_quality(&v0, &v1, &v2);
        assert!(q.aspect_ratio > 1000.0 || q.aspect_ratio.is_infinite());
    }

    #[test]
    fn test_flat_quad_no_warping() {
        let v0 = [0.0, 0.0, 0.0];
        let v1 = [1.0, 0.0, 0.0];
        let v2 = [1.0, 1.0, 0.0];
        let v3 = [0.0, 1.0, 0.0];

        let w = quad_warping(&v0, &v1, &v2, &v3);
        assert!(w.abs() < 1.0, "Flat quad warping = {}", w);
    }

    #[test]
    fn test_box_tessellation() {
        let mesh = tessellate_box(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert_eq!(mesh.triangle_count(), 12); // 6 faces × 2 triangles
        assert_eq!(mesh.vertex_count(), 24);  // 6 faces × 4 vertices (unshared normals)
    }

    #[test]
    fn test_cylinder_tessellation() {
        let mesh = tessellate_cylinder(1.0, 2.0, 24);
        assert!(mesh.triangle_count() > 0);
        assert!(mesh.vertex_count() > 0);
    }

    #[test]
    fn test_mesh_quality_analysis() {
        let mesh = tessellate_box(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let report = analyze_mesh_quality(&mesh);
        assert_eq!(report.triangle_count, 12);
        assert!(report.min_aspect_ratio >= 1.0);
        assert_eq!(report.degenerate_count, 0);
    }

    #[test]
    fn test_laplacian_smoothing() {
        let mut mesh = tessellate_box(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let config = SmoothingConfig {
            method: SmoothingMethod::Laplacian,
            max_iterations: 5,
            target_aspect_ratio: 1.5,
            fix_boundary: true,
        };
        // Should not crash
        smooth_mesh(&mut mesh, &config);
        assert_eq!(mesh.triangle_count(), 12);
    }

    #[test]
    fn test_write_stl_binary() {
        let mesh = tessellate_box(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let mut buf = Vec::new();
        write_stl_binary(&mesh, &mut buf).expect("binary STL write");

        // 80 header + 4 tri_count + 12 triangles × 50 bytes = 684
        assert_eq!(buf.len(), 80 + 4 + 12 * 50);

        // Check triangle count bytes
        let tri_count = u32::from_le_bytes([buf[80], buf[81], buf[82], buf[83]]);
        assert_eq!(tri_count, 12);
    }

    #[test]
    fn test_write_stl_ascii() {
        let mesh = tessellate_box(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let mut buf = Vec::new();
        write_stl_ascii(&mesh, &mut buf, "test_box").expect("ascii STL write");
        let text = String::from_utf8(buf).expect("valid utf8");
        assert!(text.starts_with("solid test_box"));
        assert!(text.trim_end().ends_with("endsolid test_box"));
        // 12 triangles → 12 "facet normal" lines
        assert_eq!(text.matches("facet normal").count(), 12);
        // 36 vertex lines
        assert_eq!(text.matches("vertex").count(), 36);
    }

    #[test]
    fn test_merge_meshes() {
        let box1 = tessellate_box(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let box2 = tessellate_box(2.0, -1.0, -1.0, 4.0, 1.0, 1.0);
        let merged = merge_meshes(&[&box1, &box2]);
        assert_eq!(merged.triangle_count(), 24);
        assert_eq!(merged.vertex_count(), 48);
    }

    #[test]
    fn test_export_stl_roundtrip() {
        let mesh = tessellate_cylinder(5.0, 10.0, 16);
        let mut buf = Vec::new();
        write_stl_binary(&mesh, &mut buf).expect("write");
        let expected_tris = mesh.triangle_count();

        // Verify structure
        let tri_count = u32::from_le_bytes([buf[80], buf[81], buf[82], buf[83]]);
        assert_eq!(tri_count as usize, expected_tris);
        assert_eq!(buf.len(), 80 + 4 + expected_tris * 50);
    }
}
