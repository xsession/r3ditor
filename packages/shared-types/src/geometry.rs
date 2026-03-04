//! Geometry types shared across the editor.

use glam::{Mat4, Quat, Vec3};
use serde::{Deserialize, Serialize};

/// 3D transform (position, rotation, scale)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Transform3D {
    pub position: Vec3,
    pub rotation: Quat,
    pub scale: Vec3,
}

impl Default for Transform3D {
    fn default() -> Self {
        Self {
            position: Vec3::ZERO,
            rotation: Quat::IDENTITY,
            scale: Vec3::ONE,
        }
    }
}

impl Transform3D {
    /// Convert to a 4×4 transformation matrix
    pub fn to_matrix(&self) -> Mat4 {
        Mat4::from_scale_rotation_translation(self.scale, self.rotation, self.position)
    }

    /// Create from a 4×4 matrix (decompose)
    pub fn from_matrix(mat: Mat4) -> Self {
        let (scale, rotation, position) = mat.to_scale_rotation_translation();
        Self {
            position,
            rotation,
            scale,
        }
    }
}

/// Axis-aligned bounding box in 3D
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BoundingBox3D {
    pub min: Vec3,
    pub max: Vec3,
}

impl BoundingBox3D {
    pub fn new(min: Vec3, max: Vec3) -> Self {
        Self { min, max }
    }

    pub fn center(&self) -> Vec3 {
        (self.min + self.max) * 0.5
    }

    pub fn size(&self) -> Vec3 {
        self.max - self.min
    }

    pub fn volume(&self) -> f32 {
        let s = self.size();
        s.x * s.y * s.z
    }

    pub fn surface_area(&self) -> f32 {
        let s = self.size();
        2.0 * (s.x * s.y + s.y * s.z + s.z * s.x)
    }

    /// Expand the bounding box to include a point
    pub fn expand(&mut self, point: Vec3) {
        self.min = self.min.min(point);
        self.max = self.max.max(point);
    }

    /// Merge two bounding boxes
    pub fn union(&self, other: &BoundingBox3D) -> BoundingBox3D {
        BoundingBox3D {
            min: self.min.min(other.min),
            max: self.max.max(other.max),
        }
    }

    /// Check if a point is inside the bounding box
    pub fn contains(&self, point: Vec3) -> bool {
        point.x >= self.min.x
            && point.x <= self.max.x
            && point.y >= self.min.y
            && point.y <= self.max.y
            && point.z >= self.min.z
            && point.z <= self.max.z
    }
}

/// Triangle mesh representation (GPU-ready)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriMesh {
    /// Vertex positions (3 floats per vertex)
    pub positions: Vec<[f32; 3]>,
    /// Vertex normals (3 floats per vertex)
    pub normals: Vec<[f32; 3]>,
    /// Triangle indices (3 indices per triangle)
    pub indices: Vec<u32>,
    /// UV coordinates (optional, 2 floats per vertex)
    pub uvs: Option<Vec<[f32; 2]>>,
    /// Bounding box
    pub bounds: BoundingBox3D,
}

impl TriMesh {
    pub fn triangle_count(&self) -> usize {
        self.indices.len() / 3
    }

    pub fn vertex_count(&self) -> usize {
        self.positions.len()
    }
}

/// Entity identifier in the ECS
pub type EntityId = uuid::Uuid;

/// A reference to a face in a B-Rep model
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct FaceRef(pub u64);

/// A reference to an edge in a B-Rep model
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EdgeRef(pub u64);

/// A reference to a vertex in a B-Rep model
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct VertexRef(pub u64);

/// Supported file formats for import/export
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileFormat {
    Step,
    Iges,
    Stl,
    Obj,
    ThreeMf,
    Gltf,
    Glb,
    Svg,
    Dxf,
    GCode,
    Pdf,
    ManuNative,
}

impl FileFormat {
    /// Get the file extension for this format
    pub fn extension(&self) -> &str {
        match self {
            FileFormat::Step => "step",
            FileFormat::Iges => "iges",
            FileFormat::Stl => "stl",
            FileFormat::Obj => "obj",
            FileFormat::ThreeMf => "3mf",
            FileFormat::Gltf => "gltf",
            FileFormat::Glb => "glb",
            FileFormat::Svg => "svg",
            FileFormat::Dxf => "dxf",
            FileFormat::GCode => "gcode",
            FileFormat::Pdf => "pdf",
            FileFormat::ManuNative => "manu",
        }
    }
}
