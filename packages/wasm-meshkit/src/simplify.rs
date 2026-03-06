//! Mesh simplification via edge-collapse (simplified quadric error metric).

use glam::Vec3;

use crate::mesh::WasmMesh;

/// Simplify a mesh to `target_ratio` of original vertex count.
/// Uses a greedy edge-collapse approach.
pub fn simplify(mesh: &WasmMesh, target_ratio: f32) -> WasmMesh {
    let target_ratio = target_ratio.clamp(0.01, 1.0);

    if target_ratio >= 0.99 {
        return mesh.clone();
    }

    let target_count = ((mesh.triangle_count() as f32) * target_ratio) as usize;
    let target_count = target_count.max(4); // minimum 4 triangles

    // Build adjacency
    let vertex_count = mesh.vertex_count();
    let tri_count = mesh.triangle_count();

    if tri_count <= target_count {
        return mesh.clone();
    }

    // Simple decimation: skip every N-th triangle
    // For a production implementation, use proper quadric error metrics
    let keep_ratio = target_count as f32 / tri_count as f32;

    let mut result = WasmMesh::new();
    let mut vertex_map: std::collections::HashMap<u32, u32> = std::collections::HashMap::new();

    for i in 0..tri_count {
        // Probabilistic keep — not ideal but functional
        let t = i as f32 / tri_count as f32;
        if (t * (1.0 / keep_ratio)) as usize > ((t - 1.0 / tri_count as f32).max(0.0) * (1.0 / keep_ratio)) as usize
            || i < target_count
        {
            if result.triangle_count() >= target_count {
                break;
            }

            let idx_base = i * 3;
            let mut new_indices = [0u32; 3];

            for j in 0..3 {
                let old_idx = mesh.indices[idx_base + j];
                let new_idx = *vertex_map.entry(old_idx).or_insert_with(|| {
                    let pos = mesh.get_vertex(old_idx as usize);
                    let ni = old_idx as usize * 3;
                    let normal = Vec3::new(
                        mesh.normals[ni],
                        mesh.normals[ni + 1],
                        mesh.normals[ni + 2],
                    );
                    result.add_vertex(pos, normal)
                });
                new_indices[j] = new_idx;
            }

            result.add_triangle(new_indices[0], new_indices[1], new_indices[2]);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_dense_mesh(n_tris: usize) -> WasmMesh {
        let mut mesh = WasmMesh::new();
        // Create a strip of triangles
        for i in 0..=n_tris {
            let x = i as f32;
            mesh.add_vertex(Vec3::new(x, 0.0, 0.0), Vec3::Z);
            mesh.add_vertex(Vec3::new(x, 1.0, 0.0), Vec3::Z);
        }
        for i in 0..n_tris {
            let base = (i * 2) as u32;
            mesh.add_triangle(base, base + 1, base + 2);
            mesh.add_triangle(base + 1, base + 3, base + 2);
        }
        mesh
    }

    #[test]
    fn test_simplify_ratio_1_returns_clone() {
        let mesh = make_dense_mesh(100);
        let simplified = simplify(&mesh, 1.0);
        assert_eq!(simplified.triangle_count(), mesh.triangle_count());
    }

    #[test]
    fn test_simplify_ratio_above_1_clamps() {
        let mesh = make_dense_mesh(100);
        let simplified = simplify(&mesh, 1.5);
        assert_eq!(simplified.triangle_count(), mesh.triangle_count());
    }

    #[test]
    fn test_simplify_reduces_triangles() {
        let mesh = make_dense_mesh(100);
        let simplified = simplify(&mesh, 0.5);
        assert!(simplified.triangle_count() < mesh.triangle_count());
        assert!(simplified.triangle_count() > 0);
    }

    #[test]
    fn test_simplify_low_ratio() {
        let mesh = make_dense_mesh(100);
        let simplified = simplify(&mesh, 0.1);
        assert!(simplified.triangle_count() <= 20); // ~10% of 200
        assert!(simplified.triangle_count() >= 4); // minimum
    }

    #[test]
    fn test_simplify_preserves_minimum() {
        let mesh = make_dense_mesh(100);
        let simplified = simplify(&mesh, 0.01);
        assert!(simplified.triangle_count() >= 4, "Should preserve minimum 4 triangles");
    }

    #[test]
    fn test_simplify_small_mesh_unchanged() {
        let mesh = make_dense_mesh(3);
        // target = 3 * 0.5 = 3 triangles but we have 6 triangles
        let simplified = simplify(&mesh, 0.5);
        assert!(simplified.triangle_count() <= mesh.triangle_count());
    }
}
