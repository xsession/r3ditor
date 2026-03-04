//! High-level CAD operations that modify B-Rep geometry.
//!
//! These operations implement the parametric modeling pipeline:
//! Sketch → Extrude → Fillet → Boolean → etc.

use anyhow::Result;
use tracing::info;

use crate::brep::BRepModel;
use crate::features::*;

/// Execute a feature operation on a B-Rep model
pub fn execute_feature(model: &mut BRepModel, feature: &Feature) -> Result<()> {
    match feature {
        Feature::Extrude {
            distance,
            direction,
            draft_angle,
            symmetric,
            ..
        } => {
            let dist = distance.as_value().unwrap_or(10.0);
            info!(
                "Extruding {} by {:.2}mm (draft: {:?}, symmetric: {})",
                model.name, dist, draft_angle, symmetric
            );
            // TODO: Integrate with truck-modeling extrude
            model.mark_dirty();
            Ok(())
        }

        Feature::Revolve { axis, angle, .. } => {
            let ang = angle.as_value().unwrap_or(360.0);
            info!("Revolving {} by {:.1}° around {:?}", model.name, ang, axis);
            // TODO: Integrate with truck-modeling revolve
            model.mark_dirty();
            Ok(())
        }

        Feature::Fillet { edges, radius, .. } => {
            let r = radius.as_value().unwrap_or(1.0);
            info!(
                "Filleting {} edges on {} with radius {:.2}mm",
                edges.len(),
                model.name,
                r
            );
            // TODO: Integrate with truck-modeling fillet
            model.mark_dirty();
            Ok(())
        }

        Feature::Chamfer {
            edges, distance, ..
        } => {
            let d = distance.as_value().unwrap_or(1.0);
            info!(
                "Chamfering {} edges on {} with distance {:.2}mm",
                edges.len(),
                model.name,
                d
            );
            // TODO: Integrate with truck-modeling chamfer
            model.mark_dirty();
            Ok(())
        }

        Feature::BooleanOp { op, .. } => {
            info!("Boolean {:?} operation on {}", op, model.name);
            // TODO: Integrate with truck-shapeops
            model.mark_dirty();
            Ok(())
        }

        Feature::Shell { thickness, .. } => {
            let t = thickness.as_value().unwrap_or(1.0);
            info!("Shelling {} with thickness {:.2}mm", model.name, t);
            // TODO: Integrate with truck-modeling shell
            model.mark_dirty();
            Ok(())
        }

        Feature::Pattern {
            pattern_type,
            count,
            spacing,
            ..
        } => {
            let n = count.as_value().unwrap_or(3.0) as u32;
            let s = spacing.as_value().unwrap_or(10.0);
            info!(
                "Creating {:?} pattern on {} ({} copies, {:.2}mm spacing)",
                pattern_type, model.name, n, s
            );
            // TODO: Implement pattern via transforms
            model.mark_dirty();
            Ok(())
        }

        Feature::Mirror { plane, .. } => {
            info!("Mirroring {} about {:?}", model.name, plane);
            // TODO: Implement mirror via transform
            model.mark_dirty();
            Ok(())
        }

        Feature::Sketch2D { .. } => {
            info!("Creating 2D sketch on {}", model.name);
            Ok(())
        }

        Feature::SheetMetalBend { bend_angle, bend_radius, k_factor, .. } => {
            let angle = bend_angle.as_value().unwrap_or(90.0);
            let radius = bend_radius.as_value().unwrap_or(1.0);
            info!(
                "Sheet metal bend on {}: {:.1}° r={:.2}mm k={:.3}",
                model.name, angle, radius, k_factor
            );
            // TODO: Implement sheet metal bending
            model.mark_dirty();
            Ok(())
        }

        Feature::Import { format, filename, .. } => {
            info!("Importing {:?} file: {}", format, filename);
            // TODO: Integrate with truck-stepio / OpenCascade
            model.mark_dirty();
            Ok(())
        }
    }
}
