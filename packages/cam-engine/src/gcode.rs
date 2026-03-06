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

#[cfg(test)]
mod tests {
    use super::*;
    use shared_types::manufacturing::{CoolantType, Toolpath, ToolpathType};

    fn make_simple_toolpath() -> Toolpath {
        Toolpath {
            toolpath_type: ToolpathType::AdaptiveClearing,
            points: vec![
                [0.0, 0.0, 0.0],
                [10.0, 0.0, 0.0],
                [10.0, 10.0, 0.0],
            ],
            feed_rates: vec![1000.0, 1000.0, 1000.0],
            spindle_speed: Some(8000.0),
            tool_id: Some("T1".to_string()),
            coolant: CoolantType::Flood,
            depth_of_cut: Some(2.0),
            stepover: Some(5.0),
        }
    }

    #[test]
    fn test_generate_gcode_fanuc_header() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("%"));
        assert!(result.code.contains("O0001"));
        assert!(result.code.contains("G90 G21"));
    }

    #[test]
    fn test_generate_gcode_haas_header() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Haas, 42);
        assert!(result.code.contains("O0042"));
        assert!(result.code.contains("G40 G49 G80"));
    }

    #[test]
    fn test_generate_gcode_grbl_header() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Grbl, 1);
        assert!(result.code.contains("G90 G21"));
        assert!(!result.code.starts_with('%'));
    }

    #[test]
    fn test_generate_gcode_marlin_header() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Marlin, 1);
        assert!(result.code.contains("; R3DITOR CAM"));
        assert!(result.code.contains("G90 ; Absolute positioning"));
    }

    #[test]
    fn test_generate_gcode_contains_moves() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("G0"));
        assert!(result.code.contains("G1"));
        assert!(result.code.contains("X10.0000"));
    }

    #[test]
    fn test_generate_gcode_tool_change_fanuc() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("T1 M6"));
    }

    #[test]
    fn test_generate_gcode_tool_change_mazak() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Mazak, 1);
        assert!(result.code.contains("T1\n"));
        assert!(result.code.contains("M6"));
    }

    #[test]
    fn test_generate_gcode_spindle() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("S8000 M3"));
    }

    #[test]
    fn test_generate_gcode_coolant_flood() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("M8"));
        assert!(result.code.contains("M9"));
    }

    #[test]
    fn test_generate_gcode_footer_fanuc() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("M5 ; Spindle stop"));
        assert!(result.code.contains("M30 ; Program end"));
        // Fanuc ends with %
        let lines: Vec<&str> = result.code.lines().collect();
        assert_eq!(lines.last().unwrap(), &"%");
    }

    #[test]
    fn test_generate_gcode_program_number() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 99);
        assert_eq!(result.program_number, 99);
    }

    #[test]
    fn test_generate_gcode_line_count() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert_eq!(result.line_count, result.code.lines().count());
        assert!(result.line_count > 10);
    }

    #[test]
    fn test_generate_gcode_estimated_time() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert!(result.estimated_time_min > 0.0);
    }

    #[test]
    fn test_generate_gcode_empty_toolpaths() {
        let result = generate_gcode(&[], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("G90"));
        assert!(result.code.contains("M30"));
    }

    #[test]
    fn test_generate_gcode_multiple_toolpaths() {
        let tp1 = make_simple_toolpath();
        let mut tp2 = make_simple_toolpath();
        tp2.tool_id = Some("T2".to_string());
        let result = generate_gcode(&[tp1, tp2], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("Toolpath 1"));
        assert!(result.code.contains("Toolpath 2"));
    }

    #[test]
    fn test_generate_gcode_coolant_mist() {
        let mut tp = make_simple_toolpath();
        tp.coolant = CoolantType::Mist;
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("M7"));
    }

    #[test]
    fn test_generate_gcode_coolant_through_spindle() {
        let mut tp = make_simple_toolpath();
        tp.coolant = CoolantType::ThroughSpindle;
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("THROUGH-SPINDLE COOLANT"));
    }

    #[test]
    fn test_generate_gcode_retract_z() {
        let tp = make_simple_toolpath();
        let result = generate_gcode(&[tp], PostProcessor::Fanuc, 1);
        assert!(result.code.contains("G0 Z25.0"));
    }
}
