//! Manufacturing process definitions.

use serde::{Deserialize, Serialize};

/// Manufacturing process type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ManufacturingProcess {
    CncMilling,
    CncTurning,
    CncMillTurn,
    LaserCutting,
    PlasmaCutting,
    WaterjetCutting,
    SheetBending,
    Welding,
    ThreeDPrinting,
}

/// Toolpath type for CNC operations
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolpathType {
    // CNC Milling
    AdaptiveClearing,
    Waterline,
    ParallelFinish,
    SpiralFinish,
    PencilFinish,
    ScallopFinish,
    PeckDrill,
    ChipBreakDrill,

    // Sheet Cutting
    ProfileCut,
    CommonLineCut,

    // Bending
    Bend,
}

/// A single toolpath segment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Toolpath {
    pub toolpath_type: ToolpathType,
    pub points: Vec<[f64; 3]>,       // XYZ positions
    pub feed_rates: Vec<f64>,         // mm/min per segment
    pub spindle_speed: Option<f64>,   // RPM
    pub tool_id: Option<String>,
    pub coolant: CoolantType,
    pub depth_of_cut: Option<f64>,    // mm
    pub stepover: Option<f64>,        // mm
}

/// Coolant type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CoolantType {
    None,
    Flood,
    Mist,
    ThroughSpindle,
    Air,
}

/// G-code program output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GCodeProgram {
    pub program_number: u32,
    pub code: String,
    pub estimated_time_min: f64,
    pub post_processor: String,
    pub line_count: usize,
}

/// Post-processor target machine
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PostProcessor {
    Fanuc,
    Haas,
    Mazak,
    Siemens,
    LinuxCnc,
    Grbl,
    Marlin,
    Klipper,
    Custom,
}

/// 2D nesting result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NestingResult {
    pub placements: Vec<NestingPlacement>,
    pub sheets_used: u32,
    pub efficiency_pct: f64,
    pub total_waste_area_mm2: f64,
}

/// A single part placement in a nesting layout
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NestingPlacement {
    pub part_id: uuid::Uuid,
    pub sheet_index: u32,
    pub x_mm: f64,
    pub y_mm: f64,
    pub rotation_deg: f64,
    pub mirrored: bool,
}
