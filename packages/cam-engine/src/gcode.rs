//! G-code generation and post-processors.

use shared_types::manufacturing::{GCodeProgram, PostProcessor, Toolpath, ToolpathType, CoolantType};
use std::fmt::Write;

/// Generate G-code from a set of toolpaths
pub fn generate_gcode(
    toolpaths: &[Toolpath],
    post: PostProcessor,
    program_number: u32,
) -> GCodeProgram {
    let mut code = String::new();
    let mut estimated_time = 0.0;

    // Program header
    write_header(&mut code, post, program_number);

    for (i, tp) in toolpaths.iter().enumerate() {
        write!(code, "\n(--- Toolpath {} : {:?} ---)\n", i + 1, tp.toolpath_type).unwrap();

        // Tool change
        if let Some(ref tool_id) = tp.tool_id {
            write_tool_change(&mut code, post, tool_id);
        }

        // Spindle on
        if let Some(rpm) = tp.spindle_speed {
            write_spindle(&mut code, post, rpm);
        }

        // Coolant
        write_coolant(&mut code, post, tp.coolant);

        // Toolpath moves
        for (j, point) in tp.points.iter().enumerate() {
            let feed = if j < tp.feed_rates.len() {
                tp.feed_rates[j]
            } else {
                *tp.feed_rates.last().unwrap_or(&1000.0)
            };

            if j == 0 {
                // Rapid to first point (at safe Z)
                writeln!(code, "G0 Z25.0").unwrap();
                writeln!(code, "G0 X{:.4} Y{:.4}", point[0], point[1]).unwrap();
                writeln!(code, "G1 Z{:.4} F{:.1}", point[2], feed * 0.5).unwrap();
            } else {
                writeln!(code, "G1 X{:.4} Y{:.4} Z{:.4} F{:.1}", point[0], point[1], point[2], feed).unwrap();
            }

            // Estimate time
            if j > 0 {
                let prev = &tp.points[j - 1];
                let dist = ((point[0] - prev[0]).powi(2)
                    + (point[1] - prev[1]).powi(2)
                    + (point[2] - prev[2]).powi(2))
                .sqrt();
                estimated_time += dist / feed;
            }
        }

        // Retract
        writeln!(code, "G0 Z25.0").unwrap();

        // Coolant off
        writeln!(code, "M9").unwrap();
    }

    // Program footer
    write_footer(&mut code, post, program_number);

    let line_count = code.lines().count();
    GCodeProgram {
        program_number,
        code,
        estimated_time_min: estimated_time,
        post_processor: format!("{:?}", post),
        line_count,
    }
}

fn write_header(code: &mut String, post: PostProcessor, program_number: u32) {
    match post {
        PostProcessor::Fanuc | PostProcessor::Haas => {
            writeln!(code, "%").unwrap();
            writeln!(code, "O{:04}", program_number).unwrap();
            writeln!(code, "(R3DITOR CAM - GENERATED PROGRAM)").unwrap();
            writeln!(code, "G90 G21 G17 G40 G49 G80").unwrap(); // Absolute, metric, XY plane, cancel comp
        }
        PostProcessor::LinuxCnc | PostProcessor::Grbl => {
            writeln!(code, "(R3DITOR CAM - GENERATED PROGRAM)").unwrap();
            writeln!(code, "G90 G21").unwrap();
        }
        PostProcessor::Marlin | PostProcessor::Klipper => {
            writeln!(code, "; R3DITOR CAM - GENERATED PROGRAM").unwrap();
            writeln!(code, "G90 ; Absolute positioning").unwrap();
            writeln!(code, "G21 ; Millimeters").unwrap();
        }
        _ => {
            writeln!(code, "(R3DITOR CAM - GENERATED PROGRAM)").unwrap();
            writeln!(code, "G90 G21").unwrap();
        }
    }
}

fn write_tool_change(code: &mut String, post: PostProcessor, tool_id: &str) {
    match post {
        PostProcessor::Fanuc | PostProcessor::Haas => {
            writeln!(code, "T{} M6", tool_id).unwrap();
        }
        PostProcessor::Mazak => {
            writeln!(code, "T{}", tool_id).unwrap();
            writeln!(code, "M6").unwrap();
        }
        _ => {
            writeln!(code, "(TOOL: {})", tool_id).unwrap();
        }
    }
}

fn write_spindle(code: &mut String, post: PostProcessor, rpm: f64) {
    writeln!(code, "S{:.0} M3", rpm).unwrap();
}

fn write_coolant(code: &mut String, _post: PostProcessor, coolant: CoolantType) {
    match coolant {
        CoolantType::Flood => writeln!(code, "M8").unwrap(),
        CoolantType::Mist => writeln!(code, "M7").unwrap(),
        CoolantType::ThroughSpindle => {
            writeln!(code, "M8").unwrap();
            writeln!(code, "(THROUGH-SPINDLE COOLANT)").unwrap();
        }
        CoolantType::Air => writeln!(code, "(AIR BLAST ON)").unwrap(),
        CoolantType::None => {}
    }
}

fn write_footer(code: &mut String, post: PostProcessor, program_number: u32) {
    writeln!(code, "\nM5 ; Spindle stop").unwrap();
    writeln!(code, "M30 ; Program end").unwrap();
    match post {
        PostProcessor::Fanuc | PostProcessor::Haas => {
            writeln!(code, "%").unwrap();
        }
        _ => {}
    }
}
