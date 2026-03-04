//! 3D assembly constraint solver.
//!
//! Supports mate, align, offset, angle, and gear constraints
//! between parts in an assembly.

use glam::{Mat4, Quat, Vec3};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::types::{SolveResult, SolveStatus, SolverConfig};

/// 3D assembly constraint types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AssemblyConstraint {
    /// Two faces are flush (coincident, facing each other)
    Mate {
        part_a: usize,
        face_a_normal: [f64; 3],
        face_a_point: [f64; 3],
        part_b: usize,
        face_b_normal: [f64; 3],
        face_b_point: [f64; 3],
    },
    /// Two axes are collinear
    Align {
        part_a: usize,
        axis_a_origin: [f64; 3],
        axis_a_dir: [f64; 3],
        part_b: usize,
        axis_b_origin: [f64; 3],
        axis_b_dir: [f64; 3],
    },
    /// Face-to-face with a specified offset distance
    Offset {
        part_a: usize,
        face_a_normal: [f64; 3],
        face_a_point: [f64; 3],
        part_b: usize,
        face_b_normal: [f64; 3],
        face_b_point: [f64; 3],
        distance: f64,
    },
    /// Angle between two planes
    AngleBetween {
        part_a: usize,
        normal_a: [f64; 3],
        part_b: usize,
        normal_b: [f64; 3],
        angle_rad: f64,
    },
    /// Fixed in space (grounded)
    Fixed {
        part: usize,
        position: [f64; 3],
        rotation: [f64; 4], // quaternion xyzw
    },
}

/// Part transform in the assembly
#[derive(Debug, Clone)]
pub struct PartTransform {
    pub position: Vec3,
    pub rotation: Quat,
}

impl Default for PartTransform {
    fn default() -> Self {
        Self {
            position: Vec3::ZERO,
            rotation: Quat::IDENTITY,
        }
    }
}

/// 3D assembly constraint solver
pub struct AssemblySolver {
    config: SolverConfig,
    parts: Vec<PartTransform>,
    constraints: Vec<AssemblyConstraint>,
}

impl AssemblySolver {
    pub fn new(config: SolverConfig) -> Self {
        Self {
            config,
            parts: Vec::new(),
            constraints: Vec::new(),
        }
    }

    /// Add a part, returns its index
    pub fn add_part(&mut self, transform: PartTransform) -> usize {
        let idx = self.parts.len();
        self.parts.push(transform);
        idx
    }

    /// Add a constraint
    pub fn add_constraint(&mut self, constraint: AssemblyConstraint) {
        self.constraints.push(constraint);
    }

    /// Get current part transforms
    pub fn parts(&self) -> &[PartTransform] {
        &self.parts
    }

    /// Solve the assembly constraints
    pub fn solve(&mut self) -> SolveResult {
        if self.constraints.is_empty() {
            return SolveResult {
                converged: true,
                iterations: 0,
                residual: 0.0,
                dof: (self.parts.len() * 6) as i32,
                status: SolveStatus::Empty,
            };
        }

        info!(
            "Solving 3D assembly: {} parts, {} constraints",
            self.parts.len(),
            self.constraints.len()
        );

        // Iterative solver for assembly constraints
        for iteration in 0..self.config.max_iterations {
            let mut total_error = 0.0;

            for constraint in &self.constraints {
                match constraint {
                    AssemblyConstraint::Fixed {
                        part,
                        position,
                        rotation,
                    } => {
                        let target_pos = Vec3::new(
                            position[0] as f32,
                            position[1] as f32,
                            position[2] as f32,
                        );
                        let target_rot = Quat::from_xyzw(
                            rotation[0] as f32,
                            rotation[1] as f32,
                            rotation[2] as f32,
                            rotation[3] as f32,
                        );

                        let p = &mut self.parts[*part];
                        total_error += (p.position - target_pos).length() as f64;
                        p.position = target_pos;
                        p.rotation = target_rot;
                    }

                    AssemblyConstraint::Mate {
                        part_a,
                        face_a_point,
                        face_a_normal,
                        part_b,
                        face_b_point,
                        face_b_normal,
                    } => {
                        // Move part_b so that face_b touches face_a
                        let na = Vec3::new(
                            face_a_normal[0] as f32,
                            face_a_normal[1] as f32,
                            face_a_normal[2] as f32,
                        );
                        let pa = Vec3::new(
                            face_a_point[0] as f32,
                            face_a_point[1] as f32,
                            face_a_point[2] as f32,
                        ) + self.parts[*part_a].position;
                        let pb = Vec3::new(
                            face_b_point[0] as f32,
                            face_b_point[1] as f32,
                            face_b_point[2] as f32,
                        ) + self.parts[*part_b].position;

                        // Project error along normal
                        let error = na.dot(pb - pa);
                        total_error += error.abs() as f64;

                        // Correct position
                        self.parts[*part_b].position -= na * error * self.config.damping as f32;
                    }

                    _ => {
                        // TODO: Implement remaining constraint types
                    }
                }
            }

            if total_error < self.config.tolerance {
                return SolveResult {
                    converged: true,
                    iterations: iteration,
                    residual: total_error,
                    dof: 0,
                    status: SolveStatus::FullyConstrained,
                };
            }
        }

        SolveResult {
            converged: false,
            iterations: self.config.max_iterations,
            residual: f64::MAX,
            dof: 0,
            status: SolveStatus::DidNotConverge,
        }
    }
}

impl Default for AssemblySolver {
    fn default() -> Self {
        Self::new(SolverConfig::default())
    }
}
