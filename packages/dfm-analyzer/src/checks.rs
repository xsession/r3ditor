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

#[cfg(test)]
mod tests {
    use super::*;
    use glam::Vec3;
    use shared_types::geometry::{BoundingBox3D, TriMesh};

    fn make_test_mesh(min: Vec3, max: Vec3) -> TriMesh {
        TriMesh {
            positions: vec![
                [min.x, min.y, min.z],
                [max.x, min.y, min.z],
                [max.x, max.y, min.z],
                [min.x, max.y, min.z],
                [min.x, min.y, max.z],
                [max.x, min.y, max.z],
                [max.x, max.y, max.z],
                [min.x, max.y, max.z],
            ],
            normals: vec![[0.0, 0.0, 1.0]; 8],
            indices: vec![
                0, 1, 2, 0, 2, 3, // bottom
                4, 5, 6, 4, 6, 7, // top
            ],
            uvs: None,
            bounds: BoundingBox3D { min, max },
        }
    }

    // ── Wall Thickness ───────────────────────────────────────────────────

    #[test]
    fn test_wall_thickness_thin_x() {
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(0.5, 10.0, 10.0));
        let findings = check_wall_thickness(&mesh, 1.0);
        assert!(findings.len() >= 1);
        assert!(findings.iter().any(|f| f.title.contains("X")));
    }

    #[test]
    fn test_wall_thickness_thin_y() {
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(10.0, 0.3, 10.0));
        let findings = check_wall_thickness(&mesh, 1.0);
        assert!(findings.iter().any(|f| f.title.contains("Y")));
    }

    #[test]
    fn test_wall_thickness_thin_z() {
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(10.0, 10.0, 0.2));
        let findings = check_wall_thickness(&mesh, 1.0);
        assert!(findings.iter().any(|f| f.title.contains("Z")));
    }

    #[test]
    fn test_wall_thickness_ok() {
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(10.0, 10.0, 10.0));
        let findings = check_wall_thickness(&mesh, 1.0);
        assert!(findings.is_empty(), "No thin features in a 10mm cube");
    }

    #[test]
    fn test_wall_thickness_severity() {
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(0.5, 10.0, 10.0));
        let findings = check_wall_thickness(&mesh, 1.0);
        for f in &findings {
            assert_eq!(f.severity, DfmSeverity::Warning);
            assert_eq!(f.category, DfmCategory::WallThickness);
        }
    }

    #[test]
    fn test_wall_thickness_measured_value() {
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(0.5, 10.0, 10.0));
        let findings = check_wall_thickness(&mesh, 1.0);
        let f = &findings[0];
        assert!((f.measured_value.unwrap() - 0.5).abs() < 1e-10);
        assert!((f.min_allowed.unwrap() - 1.0).abs() < 1e-10);
    }

    // ── Sharp Corners (currently stub) ───────────────────────────────────

    #[test]
    fn test_sharp_corners_stub_empty() {
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(10.0, 10.0, 10.0));
        let findings = check_sharp_corners(&mesh, 0.5);
        assert!(findings.is_empty(), "Stub should return empty");
    }

    // ── Hole Sizes ───────────────────────────────────────────────────────

    #[test]
    fn test_hole_sizes_too_small() {
        let holes = vec![(0.5, 3.0)]; // diameter 0.5mm, depth 3mm
        let findings = check_hole_sizes(1.0, 10.0, &holes);
        assert!(findings.len() >= 1);
        assert!(findings.iter().any(|f| f.title.contains("too small")));
    }

    #[test]
    fn test_hole_sizes_high_aspect_ratio() {
        let holes = vec![(2.0, 30.0)]; // diameter 2mm, depth 30mm → aspect 15:1
        let findings = check_hole_sizes(1.0, 10.0, &holes);
        assert!(findings.iter().any(|f| f.title.contains("aspect ratio")));
    }

    #[test]
    fn test_hole_sizes_ok() {
        let holes = vec![(5.0, 10.0)]; // diameter 5mm, depth 10mm → aspect 2:1
        let findings = check_hole_sizes(1.0, 10.0, &holes);
        assert!(findings.is_empty());
    }

    #[test]
    fn test_hole_sizes_both_violations() {
        let holes = vec![(0.5, 10.0)]; // too small AND high aspect ratio (20:1)
        let findings = check_hole_sizes(1.0, 10.0, &holes);
        assert_eq!(findings.len(), 2, "Should find both small and high-aspect");
    }

    #[test]
    fn test_hole_sizes_multiple_holes() {
        let holes = vec![(5.0, 5.0), (0.3, 1.0), (3.0, 50.0)];
        let findings = check_hole_sizes(1.0, 10.0, &holes);
        // Hole 2: too small. Hole 3: high aspect. Hole 1: ok
        assert_eq!(findings.len(), 2);
    }

    // ── Draft Angles (stub) ──────────────────────────────────────────────

    #[test]
    fn test_draft_angles_stub_empty() {
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(10.0, 10.0, 10.0));
        let findings = check_draft_angles(&mesh, 1.0, [0.0, 0.0, 1.0]);
        assert!(findings.is_empty());
    }

    // ── Bend Relief ──────────────────────────────────────────────────────

    #[test]
    fn test_bend_relief_insufficient_width() {
        let findings = check_bend_relief(2.0, 3.0, 1.0, 10.0);
        assert!(findings.iter().any(|f| f.title.contains("width")));
        assert!(findings.iter().any(|f| f.severity == DfmSeverity::Error));
    }

    #[test]
    fn test_bend_relief_insufficient_depth() {
        let findings = check_bend_relief(2.0, 3.0, 5.0, 3.0);
        // min depth = thickness + radius = 2 + 3 = 5 > 3
        assert!(findings.iter().any(|f| f.title.contains("Shallow")));
    }

    #[test]
    fn test_bend_relief_ok() {
        let findings = check_bend_relief(2.0, 3.0, 5.0, 10.0);
        assert!(findings.is_empty(), "Adequate relief should have no findings");
    }

    #[test]
    fn test_bend_relief_both_violations() {
        let findings = check_bend_relief(2.0, 3.0, 1.0, 1.0);
        assert_eq!(findings.len(), 2);
    }
}
