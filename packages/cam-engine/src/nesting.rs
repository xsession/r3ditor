//! 2D nesting — rectangular and true-shape part nesting.

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use shared_types::manufacturing::{NestingPlacement, NestingResult};
use uuid::Uuid;

/// A 2D part outline for nesting
#[derive(Debug, Clone)]
pub struct NestingPart {
    pub id: Uuid,
    pub width_mm: f64,
    pub height_mm: f64,
    pub quantity: u32,
    /// Allow rotation (0°, 90°, 180°, 270°)
    pub allow_rotation: bool,
    /// Outline polygon (for true-shape nesting)
    pub outline: Option<Vec<[f64; 2]>>,
}

/// Sheet definition for nesting
#[derive(Debug, Clone)]
pub struct NestingSheet {
    pub width_mm: f64,
    pub height_mm: f64,
    /// Margin from sheet edges
    pub margin_mm: f64,
    /// Spacing between parts
    pub spacing_mm: f64,
}

/// Rectangular nesting using bottom-left fill heuristic
pub fn rectangular_nest(
    parts: &[NestingPart],
    sheet: &NestingSheet,
) -> NestingResult {
    let usable_w = sheet.width_mm - 2.0 * sheet.margin_mm;
    let usable_h = sheet.height_mm - 2.0 * sheet.margin_mm;

    let mut placements = Vec::new();
    let mut current_x = sheet.margin_mm;
    let mut current_y = sheet.margin_mm;
    let mut row_height = 0.0f64;
    let mut sheet_index = 0u32;
    let mut total_parts_area = 0.0;

    // Flatten parts by quantity and sort by height (descending) for better packing
    let mut expanded: Vec<&NestingPart> = parts
        .iter()
        .flat_map(|p| std::iter::repeat(p).take(p.quantity as usize))
        .collect();
    expanded.sort_by(|a, b| b.height_mm.partial_cmp(&a.height_mm).unwrap());

    for part in &expanded {
        let (pw, ph) = (part.width_mm, part.height_mm);
        total_parts_area += pw * ph;

        // Try to place in current row
        if current_x + pw + sheet.spacing_mm <= usable_w + sheet.margin_mm {
            placements.push(NestingPlacement {
                part_id: part.id,
                sheet_index,
                x_mm: current_x,
                y_mm: current_y,
                rotation_deg: 0.0,
                mirrored: false,
            });
            current_x += pw + sheet.spacing_mm;
            row_height = row_height.max(ph);
        }
        // Try rotated 90°
        else if part.allow_rotation
            && current_x + ph + sheet.spacing_mm <= usable_w + sheet.margin_mm
        {
            placements.push(NestingPlacement {
                part_id: part.id,
                sheet_index,
                x_mm: current_x,
                y_mm: current_y,
                rotation_deg: 90.0,
                mirrored: false,
            });
            current_x += ph + sheet.spacing_mm;
            row_height = row_height.max(pw);
        }
        // Start new row
        else {
            current_y += row_height + sheet.spacing_mm;
            current_x = sheet.margin_mm;
            row_height = 0.0;

            // Check if new row fits on current sheet
            if current_y + ph > usable_h + sheet.margin_mm {
                // Start new sheet
                sheet_index += 1;
                current_x = sheet.margin_mm;
                current_y = sheet.margin_mm;
                row_height = 0.0;
            }

            placements.push(NestingPlacement {
                part_id: part.id,
                sheet_index,
                x_mm: current_x,
                y_mm: current_y,
                rotation_deg: 0.0,
                mirrored: false,
            });
            current_x += pw + sheet.spacing_mm;
            row_height = row_height.max(ph);
        }
    }

    let sheets_used = sheet_index + 1;
    let total_sheet_area = sheets_used as f64 * sheet.width_mm * sheet.height_mm;
    let efficiency = if total_sheet_area > 0.0 {
        total_parts_area / total_sheet_area * 100.0
    } else {
        0.0
    };

    NestingResult {
        placements,
        sheets_used,
        efficiency_pct: efficiency,
        total_waste_area_mm2: total_sheet_area - total_parts_area,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rectangular_nesting() {
        let parts = vec![NestingPart {
            id: Uuid::new_v4(),
            width_mm: 100.0,
            height_mm: 50.0,
            quantity: 8,
            allow_rotation: true,
            outline: None,
        }];

        let sheet = NestingSheet {
            width_mm: 1220.0,  // 4ft
            height_mm: 2440.0, // 8ft
            margin_mm: 10.0,
            spacing_mm: 3.0,
        };

        let result = rectangular_nest(&parts, &sheet);
        assert_eq!(result.placements.len(), 8);
        assert!(result.efficiency_pct > 0.0);
        assert_eq!(result.sheets_used, 1);
    }
}
