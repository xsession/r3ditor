//! 3D assembly constraint solver.
//!
//! Supports mate, align, offset, angle, and gear constraints
//! between parts in an assembly.

use glam::{Quat, Vec3};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::types::{SolveResult, SolveStatus, SolverConfig};

/// 3D assembly constraint types (FreeCAD Ondsel/MbD joint types)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AssemblyConstraint {
    /// Two faces are flush (coincident, facing each other) — 0 DOF (translation + rotation locked)
    Mate {
        part_a: usize,
        face_a_normal: [f64; 3],
        face_a_point: [f64; 3],
        part_b: usize,
        face_b_normal: [f64; 3],
        face_b_point: [f64; 3],
    },
    /// Two axes are collinear — 2 DOF (rotation about axis + translation along axis)
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
    /// Fixed in space (grounded) — 0 DOF
    Fixed {
        part: usize,
        position: [f64; 3],
        rotation: [f64; 4], // quaternion xyzw
    },
    /// Revolute joint — 1 DOF (rotation about shared axis)
    Revolute {
        part_a: usize,
        part_b: usize,
        axis_origin: [f64; 3],
        axis_dir: [f64; 3],
    },
    /// Cylindrical joint — 2 DOF (rotation + translation along axis)
    Cylindrical {
        part_a: usize,
        part_b: usize,
        axis_origin: [f64; 3],
        axis_dir: [f64; 3],
    },
    /// Slider (translational) — 1 DOF (translation along axis)
    Slider {
        part_a: usize,
        part_b: usize,
        axis_origin: [f64; 3],
        axis_dir: [f64; 3],
    },
    /// Ball (spherical) — 3 DOF (all rotations)
    Ball {
        part_a: usize,
        part_b: usize,
        center: [f64; 3],
    },
    /// Distance — maintains distance between two points
    Distance {
        part_a: usize,
        point_a: [f64; 3],
        part_b: usize,
        point_b: [f64; 3],
        distance: f64,
    },
    /// Parallel axes — maintains two axes parallel
    Parallel {
        part_a: usize,
        dir_a: [f64; 3],
        part_b: usize,
        dir_b: [f64; 3],
    },
    /// Perpendicular axes
    Perpendicular {
        part_a: usize,
        dir_a: [f64; 3],
        part_b: usize,
        dir_b: [f64; 3],
    },
    /// Gear constraint — coupled rotation (ratio = radius_a / radius_b)
    Gear {
        part_a: usize,
        axis_a: [f64; 3],
        radius_a: f64,
        part_b: usize,
        axis_b: [f64; 3],
        radius_b: f64,
    },
    /// Rack and pinion — rotation to translation coupling
    RackPinion {
        part_a: usize,          // pinion (rotating)
        pinion_axis: [f64; 3],
        pitch_radius: f64,
        part_b: usize,          // rack (translating)
        rack_dir: [f64; 3],
    },
    /// Screw — coupled rotation and translation along same axis
    Screw {
        part_a: usize,
        part_b: usize,
        axis_origin: [f64; 3],
        axis_dir: [f64; 3],
        pitch: f64, // translation per revolution (mm)
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

    /// Solve the assembly constraints (FreeCAD MbD iterative solver pattern)
    pub fn solve(&mut self) -> SolveResult {
        if self.constraints.is_empty() {
            return SolveResult {
                converged: true,
                iterations: 0,
                residual: 0.0,
                dof: (self.parts.len() * 6) as i32,
                status: SolveStatus::Empty,
                algorithm_used: None,
                conflicting: vec![],
                underconstrained: vec![],
            };
        }

        info!(
            "Solving 3D assembly: {} parts, {} constraints",
            self.parts.len(),
            self.constraints.len()
        );

        let damping = self.config.damping as f32;

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
                        face_b_normal: _,
                    } => {
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

                        let error = na.dot(pb - pa);
                        total_error += error.abs() as f64;
                        self.parts[*part_b].position -= na * error * damping;
                    }

                    AssemblyConstraint::Align {
                        part_a,
                        axis_a_origin,
                        axis_a_dir,
                        part_b,
                        axis_b_origin: _,
                        axis_b_dir,
                    } => {
                        // Align axes: make axis_b parallel to axis_a
                        let dir_a = Vec3::new(
                            axis_a_dir[0] as f32, axis_a_dir[1] as f32, axis_a_dir[2] as f32,
                        ).normalize();
                        let dir_b = Vec3::new(
                            axis_b_dir[0] as f32, axis_b_dir[1] as f32, axis_b_dir[2] as f32,
                        );
                        let dir_b_world = self.parts[*part_b].rotation * dir_b;

                        // Rotation to align dir_b_world with dir_a
                        let cross = dir_b_world.cross(dir_a);
                        let cross_len = cross.length();
                        if cross_len > 1e-6 {
                            let angle = cross_len.atan2(dir_b_world.dot(dir_a));
                            total_error += angle.abs() as f64;
                            let correction = Quat::from_axis_angle(cross.normalize(), angle * damping);
                            self.parts[*part_b].rotation = correction * self.parts[*part_b].rotation;
                        }

                        // Also align position: project part_b origin onto axis_a line
                        let oa = Vec3::new(
                            axis_a_origin[0] as f32, axis_a_origin[1] as f32, axis_a_origin[2] as f32,
                        ) + self.parts[*part_a].position;
                        let ob = self.parts[*part_b].position;
                        let diff = ob - oa;
                        let perp = diff - dir_a * diff.dot(dir_a);
                        total_error += perp.length() as f64;
                        self.parts[*part_b].position -= perp * damping;
                    }

                    AssemblyConstraint::Offset {
                        part_a,
                        face_a_point,
                        face_a_normal,
                        part_b,
                        face_b_point,
                        face_b_normal: _,
                        distance,
                    } => {
                        let na = Vec3::new(
                            face_a_normal[0] as f32, face_a_normal[1] as f32, face_a_normal[2] as f32,
                        );
                        let pa = Vec3::new(
                            face_a_point[0] as f32, face_a_point[1] as f32, face_a_point[2] as f32,
                        ) + self.parts[*part_a].position;
                        let pb = Vec3::new(
                            face_b_point[0] as f32, face_b_point[1] as f32, face_b_point[2] as f32,
                        ) + self.parts[*part_b].position;

                        let current_dist = na.dot(pb - pa);
                        let error = current_dist - *distance as f32;
                        total_error += error.abs() as f64;
                        self.parts[*part_b].position -= na * error * damping;
                    }

                    AssemblyConstraint::AngleBetween {
                        part_a: _,
                        normal_a,
                        part_b,
                        normal_b,
                        angle_rad,
                    } => {
                        let na = Vec3::new(
                            normal_a[0] as f32, normal_a[1] as f32, normal_a[2] as f32,
                        ).normalize();
                        let nb = Vec3::new(
                            normal_b[0] as f32, normal_b[1] as f32, normal_b[2] as f32,
                        );
                        let nb_world = (self.parts[*part_b].rotation * nb).normalize();

                        let current_angle = na.dot(nb_world).clamp(-1.0, 1.0).acos();
                        let error = current_angle - *angle_rad as f32;
                        total_error += error.abs() as f64;

                        if error.abs() > 1e-6 {
                            let axis = na.cross(nb_world);
                            if axis.length() > 1e-6 {
                                let correction = Quat::from_axis_angle(axis.normalize(), -error * damping);
                                self.parts[*part_b].rotation = correction * self.parts[*part_b].rotation;
                            }
                        }
                    }

                    AssemblyConstraint::Revolute {
                        part_a,
                        part_b,
                        axis_origin,
                        axis_dir,
                    } => {
                        // Coincident point + aligned axis (1 DOF: rotation about axis)
                        let origin = Vec3::new(
                            axis_origin[0] as f32, axis_origin[1] as f32, axis_origin[2] as f32,
                        );
                        let dir = Vec3::new(
                            axis_dir[0] as f32, axis_dir[1] as f32, axis_dir[2] as f32,
                        ).normalize();

                        // Position: pin part_b to the axis origin
                        let pos_a = self.parts[*part_a].position + origin;
                        let pos_b = self.parts[*part_b].position + origin;
                        let pos_err = pos_b - pos_a;
                        total_error += pos_err.length() as f64;
                        self.parts[*part_b].position -= pos_err * damping;

                        // Rotation: lock all rotations except about axis
                        let dir_b_world = self.parts[*part_b].rotation * dir;
                        let cross = dir_b_world.cross(dir);
                        let cross_len = cross.length();
                        if cross_len > 1e-6 {
                            let angle = cross_len.atan2(dir_b_world.dot(dir));
                            total_error += angle.abs() as f64;
                            let correction = Quat::from_axis_angle(cross.normalize(), angle * damping);
                            self.parts[*part_b].rotation = correction * self.parts[*part_b].rotation;
                        }
                    }

                    AssemblyConstraint::Cylindrical {
                        part_a,
                        part_b,
                        axis_origin,
                        axis_dir,
                    } => {
                        // Aligned axis, free rotation + translation along axis (2 DOF)
                        let dir = Vec3::new(
                            axis_dir[0] as f32, axis_dir[1] as f32, axis_dir[2] as f32,
                        ).normalize();
                        let oa = Vec3::new(
                            axis_origin[0] as f32, axis_origin[1] as f32, axis_origin[2] as f32,
                        ) + self.parts[*part_a].position;
                        let ob = self.parts[*part_b].position;

                        // Radial constraint only (allow axial freedom)
                        let diff = ob - oa;
                        let perp = diff - dir * diff.dot(dir);
                        total_error += perp.length() as f64;
                        self.parts[*part_b].position -= perp * damping;

                        // Axis alignment
                        let dir_b_world = self.parts[*part_b].rotation * dir;
                        let cross = dir_b_world.cross(dir);
                        let cross_len = cross.length();
                        if cross_len > 1e-6 {
                            let angle = cross_len.atan2(dir_b_world.dot(dir));
                            total_error += angle.abs() as f64;
                            let correction = Quat::from_axis_angle(cross.normalize(), angle * damping);
                            self.parts[*part_b].rotation = correction * self.parts[*part_b].rotation;
                        }
                    }

                    AssemblyConstraint::Slider {
                        part_a,
                        part_b,
                        axis_origin,
                        axis_dir,
                    } => {
                        // Translation along axis only (1 DOF), rotation locked
                        let dir = Vec3::new(
                            axis_dir[0] as f32, axis_dir[1] as f32, axis_dir[2] as f32,
                        ).normalize();
                        let oa = Vec3::new(
                            axis_origin[0] as f32, axis_origin[1] as f32, axis_origin[2] as f32,
                        ) + self.parts[*part_a].position;
                        let ob = self.parts[*part_b].position;

                        // Radial constraint (keep on axis)
                        let diff = ob - oa;
                        let perp = diff - dir * diff.dot(dir);
                        total_error += perp.length() as f64;
                        self.parts[*part_b].position -= perp * damping;

                        // Lock rotation to match part_a
                        let rot_err = self.parts[*part_a].rotation * self.parts[*part_b].rotation.conjugate();
                        let (axis, angle) = rot_err.to_axis_angle();
                        if angle.abs() > 1e-6 {
                            total_error += angle.abs() as f64;
                            let correction = Quat::from_axis_angle(axis, angle * damping);
                            self.parts[*part_b].rotation = correction * self.parts[*part_b].rotation;
                        }
                    }

                    AssemblyConstraint::Ball {
                        part_a,
                        part_b,
                        center,
                    } => {
                        // Coincident point, free rotation (3 DOF)
                        let c = Vec3::new(center[0] as f32, center[1] as f32, center[2] as f32);
                        let ca = self.parts[*part_a].position + c;
                        let cb = self.parts[*part_b].position + c;
                        let err = cb - ca;
                        total_error += err.length() as f64;
                        self.parts[*part_b].position -= err * damping;
                    }

                    AssemblyConstraint::Distance {
                        part_a,
                        point_a,
                        part_b,
                        point_b,
                        distance,
                    } => {
                        let pa = Vec3::new(
                            point_a[0] as f32, point_a[1] as f32, point_a[2] as f32,
                        ) + self.parts[*part_a].position;
                        let pb = Vec3::new(
                            point_b[0] as f32, point_b[1] as f32, point_b[2] as f32,
                        ) + self.parts[*part_b].position;

                        let diff = pb - pa;
                        let current_dist = diff.length();
                        if current_dist > 1e-8 {
                            let dir = diff / current_dist;
                            let error = current_dist - *distance as f32;
                            total_error += error.abs() as f64;
                            self.parts[*part_b].position -= dir * error * damping;
                        }
                    }

                    AssemblyConstraint::Parallel {
                        part_a: _,
                        dir_a,
                        part_b,
                        dir_b,
                    } => {
                        let da = Vec3::new(dir_a[0] as f32, dir_a[1] as f32, dir_a[2] as f32).normalize();
                        let db = Vec3::new(dir_b[0] as f32, dir_b[1] as f32, dir_b[2] as f32);
                        let db_world = (self.parts[*part_b].rotation * db).normalize();

                        let cross = db_world.cross(da);
                        let cross_len = cross.length();
                        if cross_len > 1e-6 {
                            let angle = cross_len.atan2(db_world.dot(da));
                            total_error += angle.abs() as f64;
                            let correction = Quat::from_axis_angle(cross.normalize(), angle * damping);
                            self.parts[*part_b].rotation = correction * self.parts[*part_b].rotation;
                        }
                    }

                    AssemblyConstraint::Perpendicular {
                        part_a: _,
                        dir_a,
                        part_b,
                        dir_b,
                    } => {
                        let da = Vec3::new(dir_a[0] as f32, dir_a[1] as f32, dir_a[2] as f32).normalize();
                        let db = Vec3::new(dir_b[0] as f32, dir_b[1] as f32, dir_b[2] as f32);
                        let db_world = (self.parts[*part_b].rotation * db).normalize();

                        // dot product should be 0 for perpendicular
                        let dot = da.dot(db_world);
                        total_error += dot.abs() as f64;

                        if dot.abs() > 1e-6 {
                            let cross = da.cross(db_world);
                            if cross.length() > 1e-6 {
                                // Rotate to make angle = 90°
                                let current_angle = dot.clamp(-1.0, 1.0).acos();
                                let error = current_angle - std::f32::consts::FRAC_PI_2;
                                let correction = Quat::from_axis_angle(cross.normalize(), -error * damping);
                                self.parts[*part_b].rotation = correction * self.parts[*part_b].rotation;
                            }
                        }
                    }

                    AssemblyConstraint::Gear {
                        part_a,
                        axis_a,
                        radius_a,
                        part_b,
                        axis_b,
                        radius_b,
                    } => {
                        // Coupled rotation: θ_a * r_a = -θ_b * r_b
                        let aa = Vec3::new(axis_a[0] as f32, axis_a[1] as f32, axis_a[2] as f32).normalize();
                        let ab = Vec3::new(axis_b[0] as f32, axis_b[1] as f32, axis_b[2] as f32).normalize();

                        // Extract rotation angles about respective axes
                        let rot_a = self.parts[*part_a].rotation;
                        let rot_b = self.parts[*part_b].rotation;
                        let angle_a = signed_angle_about_axis(rot_a, aa);
                        let angle_b = signed_angle_about_axis(rot_b, ab);

                        let ratio = *radius_a as f32 / *radius_b as f32;
                        let target_b = -angle_a * ratio;
                        let error = angle_b - target_b;
                        total_error += error.abs() as f64;

                        if error.abs() > 1e-6 {
                            let correction = Quat::from_axis_angle(ab, -error * damping);
                            self.parts[*part_b].rotation = correction * self.parts[*part_b].rotation;
                        }
                    }

                    AssemblyConstraint::RackPinion {
                        part_a,
                        pinion_axis,
                        pitch_radius,
                        part_b,
                        rack_dir,
                    } => {
                        // Rotation of pinion → translation of rack: d = θ × r
                        let axis = Vec3::new(
                            pinion_axis[0] as f32, pinion_axis[1] as f32, pinion_axis[2] as f32,
                        ).normalize();
                        let dir = Vec3::new(
                            rack_dir[0] as f32, rack_dir[1] as f32, rack_dir[2] as f32,
                        ).normalize();

                        let angle = signed_angle_about_axis(self.parts[*part_a].rotation, axis);
                        let expected_translation = angle * *pitch_radius as f32;
                        let current_translation = self.parts[*part_b].position.dot(dir);
                        let error = current_translation - expected_translation;
                        total_error += error.abs() as f64;
                        self.parts[*part_b].position -= dir * error * damping;
                    }

                    AssemblyConstraint::Screw {
                        part_a,
                        part_b,
                        axis_origin,
                        axis_dir,
                        pitch,
                    } => {
                        // Coupled rotation + translation: z = θ × pitch/(2π)
                        let dir = Vec3::new(
                            axis_dir[0] as f32, axis_dir[1] as f32, axis_dir[2] as f32,
                        ).normalize();
                        let _origin = Vec3::new(
                            axis_origin[0] as f32, axis_origin[1] as f32, axis_origin[2] as f32,
                        );

                        let rot_rel = self.parts[*part_b].rotation * self.parts[*part_a].rotation.conjugate();
                        let angle = signed_angle_about_axis(rot_rel, dir);
                        let expected_z = angle * *pitch as f32 / (2.0 * std::f32::consts::PI);

                        let pos_diff = self.parts[*part_b].position - self.parts[*part_a].position;
                        let current_z = pos_diff.dot(dir);
                        let error = current_z - expected_z;
                        total_error += error.abs() as f64;
                        self.parts[*part_b].position -= dir * error * damping;
                    }
                }
            }

            if total_error < self.config.tolerance {
                let dof = self.compute_dof();
                return SolveResult {
                    converged: true,
                    iterations: iteration,
                    residual: total_error,
                    dof,
                    status: if dof == 0 {
                        SolveStatus::FullyConstrained
                    } else {
                        SolveStatus::UnderConstrained
                    },
                    algorithm_used: Some(crate::types::SolverAlgorithm::NewtonRaphson),
                    conflicting: vec![],
                    underconstrained: vec![],
                };
            }
        }

        SolveResult {
            converged: false,
            iterations: self.config.max_iterations,
            residual: f64::MAX,
            dof: self.compute_dof(),
            status: SolveStatus::DidNotConverge,
            algorithm_used: None,
            conflicting: vec![],
            underconstrained: vec![],
        }
    }

    /// Compute remaining DOF for the assembly (FreeCAD pattern: 6 per part minus constraint DOFs)
    fn compute_dof(&self) -> i32 {
        let mut dof = (self.parts.len() * 6) as i32;
        for constraint in &self.constraints {
            dof -= match constraint {
                AssemblyConstraint::Fixed { .. } => 6,
                AssemblyConstraint::Mate { .. } => 6,     // fully locked
                AssemblyConstraint::Align { .. } => 4,     // 2 DOF remain
                AssemblyConstraint::Offset { .. } => 5,    // 1 DOF remain (rotation in plane)
                AssemblyConstraint::AngleBetween { .. } => 1,
                AssemblyConstraint::Revolute { .. } => 5,  // 1 DOF: rotation
                AssemblyConstraint::Cylindrical { .. } => 4, // 2 DOF: rotation + translation
                AssemblyConstraint::Slider { .. } => 5,    // 1 DOF: translation
                AssemblyConstraint::Ball { .. } => 3,      // 3 DOF: rotations
                AssemblyConstraint::Distance { .. } => 1,
                AssemblyConstraint::Parallel { .. } => 2,
                AssemblyConstraint::Perpendicular { .. } => 1,
                AssemblyConstraint::Gear { .. } => 1,      // couples 2 rotations
                AssemblyConstraint::RackPinion { .. } => 1,
                AssemblyConstraint::Screw { .. } => 1,     // couples rotation→translation
            };
        }
        dof.max(0)
    }
}

impl Default for AssemblySolver {
    fn default() -> Self {
        Self::new(SolverConfig::default())
    }
}

/// Extract the signed rotation angle about a given axis from a quaternion
fn signed_angle_about_axis(q: Quat, axis: Vec3) -> f32 {
    let (q_axis, angle) = q.to_axis_angle();
    // Project quaternion rotation axis onto the desired axis
    let projection = q_axis.dot(axis);
    angle * projection.signum() * projection.abs().min(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    /// Helper: default PartTransform (identity)
    fn pt_default() -> PartTransform {
        PartTransform::default()
    }

    /// Helper: PartTransform with given position
    fn pt_at(x: f32, y: f32, z: f32) -> PartTransform {
        PartTransform {
            position: Vec3::new(x, y, z),
            rotation: Quat::IDENTITY,
        }
    }

    /// Helper: Fixed constraint at origin with identity rotation
    fn fixed_at_origin(part: usize) -> AssemblyConstraint {
        AssemblyConstraint::Fixed {
            part,
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0, 1.0],
        }
    }

    // ── PartTransform ────────────────────────────────────────────────────

    #[test]
    fn test_part_transform_default() {
        let pt = pt_default();
        assert_eq!(pt.position, Vec3::ZERO);
        assert_eq!(pt.rotation, Quat::IDENTITY);
    }

    #[test]
    fn test_part_transform_with_position() {
        let pt = pt_at(1.0, 2.0, 3.0);
        assert_eq!(pt.position, Vec3::new(1.0, 2.0, 3.0));
        assert_eq!(pt.rotation, Quat::IDENTITY);
    }

    #[test]
    fn test_part_transform_clone() {
        let pt = pt_at(5.0, 0.0, 0.0);
        let pt2 = pt.clone();
        assert_eq!(pt2.position, Vec3::new(5.0, 0.0, 0.0));
    }

    // ── AssemblySolver creation ──────────────────────────────────────────

    #[test]
    fn test_assembly_solver_new() {
        let solver = AssemblySolver::default();
        assert_eq!(solver.parts().len(), 0);
        assert_eq!(solver.constraints.len(), 0);
    }

    #[test]
    fn test_add_parts() {
        let mut solver = AssemblySolver::default();
        let id1 = solver.add_part(pt_default());
        let id2 = solver.add_part(pt_at(10.0, 0.0, 0.0));
        assert_eq!(id1, 0);
        assert_eq!(id2, 1);
        assert_eq!(solver.parts().len(), 2);
    }

    #[test]
    fn test_add_constraint() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default());
        solver.add_part(pt_at(10.0, 0.0, 0.0));
        solver.add_constraint(fixed_at_origin(0));
        assert_eq!(solver.constraints.len(), 1);
    }

    // ── DOF computation ──────────────────────────────────────────────────

    #[test]
    fn test_dof_unconstrained_parts() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default());
        solver.add_part(pt_default());
        let result = solver.solve();
        // 2 parts × 6 DOF each = 12
        assert_eq!(result.dof, 12);
    }

    #[test]
    fn test_dof_fixed_part() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default());
        solver.add_constraint(fixed_at_origin(0));
        let result = solver.solve();
        // 1 part × 6 DOF - 6 (fixed) = 0
        assert_eq!(result.dof, 0);
    }

    #[test]
    fn test_dof_revolute_joint() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default());
        solver.add_part(pt_default());
        solver.add_constraint(fixed_at_origin(0));
        solver.add_constraint(AssemblyConstraint::Revolute {
            part_a: 0,
            part_b: 1,
            axis_origin: [0.0, 0.0, 0.0],
            axis_dir: [0.0, 0.0, 1.0],
        });
        let result = solver.solve();
        // 12 - 6(fixed) - 5(revolute) = 1 DOF
        assert_eq!(result.dof, 1);
    }

    #[test]
    fn test_dof_ball_joint() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default());
        solver.add_part(pt_default());
        solver.add_constraint(fixed_at_origin(0));
        solver.add_constraint(AssemblyConstraint::Ball {
            part_a: 0,
            part_b: 1,
            center: [0.0, 0.0, 0.0],
        });
        let result = solver.solve();
        // 12 - 6(fixed) - 3(ball) = 3 DOF
        assert_eq!(result.dof, 3);
    }

    #[test]
    fn test_dof_slider() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default());
        solver.add_part(pt_default());
        solver.add_constraint(fixed_at_origin(0));
        solver.add_constraint(AssemblyConstraint::Slider {
            part_a: 0,
            part_b: 1,
            axis_origin: [0.0, 0.0, 0.0],
            axis_dir: [1.0, 0.0, 0.0],
        });
        let result = solver.solve();
        // 12 - 6(fixed) - 5(slider) = 1 DOF
        assert_eq!(result.dof, 1);
    }

    #[test]
    fn test_dof_cylindrical() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default());
        solver.add_part(pt_default());
        solver.add_constraint(fixed_at_origin(0));
        solver.add_constraint(AssemblyConstraint::Cylindrical {
            part_a: 0,
            part_b: 1,
            axis_origin: [0.0, 0.0, 0.0],
            axis_dir: [0.0, 0.0, 1.0],
        });
        let result = solver.solve();
        // 12 - 6(fixed) - 4(cylindrical) = 2 DOF
        assert_eq!(result.dof, 2);
    }

    #[test]
    fn test_dof_mate_fully_constrained() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default());
        solver.add_part(pt_default());
        solver.add_constraint(AssemblyConstraint::Mate {
            part_a: 0,
            part_b: 1,
            face_a_normal: [0.0, 0.0, 1.0],
            face_a_point: [0.0, 0.0, 0.0],
            face_b_normal: [0.0, 0.0, -1.0],
            face_b_point: [0.0, 0.0, 0.0],
        });
        let result = solver.solve();
        // 12 - 6(mate) = 6 DOF (part_a still free)
        assert_eq!(result.dof, 6);
    }

    #[test]
    fn test_dof_fully_constrained_two_parts() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default());
        solver.add_part(pt_default());
        solver.add_constraint(fixed_at_origin(0));
        solver.add_constraint(AssemblyConstraint::Mate {
            part_a: 0,
            part_b: 1,
            face_a_normal: [0.0, 0.0, 1.0],
            face_a_point: [0.0, 0.0, 0.0],
            face_b_normal: [0.0, 0.0, -1.0],
            face_b_point: [0.0, 0.0, 0.0],
        });
        let result = solver.solve();
        // 12 - 6(fixed) - 6(mate) = 0 DOF
        assert_eq!(result.dof, 0);
    }

    // ── Solve results ────────────────────────────────────────────────────

    #[test]
    fn test_solve_empty_assembly() {
        let mut solver = AssemblySolver::default();
        let result = solver.solve();
        assert_eq!(result.dof, 0);
        assert!(result.converged);
    }

    #[test]
    fn test_solve_fixed_constraint_preserves_position() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_at(5.0, 0.0, 0.0));
        solver.add_constraint(AssemblyConstraint::Fixed {
            part: 0,
            position: [5.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0, 1.0],
        });
        let result = solver.solve();
        assert!(result.converged);
        // Fixed part should keep its position
        assert!((solver.parts()[0].position.x - 5.0).abs() < 1e-5);
    }

    #[test]
    fn test_solve_mate_constraint_moves_part() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default()); // Part A at origin
        solver.add_part(pt_at(100.0, 0.0, 0.0)); // Part B far away
        solver.add_constraint(AssemblyConstraint::Mate {
            part_a: 0,
            part_b: 1,
            face_a_normal: [0.0, 0.0, 1.0],
            face_a_point: [0.0, 0.0, 0.0],
            face_b_normal: [0.0, 0.0, -1.0],
            face_b_point: [0.0, 0.0, 0.0],
        });
        let result = solver.solve();
        assert!(result.converged);
    }

    #[test]
    fn test_solve_distance_constraint() {
        let mut solver = AssemblySolver::default();
        solver.add_part(pt_default());
        solver.add_part(pt_at(10.0, 0.0, 0.0));
        solver.add_constraint(AssemblyConstraint::Distance {
            part_a: 0,
            part_b: 1,
            point_a: [0.0, 0.0, 0.0],
            point_b: [0.0, 0.0, 0.0],
            distance: 5.0,
        });
        let result = solver.solve();
        assert!(result.converged);
    }

    // ── signed_angle_about_axis ──────────────────────────────────────────

    #[test]
    fn test_signed_angle_identity() {
        let angle = signed_angle_about_axis(Quat::IDENTITY, Vec3::Z);
        assert!(angle.abs() < 1e-5, "Identity quaternion should give zero angle");
    }

    #[test]
    fn test_signed_angle_90_deg() {
        let q = Quat::from_rotation_z(PI / 2.0);
        let angle = signed_angle_about_axis(q, Vec3::Z);
        assert!((angle - PI / 2.0).abs() < 1e-4, "Expected ~90° got {}", angle.to_degrees());
    }

    #[test]
    fn test_signed_angle_negative() {
        let q = Quat::from_rotation_z(-PI / 4.0);
        let angle = signed_angle_about_axis(q, Vec3::Z);
        assert!((angle - (-PI / 4.0)).abs() < 1e-4);
    }

    // ── SolverConfig ─────────────────────────────────────────────────────

    #[test]
    fn test_solver_config_defaults() {
        let config = SolverConfig::default();
        assert_eq!(config.max_iterations, 100);
        assert!((config.tolerance - 1e-10).abs() < 1e-15);
        assert!(config.use_cascading);
    }
}
