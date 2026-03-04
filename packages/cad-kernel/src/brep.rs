//! B-Rep (Boundary Representation) model management.
//!
//! Wraps the Truck topology types and provides a high-level API
//! for creating and manipulating solid bodies.

use glam::Vec3;
use serde::{Deserialize, Serialize};
use shared_types::geometry::{BoundingBox3D, Transform3D, TriMesh};
use uuid::Uuid;

/// A B-Rep solid model
#[derive(Debug, Clone)]
pub struct BRepModel {
    /// Unique identifier
    pub id: Uuid,
    /// Human-readable name
    pub name: String,
    /// Transform in world space
    pub transform: Transform3D,
    /// Cached tessellation
    pub mesh: Option<TriMesh>,
    /// Whether the model needs re-tessellation
    pub dirty: bool,
    /// Internal B-Rep topology (faces, edges, vertices)
    topology: BRepTopology,
}

/// Internal B-Rep topology storage
#[derive(Debug, Clone)]
pub struct BRepTopology {
    pub vertices: Vec<BRepVertex>,
    pub edges: Vec<BRepEdge>,
    pub faces: Vec<BRepFace>,
    pub shells: Vec<BRepShell>,
}

/// A vertex in the B-Rep
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BRepVertex {
    pub id: u64,
    pub position: [f64; 3],
}

/// An edge in the B-Rep (connects two vertices, bounded by faces)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BRepEdge {
    pub id: u64,
    pub start_vertex: u64,
    pub end_vertex: u64,
    /// Curve type for this edge
    pub curve_type: CurveType,
    /// Control points for NURBS/spline edges
    pub control_points: Vec<[f64; 3]>,
    pub weights: Vec<f64>,
    pub knots: Vec<f64>,
}

/// A face in the B-Rep (bounded by edges, backed by a surface)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BRepFace {
    pub id: u64,
    /// Bounding edges (forming wire loops)
    pub outer_wire: Vec<u64>,
    pub inner_wires: Vec<Vec<u64>>,
    /// Surface type
    pub surface_type: SurfaceType,
    /// Surface normal orientation (true = outward)
    pub forward: bool,
}

/// A shell (closed set of faces forming a boundary)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BRepShell {
    pub id: u64,
    pub face_ids: Vec<u64>,
    pub is_closed: bool,
}

/// Curve types for edges
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CurveType {
    Line,
    Circle,
    Ellipse,
    BSpline,
    Nurbs,
}

/// Surface types for faces
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SurfaceType {
    Plane,
    Cylinder,
    Cone,
    Sphere,
    Torus,
    BSplineSurface,
    NurbsSurface,
}

impl BRepModel {
    /// Create a new empty B-Rep model
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            transform: Transform3D::default(),
            mesh: None,
            dirty: true,
            topology: BRepTopology {
                vertices: Vec::new(),
                edges: Vec::new(),
                faces: Vec::new(),
                shells: Vec::new(),
            },
        }
    }

    /// Create a primitive box
    pub fn create_box(name: impl Into<String>, width: f64, height: f64, depth: f64) -> Self {
        let mut model = Self::new(name);
        let hw = width / 2.0;
        let hh = height / 2.0;
        let hd = depth / 2.0;

        // 8 vertices of the box
        let vertices = vec![
            BRepVertex { id: 0, position: [-hw, -hh, -hd] },
            BRepVertex { id: 1, position: [hw, -hh, -hd] },
            BRepVertex { id: 2, position: [hw, hh, -hd] },
            BRepVertex { id: 3, position: [-hw, hh, -hd] },
            BRepVertex { id: 4, position: [-hw, -hh, hd] },
            BRepVertex { id: 5, position: [hw, -hh, hd] },
            BRepVertex { id: 6, position: [hw, hh, hd] },
            BRepVertex { id: 7, position: [-hw, hh, hd] },
        ];

        // 12 edges of the box
        let edges: Vec<BRepEdge> = [
            (0, 1), (1, 2), (2, 3), (3, 0), // bottom face
            (4, 5), (5, 6), (6, 7), (7, 4), // top face
            (0, 4), (1, 5), (2, 6), (3, 7), // vertical edges
        ]
        .iter()
        .enumerate()
        .map(|(i, (s, e))| BRepEdge {
            id: i as u64,
            start_vertex: *s as u64,
            end_vertex: *e as u64,
            curve_type: CurveType::Line,
            control_points: Vec::new(),
            weights: Vec::new(),
            knots: Vec::new(),
        })
        .collect();

        // 6 faces of the box
        let faces = vec![
            BRepFace { id: 0, outer_wire: vec![0, 1, 2, 3], inner_wires: Vec::new(), surface_type: SurfaceType::Plane, forward: false }, // bottom
            BRepFace { id: 1, outer_wire: vec![4, 5, 6, 7], inner_wires: Vec::new(), surface_type: SurfaceType::Plane, forward: true },  // top
            BRepFace { id: 2, outer_wire: vec![0, 9, 4, 8], inner_wires: Vec::new(), surface_type: SurfaceType::Plane, forward: false }, // front
            BRepFace { id: 3, outer_wire: vec![2, 10, 6, 11], inner_wires: Vec::new(), surface_type: SurfaceType::Plane, forward: true }, // back
            BRepFace { id: 4, outer_wire: vec![1, 10, 5, 9], inner_wires: Vec::new(), surface_type: SurfaceType::Plane, forward: true }, // right
            BRepFace { id: 5, outer_wire: vec![3, 8, 7, 11], inner_wires: Vec::new(), surface_type: SurfaceType::Plane, forward: false }, // left
        ];

        let shells = vec![BRepShell {
            id: 0,
            face_ids: vec![0, 1, 2, 3, 4, 5],
            is_closed: true,
        }];

        model.topology = BRepTopology { vertices, edges, faces, shells };
        model.dirty = true;
        model
    }

    /// Create a primitive cylinder
    pub fn create_cylinder(
        name: impl Into<String>,
        radius: f64,
        height: f64,
        segments: u32,
    ) -> Self {
        let mut model = Self::new(name);
        // Simplified: create cylinder vertices around top/bottom circles
        let mut vertices = Vec::new();
        let mut edges = Vec::new();

        for i in 0..segments {
            let angle = 2.0 * std::f64::consts::PI * (i as f64) / (segments as f64);
            let x = radius * angle.cos();
            let z = radius * angle.sin();

            // Bottom vertex
            vertices.push(BRepVertex {
                id: (i * 2) as u64,
                position: [x, 0.0, z],
            });
            // Top vertex
            vertices.push(BRepVertex {
                id: (i * 2 + 1) as u64,
                position: [x, height, z],
            });
        }

        // Bottom center and top center
        vertices.push(BRepVertex {
            id: (segments * 2) as u64,
            position: [0.0, 0.0, 0.0],
        });
        vertices.push(BRepVertex {
            id: (segments * 2 + 1) as u64,
            position: [0.0, height, 0.0],
        });

        model.topology = BRepTopology {
            vertices,
            edges,
            faces: Vec::new(),
            shells: Vec::new(),
        };
        model.dirty = true;
        model
    }

    /// Get a reference to the topology
    pub fn topology(&self) -> &BRepTopology {
        &self.topology
    }

    /// Compute bounding box from vertices
    pub fn bounding_box(&self) -> BoundingBox3D {
        let mut min = Vec3::splat(f32::MAX);
        let mut max = Vec3::splat(f32::MIN);

        for v in &self.topology.vertices {
            let p = Vec3::new(v.position[0] as f32, v.position[1] as f32, v.position[2] as f32);
            min = min.min(p);
            max = max.max(p);
        }

        BoundingBox3D::new(min, max)
    }

    /// Mark the model as needing re-tessellation
    pub fn mark_dirty(&mut self) {
        self.dirty = true;
        self.mesh = None;
    }

    /// Get the number of faces
    pub fn face_count(&self) -> usize {
        self.topology.faces.len()
    }

    /// Get the number of edges
    pub fn edge_count(&self) -> usize {
        self.topology.edges.len()
    }

    /// Get the number of vertices
    pub fn vertex_count(&self) -> usize {
        self.topology.vertices.len()
    }
}
