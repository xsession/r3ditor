//! Tessellation — convert B-Rep geometry to triangle meshes for GPU rendering.

use glam::Vec3;
use rayon::prelude::*;
use shared_types::geometry::{BoundingBox3D, TriMesh};

use crate::brep::BRepModel;

/// Tessellation quality settings
#[derive(Debug, Clone, Copy)]
pub struct TessellationConfig {
    /// Maximum chord deviation (mm)
    pub max_deviation: f64,
    /// Maximum edge length (mm)
    pub max_edge_length: f64,
    /// Minimum number of segments per circle
    pub min_segments_per_circle: u32,
    /// Angular tolerance (radians)
    pub angular_tolerance: f64,
}

impl Default for TessellationConfig {
    fn default() -> Self {
        Self {
            max_deviation: 0.1,
            max_edge_length: 5.0,
            min_segments_per_circle: 24,
            angular_tolerance: 0.1,
        }
    }
}

/// Tessellate a B-Rep model into a triangle mesh
pub fn tessellate(model: &BRepModel, config: &TessellationConfig) -> TriMesh {
    // For now, generate a simple box mesh if the model is a box primitive
    // TODO: Integrate with truck-meshalgo for full NURBS tessellation
    let topo = model.topology();

    if topo.vertices.is_empty() {
        return empty_mesh();
    }

    // Simple tessellation: convert each face to triangles using fan triangulation
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();

    // For the box primitive, generate proper mesh
    if topo.faces.len() == 6 && topo.vertices.len() == 8 {
        return tessellate_box(topo);
    }

    // Generic fallback: just create a point cloud
    for v in &topo.vertices {
        positions.push([v.position[0] as f32, v.position[1] as f32, v.position[2] as f32]);
        normals.push([0.0, 1.0, 0.0]);
    }

    let bounds = compute_bounds(&positions);
    TriMesh {
        positions,
        normals,
        indices,
        uvs: None,
        bounds,
    }
}

/// Tessellate a box topology into a triangle mesh
fn tessellate_box(topo: &crate::brep::BRepTopology) -> TriMesh {
    let verts: Vec<[f32; 3]> = topo
        .vertices
        .iter()
        .map(|v| [v.position[0] as f32, v.position[1] as f32, v.position[2] as f32])
        .collect();

    // Box faces: bottom, top, front, back, right, left
    // Each face gets 2 triangles
    let face_indices: &[[u32; 6]] = &[
        [0, 1, 2, 0, 2, 3], // bottom (-Y)
        [4, 6, 5, 4, 7, 6], // top (+Y)
        [0, 5, 1, 0, 4, 5], // front (-Z)
        [2, 6, 7, 2, 7, 3], // back (+Z) — corrected
        [1, 5, 6, 1, 6, 2], // right (+X)
        [0, 3, 7, 0, 7, 4], // left (-X)
    ];

    let face_normals: &[[f32; 3]] = &[
        [0.0, -1.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, -1.0],
        [0.0, 0.0, 1.0],
        [1.0, 0.0, 0.0],
        [-1.0, 0.0, 0.0],
    ];

    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();

    for (face_idx, fi) in face_indices.iter().enumerate() {
        let base = positions.len() as u32;
        let normal = face_normals[face_idx];

        for &vi in fi.iter() {
            positions.push(verts[vi as usize]);
            normals.push(normal);
        }

        indices.extend_from_slice(&[base, base + 1, base + 2, base + 3, base + 4, base + 5]);
    }

    let bounds = compute_bounds(&positions);
    TriMesh {
        positions,
        normals,
        indices,
        uvs: None,
        bounds,
    }
}

fn empty_mesh() -> TriMesh {
    TriMesh {
        positions: Vec::new(),
        normals: Vec::new(),
        indices: Vec::new(),
        uvs: None,
        bounds: BoundingBox3D::new(Vec3::ZERO, Vec3::ZERO),
    }
}

fn compute_bounds(positions: &[[f32; 3]]) -> BoundingBox3D {
    if positions.is_empty() {
        return BoundingBox3D::new(Vec3::ZERO, Vec3::ZERO);
    }

    let mut min = Vec3::splat(f32::MAX);
    let mut max = Vec3::splat(f32::MIN);

    for p in positions {
        let v = Vec3::from_array(*p);
        min = min.min(v);
        max = max.max(v);
    }

    BoundingBox3D::new(min, max)
}

/// Batch tessellate multiple models in parallel using Rayon
pub fn tessellate_batch(
    models: &[BRepModel],
    config: &TessellationConfig,
) -> Vec<TriMesh> {
    models
        .par_iter()
        .map(|model| tessellate(model, config))
        .collect()
}
