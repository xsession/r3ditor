//! WASM-friendly mesh representation.

use glam::Vec3;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// A mesh optimized for WASM/WebGPU consumption
#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmMesh {
    #[wasm_bindgen(skip)]
    pub positions: Vec<f32>,  // [x,y,z, x,y,z, ...]
    #[wasm_bindgen(skip)]
    pub normals: Vec<f32>,    // [nx,ny,nz, ...]
    #[wasm_bindgen(skip)]
    pub indices: Vec<u32>,
}

#[wasm_bindgen]
impl WasmMesh {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            positions: Vec::new(),
            normals: Vec::new(),
            indices: Vec::new(),
        }
    }

    /// Get vertex count
    #[wasm_bindgen(getter)]
    pub fn vertex_count(&self) -> usize {
        self.positions.len() / 3
    }

    /// Get triangle count
    #[wasm_bindgen(getter)]
    pub fn triangle_count(&self) -> usize {
        self.indices.len() / 3
    }

    /// Get positions as Float32Array
    #[wasm_bindgen]
    pub fn get_positions(&self) -> Vec<f32> {
        self.positions.clone()
    }

    /// Get normals as Float32Array
    #[wasm_bindgen]
    pub fn get_normals(&self) -> Vec<f32> {
        self.normals.clone()
    }

    /// Get indices as Uint32Array
    #[wasm_bindgen]
    pub fn get_indices(&self) -> Vec<u32> {
        self.indices.clone()
    }

    /// Compute bounding box [min_x, min_y, min_z, max_x, max_y, max_z]
    #[wasm_bindgen]
    pub fn bounding_box(&self) -> Vec<f32> {
        if self.positions.is_empty() {
            return vec![0.0; 6];
        }

        let mut min = Vec3::splat(f32::MAX);
        let mut max = Vec3::splat(f32::MIN);

        for i in (0..self.positions.len()).step_by(3) {
            let v = Vec3::new(self.positions[i], self.positions[i + 1], self.positions[i + 2]);
            min = min.min(v);
            max = max.max(v);
        }

        vec![min.x, min.y, min.z, max.x, max.y, max.z]
    }

    /// Compute approximate volume using divergence theorem
    #[wasm_bindgen]
    pub fn volume(&self) -> f32 {
        let mut vol = 0.0f32;
        for i in (0..self.indices.len()).step_by(3) {
            let i0 = self.indices[i] as usize * 3;
            let i1 = self.indices[i + 1] as usize * 3;
            let i2 = self.indices[i + 2] as usize * 3;

            let v0 = Vec3::new(self.positions[i0], self.positions[i0 + 1], self.positions[i0 + 2]);
            let v1 = Vec3::new(self.positions[i1], self.positions[i1 + 1], self.positions[i1 + 2]);
            let v2 = Vec3::new(self.positions[i2], self.positions[i2 + 1], self.positions[i2 + 2]);

            vol += v0.dot(v1.cross(v2));
        }
        (vol / 6.0).abs()
    }

    /// Recompute normals from face geometry
    #[wasm_bindgen]
    pub fn recompute_normals(&mut self) {
        self.normals = vec![0.0; self.positions.len()];

        for i in (0..self.indices.len()).step_by(3) {
            let i0 = self.indices[i] as usize;
            let i1 = self.indices[i + 1] as usize;
            let i2 = self.indices[i + 2] as usize;

            let v0 = self.get_vertex(i0);
            let v1 = self.get_vertex(i1);
            let v2 = self.get_vertex(i2);

            let normal = (v1 - v0).cross(v2 - v0);

            for idx in [i0, i1, i2] {
                self.normals[idx * 3] += normal.x;
                self.normals[idx * 3 + 1] += normal.y;
                self.normals[idx * 3 + 2] += normal.z;
            }
        }

        // Normalize
        for i in (0..self.normals.len()).step_by(3) {
            let n = Vec3::new(self.normals[i], self.normals[i + 1], self.normals[i + 2]);
            let n = n.normalize_or_zero();
            self.normals[i] = n.x;
            self.normals[i + 1] = n.y;
            self.normals[i + 2] = n.z;
        }
    }
}

impl WasmMesh {
    pub fn get_vertex(&self, index: usize) -> Vec3 {
        Vec3::new(
            self.positions[index * 3],
            self.positions[index * 3 + 1],
            self.positions[index * 3 + 2],
        )
    }

    pub fn add_vertex(&mut self, pos: Vec3, normal: Vec3) -> u32 {
        let idx = self.vertex_count() as u32;
        self.positions.extend_from_slice(&[pos.x, pos.y, pos.z]);
        self.normals.extend_from_slice(&[normal.x, normal.y, normal.z]);
        idx
    }

    pub fn add_triangle(&mut self, a: u32, b: u32, c: u32) {
        self.indices.extend_from_slice(&[a, b, c]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_triangle_mesh() -> WasmMesh {
        let mut mesh = WasmMesh::new();
        mesh.add_vertex(Vec3::new(0.0, 0.0, 0.0), Vec3::Z);
        mesh.add_vertex(Vec3::new(1.0, 0.0, 0.0), Vec3::Z);
        mesh.add_vertex(Vec3::new(0.0, 1.0, 0.0), Vec3::Z);
        mesh.add_triangle(0, 1, 2);
        mesh
    }

    fn make_cube_mesh() -> WasmMesh {
        let mut mesh = WasmMesh::new();
        // 8 vertices of a unit cube
        let verts = [
            Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(1.0, 1.0, 0.0), Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0), Vec3::new(1.0, 0.0, 1.0),
            Vec3::new(1.0, 1.0, 1.0), Vec3::new(0.0, 1.0, 1.0),
        ];
        for v in &verts {
            mesh.add_vertex(*v, Vec3::Z);
        }
        // 12 triangles (2 per face × 6 faces)
        let tris: [(u32, u32, u32); 12] = [
            (0,1,2), (0,2,3), // bottom
            (4,6,5), (4,7,6), // top
            (0,5,1), (0,4,5), // front
            (2,7,3), (2,6,7), // back
            (0,3,7), (0,7,4), // left
            (1,5,6), (1,6,2), // right
        ];
        for (a, b, c) in &tris {
            mesh.add_triangle(*a, *b, *c);
        }
        mesh
    }

    #[test]
    fn test_new_mesh_empty() {
        let mesh = WasmMesh::new();
        assert_eq!(mesh.vertex_count(), 0);
        assert_eq!(mesh.triangle_count(), 0);
    }

    #[test]
    fn test_add_vertex() {
        let mut mesh = WasmMesh::new();
        let idx = mesh.add_vertex(Vec3::new(1.0, 2.0, 3.0), Vec3::Z);
        assert_eq!(idx, 0);
        assert_eq!(mesh.vertex_count(), 1);
        assert_eq!(mesh.positions.len(), 3);
        assert_eq!(mesh.normals.len(), 3);
    }

    #[test]
    fn test_add_triangle() {
        let mesh = make_triangle_mesh();
        assert_eq!(mesh.vertex_count(), 3);
        assert_eq!(mesh.triangle_count(), 1);
        assert_eq!(mesh.indices, vec![0, 1, 2]);
    }

    #[test]
    fn test_get_vertex() {
        let mesh = make_triangle_mesh();
        assert_eq!(mesh.get_vertex(0), Vec3::new(0.0, 0.0, 0.0));
        assert_eq!(mesh.get_vertex(1), Vec3::new(1.0, 0.0, 0.0));
        assert_eq!(mesh.get_vertex(2), Vec3::new(0.0, 1.0, 0.0));
    }

    #[test]
    fn test_bounding_box_empty() {
        let mesh = WasmMesh::new();
        let bbox = mesh.bounding_box();
        assert_eq!(bbox.len(), 6);
        assert_eq!(bbox, vec![0.0; 6]);
    }

    #[test]
    fn test_bounding_box_triangle() {
        let mesh = make_triangle_mesh();
        let bbox = mesh.bounding_box();
        assert_eq!(bbox[0], 0.0); // min_x
        assert_eq!(bbox[1], 0.0); // min_y
        assert_eq!(bbox[2], 0.0); // min_z
        assert_eq!(bbox[3], 1.0); // max_x
        assert_eq!(bbox[4], 1.0); // max_y
        assert_eq!(bbox[5], 0.0); // max_z
    }

    #[test]
    fn test_bounding_box_cube() {
        let mesh = make_cube_mesh();
        let bbox = mesh.bounding_box();
        assert!((bbox[0] - 0.0).abs() < 1e-5);
        assert!((bbox[1] - 0.0).abs() < 1e-5);
        assert!((bbox[2] - 0.0).abs() < 1e-5);
        assert!((bbox[3] - 1.0).abs() < 1e-5);
        assert!((bbox[4] - 1.0).abs() < 1e-5);
        assert!((bbox[5] - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_volume_cube() {
        let mesh = make_cube_mesh();
        let vol = mesh.volume();
        // Volume of unit cube should be ~1.0
        assert!((vol - 1.0).abs() < 0.1, "Cube volume should be ~1.0, got {}", vol);
    }

    #[test]
    fn test_get_positions() {
        let mesh = make_triangle_mesh();
        let positions = mesh.get_positions();
        assert_eq!(positions.len(), 9); // 3 vertices × 3 components
        assert_eq!(positions[0], 0.0); // first vertex x
        assert_eq!(positions[3], 1.0); // second vertex x
    }

    #[test]
    fn test_get_normals() {
        let mesh = make_triangle_mesh();
        let normals = mesh.get_normals();
        assert_eq!(normals.len(), 9); // 3 vertices × 3 components
    }

    #[test]
    fn test_get_indices() {
        let mesh = make_triangle_mesh();
        let indices = mesh.get_indices();
        assert_eq!(indices, vec![0, 1, 2]);
    }

    #[test]
    fn test_recompute_normals() {
        let mut mesh = make_triangle_mesh();
        mesh.normals = vec![0.0; 9]; // zero out normals
        mesh.recompute_normals();
        // After recomputation, normals for the flat triangle should point in +Z or -Z
        let n0 = Vec3::new(mesh.normals[0], mesh.normals[1], mesh.normals[2]);
        assert!(n0.length() > 0.9, "Normal should be approximately unit length");
        assert!((n0.z.abs() - 1.0).abs() < 0.01, "Normal should be along Z axis");
    }

    #[test]
    fn test_clone() {
        let mesh = make_triangle_mesh();
        let cloned = mesh.clone();
        assert_eq!(cloned.vertex_count(), mesh.vertex_count());
        assert_eq!(cloned.triangle_count(), mesh.triangle_count());
        assert_eq!(cloned.positions, mesh.positions);
    }
}
