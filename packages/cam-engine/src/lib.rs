//! # cam-engine
//!
//! CAM (Computer-Aided Manufacturing) engine with:
//! - CNC toolpath generation (roughing, finishing, drilling)
//! - Sheet metal cutting (laser, plasma, waterjet)
//! - Press brake bending (tonnage, bend allowance, springback)
//! - 2D nesting (rectangular + true-shape)
//! - G-code post-processors (Fanuc, Haas, Mazak, etc.)
//! - Physics-based estimators (Kienzle, Taylor, Loewen-Shaw, Altintas)

pub mod cnc;
pub mod gcode;
pub mod nesting;
pub mod sheet;
pub mod toolpath;
