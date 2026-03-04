//! DFM check implementations.

use shared_types::dfm::{DfmCategory, DfmFinding, DfmSeverity};
use shared_types::geometry::TriMesh;
use uuid::Uuid;

/// Check minimum wall thickness
pub fn check_wall_thickness(
    mesh: &TriMesh,
    min_thickness_mm: f64,
) -> Vec<DfmFinding> {
    let mut findings = Vec::new();

    // Ray-casting based wall thickness check
    // For each vertex, cast a ray inward along the inverted normal
    // and measure distance to the opposite wall
    // TODO: Implement full ray-casting wall thickness

    // Simplified: check bounding box aspect ratios for extremely thin features
    let size = mesh.bounds.size();
    let dims = [size.x as f64, size.y as f64, size.z as f64];

    for (i, &dim) in dims.iter().enumerate() {
        if dim > 0.0 && dim < min_thickness_mm as f64 {
            let axis = ["X", "Y", "Z"][i];
            findings.push(DfmFinding {
                id: Uuid::new_v4(),
                category: DfmCategory::WallThickness,
                severity: DfmSeverity::Warning,
                title: format!("Thin feature along {} axis", axis),
                description: format!(
                    "Part dimension along {} is {:.2}mm, below minimum {:.2}mm",
                    axis, dim, min_thickness_mm
                ),
                recommendation: format!(
                    "Increase wall thickness to at least {:.2}mm for reliable manufacturing",
                    min_thickness_mm
                ),
                affected_faces: Vec::new(),
                affected_edges: Vec::new(),
                measured_value: Some(dim),
                min_allowed: Some(min_thickness_mm),
                max_allowed: None,
                unit: "mm".into(),
            });
        }
    }

    findings
}

/// Check for sharp internal corners
pub fn check_sharp_corners(
    mesh: &TriMesh,
    min_radius_mm: f64,
) -> Vec<DfmFinding> {
    let mut findings = Vec::new();

    // Check edge angles between adjacent triangles
    // Sharp internal corners cause stress concentrations
    // TODO: Implement full edge-angle analysis

    findings
}

/// Check hole sizes for manufacturability
pub fn check_hole_sizes(
    min_hole_diameter_mm: f64,
    max_aspect_ratio: f64,
    holes: &[(f64, f64)], // (diameter_mm, depth_mm)
) -> Vec<DfmFinding> {
    let mut findings = Vec::new();

    for (i, (diameter, depth)) in holes.iter().enumerate() {
        if *diameter < min_hole_diameter_mm {
            findings.push(DfmFinding {
                id: Uuid::new_v4(),
                category: DfmCategory::HoleSize,
                severity: DfmSeverity::Error,
                title: format!("Hole {} too small", i + 1),
                description: format!(
                    "Hole diameter {:.2}mm is below minimum {:.2}mm",
                    diameter, min_hole_diameter_mm
                ),
                recommendation: format!(
                    "Increase hole diameter to at least {:.2}mm",
                    min_hole_diameter_mm
                ),
                affected_faces: Vec::new(),
                affected_edges: Vec::new(),
                measured_value: Some(*diameter),
                min_allowed: Some(min_hole_diameter_mm),
                max_allowed: None,
                unit: "mm".into(),
            });
        }

        let aspect_ratio = depth / diameter;
        if aspect_ratio > max_aspect_ratio {
            findings.push(DfmFinding {
                id: Uuid::new_v4(),
                category: DfmCategory::HoleSize,
                severity: DfmSeverity::Warning,
                title: format!("Deep hole {} (high aspect ratio)", i + 1),
                description: format!(
                    "Hole aspect ratio {:.1}:1 exceeds maximum {:.1}:1",
                    aspect_ratio, max_aspect_ratio
                ),
                recommendation: "Consider using peck drilling or reducing hole depth".into(),
                affected_faces: Vec::new(),
                affected_edges: Vec::new(),
                measured_value: Some(aspect_ratio),
                min_allowed: None,
                max_allowed: Some(max_aspect_ratio),
                unit: "ratio".into(),
            });
        }
    }

    findings
}

/// Check draft angles for mold ejection (injection molding / casting)
pub fn check_draft_angles(
    _mesh: &TriMesh,
    _min_draft_deg: f64,
    _pull_direction: [f64; 3],
) -> Vec<DfmFinding> {
    // TODO: Implement draft angle analysis
    // For each face, check angle between face normal and pull direction
    Vec::new()
}

/// Check bend relief requirements for sheet metal
pub fn check_bend_relief(
    thickness_mm: f64,
    bend_radius_mm: f64,
    relief_width_mm: f64,
    relief_depth_mm: f64,
) -> Vec<DfmFinding> {
    let mut findings = Vec::new();

    let min_relief_width = thickness_mm;
    let min_relief_depth = thickness_mm + bend_radius_mm;

    if relief_width_mm < min_relief_width {
        findings.push(DfmFinding {
            id: Uuid::new_v4(),
            category: DfmCategory::BendRelief,
            severity: DfmSeverity::Error,
            title: "Insufficient bend relief width".into(),
            description: format!(
                "Bend relief width {:.2}mm is less than material thickness {:.2}mm",
                relief_width_mm, thickness_mm
            ),
            recommendation: format!(
                "Increase bend relief width to at least {:.2}mm",
                min_relief_width
            ),
            affected_faces: Vec::new(),
            affected_edges: Vec::new(),
            measured_value: Some(relief_width_mm),
            min_allowed: Some(min_relief_width),
            max_allowed: None,
            unit: "mm".into(),
        });
    }

    if relief_depth_mm < min_relief_depth {
        findings.push(DfmFinding {
            id: Uuid::new_v4(),
            category: DfmCategory::BendRelief,
            severity: DfmSeverity::Warning,
            title: "Shallow bend relief".into(),
            description: format!(
                "Bend relief depth {:.2}mm should be at least {:.2}mm (thickness + bend radius)",
                relief_depth_mm, min_relief_depth
            ),
            recommendation: format!(
                "Increase bend relief depth to at least {:.2}mm",
                min_relief_depth
            ),
            affected_faces: Vec::new(),
            affected_edges: Vec::new(),
            measured_value: Some(relief_depth_mm),
            min_allowed: Some(min_relief_depth),
            max_allowed: None,
            unit: "mm".into(),
        });
    }

    findings
}
