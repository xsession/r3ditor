//! Unit system and conversions.

use serde::{Deserialize, Serialize};

/// Length unit
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LengthUnit {
    Millimeter,
    Centimeter,
    Meter,
    Inch,
    Foot,
}

impl LengthUnit {
    /// Convert a value from this unit to millimeters
    pub fn to_mm(&self, value: f64) -> f64 {
        match self {
            LengthUnit::Millimeter => value,
            LengthUnit::Centimeter => value * 10.0,
            LengthUnit::Meter => value * 1000.0,
            LengthUnit::Inch => value * 25.4,
            LengthUnit::Foot => value * 304.8,
        }
    }

    /// Convert a value from millimeters to this unit
    pub fn from_mm(&self, mm: f64) -> f64 {
        match self {
            LengthUnit::Millimeter => mm,
            LengthUnit::Centimeter => mm / 10.0,
            LengthUnit::Meter => mm / 1000.0,
            LengthUnit::Inch => mm / 25.4,
            LengthUnit::Foot => mm / 304.8,
        }
    }
}

/// Angle unit
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AngleUnit {
    Degrees,
    Radians,
}

impl AngleUnit {
    pub fn to_radians(&self, value: f64) -> f64 {
        match self {
            AngleUnit::Degrees => value.to_radians(),
            AngleUnit::Radians => value,
        }
    }

    pub fn to_degrees(&self, value: f64) -> f64 {
        match self {
            AngleUnit::Degrees => value,
            AngleUnit::Radians => value.to_degrees(),
        }
    }
}

/// A parameter value that can be a fixed number or an expression
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Parameter {
    /// Fixed numeric value
    Value(f64),
    /// Expression referencing other parameters (e.g. "width * 2")
    Expression(String),
    /// Reference to another parameter by name
    Reference(String),
}

impl Parameter {
    /// Get the resolved numeric value (only works for Value variant)
    pub fn as_value(&self) -> Option<f64> {
        match self {
            Parameter::Value(v) => Some(*v),
            _ => None,
        }
    }
}
