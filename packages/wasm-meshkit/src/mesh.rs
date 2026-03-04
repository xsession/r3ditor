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
