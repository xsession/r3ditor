//! Camera system for 3D viewport navigation.

use glam::{Mat4, Quat, Vec3};

/// Projection type
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Projection {
    Perspective {
        fov_y: f32,
        near: f32,
        far: f32,
    },
    Orthographic {
        width: f32,
        height: f32,
        near: f32,
        far: f32,
    },
}

/// 3D camera with orbit controls
#[derive(Debug, Clone)]
pub struct Camera {
    /// Camera position in world space
    pub position: Vec3,
    /// Point the camera is looking at
    pub target: Vec3,
    /// Up direction
    pub up: Vec3,
    /// Projection settings
    pub projection: Projection,
    /// Viewport aspect ratio
    pub aspect_ratio: f32,
}

impl Camera {
    pub fn new_perspective(position: Vec3, target: Vec3, fov_degrees: f32, aspect: f32) -> Self {
        Self {
            position,
            target,
            up: Vec3::Y,
            projection: Projection::Perspective {
                fov_y: fov_degrees.to_radians(),
                near: 0.1,
                far: 10000.0,
            },
            aspect_ratio: aspect,
        }
    }

    pub fn new_orthographic(position: Vec3, target: Vec3, width: f32, aspect: f32) -> Self {
        let height = width / aspect;
        Self {
            position,
            target,
            up: Vec3::Y,
            projection: Projection::Orthographic {
                width,
                height,
                near: -10000.0,
                far: 10000.0,
            },
            aspect_ratio: aspect,
        }
    }

    /// View matrix (world → camera space)
    pub fn view_matrix(&self) -> Mat4 {
        Mat4::look_at_rh(self.position, self.target, self.up)
    }

    /// Projection matrix (camera → clip space)
    pub fn projection_matrix(&self) -> Mat4 {
        match self.projection {
            Projection::Perspective { fov_y, near, far } => {
                Mat4::perspective_rh(fov_y, self.aspect_ratio, near, far)
            }
            Projection::Orthographic {
                width,
                height,
                near,
                far,
            } => Mat4::orthographic_rh(
                -width / 2.0,
                width / 2.0,
                -height / 2.0,
                height / 2.0,
                near,
                far,
            ),
        }
    }

    /// View-projection matrix
    pub fn view_projection(&self) -> Mat4 {
        self.projection_matrix() * self.view_matrix()
    }

    /// Orbit around the target point
    pub fn orbit(&mut self, delta_x: f32, delta_y: f32) {
        let radius = (self.position - self.target).length();
        let offset = self.position - self.target;

        // Horizontal rotation (around Y axis)
        let rot_y = Quat::from_rotation_y(-delta_x * 0.01);
        let offset = rot_y * offset;

        // Vertical rotation (around right axis)
        let right = offset.cross(self.up).normalize();
        let rot_x = Quat::from_axis_angle(right, -delta_y * 0.01);
        let offset = rot_x * offset;

        // Prevent flipping
        let new_pos = self.target + offset.normalize() * radius;
        if new_pos.y.signum() == self.position.y.signum() || new_pos.y.abs() > 0.1 {
            self.position = new_pos;
        }
    }

    /// Pan the camera (move target and position together)
    pub fn pan(&mut self, delta_x: f32, delta_y: f32) {
        let forward = (self.target - self.position).normalize();
        let right = forward.cross(self.up).normalize();
        let up = right.cross(forward);

        let pan = right * (-delta_x * 0.005) + up * (delta_y * 0.005);
        self.position += pan;
        self.target += pan;
    }

    /// Zoom (move closer/further from target)
    pub fn zoom(&mut self, delta: f32) {
        let direction = (self.target - self.position).normalize();
        let distance = (self.position - self.target).length();
        let new_distance = (distance * (1.0 - delta * 0.001)).max(0.1);
        self.position = self.target - direction * new_distance;
    }

    /// Fit all (reset to view the given bounding box)
    pub fn fit_to_bounds(&mut self, min: Vec3, max: Vec3) {
        let center = (min + max) * 0.5;
        let size = (max - min).length();
        self.target = center;
        self.position = center + Vec3::new(size * 0.7, size * 0.5, size * 0.7);
    }

    /// Standard views
    pub fn set_front_view(&mut self) {
        let dist = (self.position - self.target).length();
        self.position = self.target + Vec3::new(0.0, 0.0, dist);
        self.up = Vec3::Y;
    }

    pub fn set_back_view(&mut self) {
        let dist = (self.position - self.target).length();
        self.position = self.target + Vec3::new(0.0, 0.0, -dist);
        self.up = Vec3::Y;
    }

    pub fn set_top_view(&mut self) {
        let dist = (self.position - self.target).length();
        self.position = self.target + Vec3::new(0.0, dist, 0.0);
        self.up = Vec3::NEG_Z;
    }

    pub fn set_right_view(&mut self) {
        let dist = (self.position - self.target).length();
        self.position = self.target + Vec3::new(dist, 0.0, 0.0);
        self.up = Vec3::Y;
    }

    pub fn set_isometric_view(&mut self) {
        let dist = (self.position - self.target).length();
        let d = dist / 3.0f32.sqrt();
        self.position = self.target + Vec3::new(d, d, d);
        self.up = Vec3::Y;
    }
}

impl Default for Camera {
    fn default() -> Self {
        Self::new_perspective(
            Vec3::new(5.0, 5.0, 5.0),
            Vec3::ZERO,
            45.0,
            16.0 / 9.0,
        )
    }
}
