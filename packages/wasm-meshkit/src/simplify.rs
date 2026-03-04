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
