//! Toolpath generation for CNC milling operations.

use shared_types::manufacturing::{CoolantType, Toolpath, ToolpathType};

/// Generate a simple adaptive clearing (roughing) toolpath
pub fn generate_roughing_toolpath(
    contour: &[[f64; 2]],
    depth: f64,
    step_down: f64,
    stepover: f64,
    feed_rate: f64,
    spindle_speed: f64,
    tool_id: &str,
) -> Toolpath {
    let mut points = Vec::new();
    let mut feed_rates = Vec::new();

    let num_layers = (depth / step_down).ceil() as i32;

    for layer in 0..num_layers {
        let z = -(layer as f64 + 1.0) * step_down;
        let z = z.max(-depth);

        // Offset contour inward by stepover for each pass
        for point in contour {
            points.push([point[0], point[1], z]);
            feed_rates.push(feed_rate);
        }
        // Close the loop
        if let Some(first) = contour.first() {
            points.push([first[0], first[1], z]);
            feed_rates.push(feed_rate);
        }
    }

    Toolpath {
        toolpath_type: ToolpathType::AdaptiveClearing,
        points,
        feed_rates,
        spindle_speed: Some(spindle_speed),
        tool_id: Some(tool_id.to_string()),
        coolant: CoolantType::Flood,
        depth_of_cut: Some(step_down),
        stepover: Some(stepover),
    }
}

/// Generate a parallel finishing toolpath (zigzag pattern)
pub fn generate_finishing_toolpath(
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
    z: f64,
    stepover: f64,
    feed_rate: f64,
    spindle_speed: f64,
    tool_id: &str,
) -> Toolpath {
    let mut points = Vec::new();
    let mut feed_rates = Vec::new();
    let mut y = y_min;
    let mut forward = true;

    while y <= y_max {
        if forward {
            points.push([x_min, y, z]);
            points.push([x_max, y, z]);
        } else {
            points.push([x_max, y, z]);
            points.push([x_min, y, z]);
        }
        feed_rates.push(feed_rate);
        feed_rates.push(feed_rate);
        forward = !forward;
        y += stepover;
    }

    Toolpath {
        toolpath_type: ToolpathType::ParallelFinish,
        points,
        feed_rates,
        spindle_speed: Some(spindle_speed),
        tool_id: Some(tool_id.to_string()),
        coolant: CoolantType::Flood,
        depth_of_cut: None,
        stepover: Some(stepover),
    }
}

/// Generate peck drilling toolpath
pub fn generate_peck_drill(
    x: f64,
    y: f64,
    total_depth: f64,
    peck_depth: f64,
    retract_height: f64,
    feed_rate: f64,
    spindle_speed: f64,
    tool_id: &str,
) -> Toolpath {
    let mut points = Vec::new();
    let mut feed_rates = Vec::new();
    let mut current_depth = 0.0;

    while current_depth < total_depth {
        current_depth += peck_depth;
        current_depth = current_depth.min(total_depth);

        // Plunge
        points.push([x, y, -current_depth]);
        feed_rates.push(feed_rate);

        // Retract
        points.push([x, y, retract_height]);
        feed_rates.push(feed_rate * 3.0); // Rapid retract
    }

    Toolpath {
        toolpath_type: ToolpathType::PeckDrill,
        points,
        feed_rates,
        spindle_speed: Some(spindle_speed),
        tool_id: Some(tool_id.to_string()),
        coolant: CoolantType::ThroughSpindle,
        depth_of_cut: Some(peck_depth),
        stepover: None,
    }
}
