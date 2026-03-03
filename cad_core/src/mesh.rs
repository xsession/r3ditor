use anyhow::Result;

#[derive(Debug, Clone)]
pub struct TriangleMesh {
    pub positions: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub indices: Vec<u32>,
    pub aabb_min: [f32; 3],
    pub aabb_max: [f32; 3],
}

impl TriangleMesh {
    pub fn compute_aabb(positions: &[[f32; 3]]) -> ([f32; 3], [f32; 3]) {
        let mut min = [f32::INFINITY; 3];
        let mut max = [f32::NEG_INFINITY; 3];
        for p in positions {
            for i in 0..3 {
                min[i] = min[i].min(p[i]);
                max[i] = max[i].max(p[i]);
            }
        }
        (min, max)
    }

    pub fn new(positions: Vec<[f32; 3]>, normals: Vec<[f32; 3]>, indices: Vec<u32>) -> Self {
        let (aabb_min, aabb_max) = Self::compute_aabb(&positions);
        Self {
            positions,
            normals,
            indices,
            aabb_min,
            aabb_max,
        }
    }

    pub fn center_and_radius(&self) -> ([f32; 3], f32) {
        let center = [
            (self.aabb_min[0] + self.aabb_max[0]) * 0.5,
            (self.aabb_min[1] + self.aabb_max[1]) * 0.5,
            (self.aabb_min[2] + self.aabb_max[2]) * 0.5,
        ];
        let dx = self.aabb_max[0] - center[0];
        let dy = self.aabb_max[1] - center[1];
        let dz = self.aabb_max[2] - center[2];
        let radius = (dx * dx + dy * dy + dz * dz).sqrt().max(0.001);
        (center, radius)
    }
}
