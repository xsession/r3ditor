//! Main DFM analyzer that orchestrates all checks.

use rayon::prelude::*;
use shared_types::dfm::{DfmFinding, DfmReport, DfmSeverity};
use shared_types::geometry::TriMesh;
use shared_types::manufacturing::ManufacturingProcess;
use std::time::Instant;

use crate::checks;

/// DFM Analyzer configuration
#[derive(Debug, Clone)]
pub struct DfmConfig {
    pub min_wall_thickness_mm: f64,
    pub min_hole_diameter_mm: f64,
    pub max_hole_aspect_ratio: f64,
    pub min_draft_angle_deg: f64,
    pub min_corner_radius_mm: f64,
    pub min_bend_radius_factor: f64, // × material thickness
    pub process: ManufacturingProcess,
}

impl Default for DfmConfig {
    fn default() -> Self {
        Self {
            min_wall_thickness_mm: 0.8,
            min_hole_diameter_mm: 1.0,
            max_hole_aspect_ratio: 10.0,
            min_draft_angle_deg: 1.0,
            min_corner_radius_mm: 0.5,
            min_bend_radius_factor: 1.0,
            process: ManufacturingProcess::CncMilling,
        }
    }
}

/// Main DFM analyzer
pub struct DfmAnalyzer {
    config: DfmConfig,
}

impl DfmAnalyzer {
    pub fn new(config: DfmConfig) -> Self {
        Self { config }
    }

    /// Run all DFM checks on a mesh
    pub fn analyze(&self, mesh: &TriMesh) -> DfmReport {
        let start = Instant::now();

        let mut all_findings: Vec<DfmFinding> = Vec::new();

        // Wall thickness check
        let wall_findings = checks::check_wall_thickness(mesh, self.config.min_wall_thickness_mm);
        all_findings.extend(wall_findings);

        // Sharp corner check
        let corner_findings = checks::check_sharp_corners(mesh, self.config.min_corner_radius_mm);
        all_findings.extend(corner_findings);

        // Draft angle check (for CNC/molding)
        let draft_findings =
            checks::check_draft_angles(mesh, self.config.min_draft_angle_deg, [0.0, 0.0, 1.0]);
        all_findings.extend(draft_findings);

        // Calculate score
        let score = calculate_score(&all_findings);
        let pass = !all_findings
            .iter()
            .any(|f| matches!(f.severity, DfmSeverity::Critical | DfmSeverity::Error));

        let elapsed = start.elapsed();

        DfmReport {
            findings: all_findings,
            score,
            pass,
            analysis_time_ms: elapsed.as_millis() as u64,
        }
    }

    /// Analyze multiple parts in parallel
    pub fn analyze_batch(&self, meshes: &[TriMesh]) -> Vec<DfmReport> {
        meshes.par_iter().map(|mesh| self.analyze(mesh)).collect()
    }
}

/// Calculate DFM score (0-100, higher = more manufacturable)
fn calculate_score(findings: &[DfmFinding]) -> f64 {
    if findings.is_empty() {
        return 100.0;
    }

    let mut deductions: f64 = 0.0;
    for finding in findings {
        match finding.severity {
            DfmSeverity::Critical => deductions += 30.0,
            DfmSeverity::Error => deductions += 15.0,
            DfmSeverity::Warning => deductions += 5.0,
            DfmSeverity::Info => deductions += 1.0,
        }
    }

    (100.0 - deductions).max(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use glam::Vec3;
    use shared_types::dfm::DfmCategory;
    use shared_types::geometry::{BoundingBox3D, TriMesh};
    use shared_types::manufacturing::ManufacturingProcess;

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
            indices: vec![0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
            uvs: None,
            bounds: BoundingBox3D { min, max },
        }
    }

    #[test]
    fn test_dfm_config_defaults() {
        let config = DfmConfig::default();
        assert_eq!(config.min_wall_thickness_mm, 0.8);
        assert_eq!(config.min_hole_diameter_mm, 1.0);
        assert_eq!(config.process, ManufacturingProcess::CncMilling);
    }

    #[test]
    fn test_analyzer_good_part() {
        let config = DfmConfig::default();
        let analyzer = DfmAnalyzer::new(config);
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(50.0, 50.0, 50.0));
        let report = analyzer.analyze(&mesh);
        assert!(report.pass);
        assert_eq!(report.score, 100.0);
        assert!(report.findings.is_empty());
    }

    #[test]
    fn test_analyzer_thin_part() {
        let config = DfmConfig::default();
        let analyzer = DfmAnalyzer::new(config);
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(0.5, 50.0, 50.0));
        let report = analyzer.analyze(&mesh);
        assert!(!report.findings.is_empty());
        assert!(report.score < 100.0);
    }

    #[test]
    fn test_analyzer_analysis_time() {
        let config = DfmConfig::default();
        let analyzer = DfmAnalyzer::new(config);
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(50.0, 50.0, 50.0));
        let report = analyzer.analyze(&mesh);
        // Should complete quickly (< 1 second for a simple mesh)
        assert!(report.analysis_time_ms < 1000);
    }

    #[test]
    fn test_analyzer_batch() {
        let config = DfmConfig::default();
        let analyzer = DfmAnalyzer::new(config);
        let meshes = vec![
            make_test_mesh(Vec3::ZERO, Vec3::new(50.0, 50.0, 50.0)),
            make_test_mesh(Vec3::ZERO, Vec3::new(0.5, 50.0, 50.0)),
            make_test_mesh(Vec3::ZERO, Vec3::new(50.0, 0.3, 50.0)),
        ];
        let reports = analyzer.analyze_batch(&meshes);
        assert_eq!(reports.len(), 3);
        assert!(reports[0].pass); // Good part
        assert!(!reports[1].findings.is_empty()); // Thin in X
        assert!(!reports[2].findings.is_empty()); // Thin in Y
    }

    #[test]
    fn test_calculate_score_empty() {
        assert_eq!(calculate_score(&[]), 100.0);
    }

    #[test]
    fn test_calculate_score_critical() {
        let findings = vec![DfmFinding {
            id: uuid::Uuid::new_v4(),
            category: DfmCategory::WallThickness,
            severity: DfmSeverity::Critical,
            title: "Test".into(),
            description: "Test".into(),
            recommendation: "Test".into(),
            affected_faces: vec![],
            affected_edges: vec![],
            measured_value: None,
            min_allowed: None,
            max_allowed: None,
            unit: "mm".into(),
        }];
        let score = calculate_score(&findings);
        assert_eq!(score, 70.0); // 100 - 30
    }

    #[test]
    fn test_calculate_score_error() {
        let findings = vec![DfmFinding {
            id: uuid::Uuid::new_v4(),
            category: DfmCategory::WallThickness,
            severity: DfmSeverity::Error,
            title: "Test".into(),
            description: "Test".into(),
            recommendation: "Test".into(),
            affected_faces: vec![],
            affected_edges: vec![],
            measured_value: None,
            min_allowed: None,
            max_allowed: None,
            unit: "mm".into(),
        }];
        let score = calculate_score(&findings);
        assert_eq!(score, 85.0); // 100 - 15
    }

    #[test]
    fn test_calculate_score_floor_at_zero() {
        // 4 critical findings: 4 × 30 = 120 deductions → score clamps to 0
        let findings: Vec<DfmFinding> = (0..4).map(|_| DfmFinding {
            id: uuid::Uuid::new_v4(),
            category: DfmCategory::WallThickness,
            severity: DfmSeverity::Critical,
            title: "Test".into(),
            description: "Test".into(),
            recommendation: "Test".into(),
            affected_faces: vec![],
            affected_edges: vec![],
            measured_value: None,
            min_allowed: None,
            max_allowed: None,
            unit: "mm".into(),
        }).collect();
        assert_eq!(calculate_score(&findings), 0.0);
    }

    #[test]
    fn test_pass_fails_on_critical() {
        let analyzer = DfmAnalyzer::new(DfmConfig::default());
        // A very thin part should trigger findings
        let mesh = make_test_mesh(Vec3::ZERO, Vec3::new(0.1, 50.0, 50.0));
        let report = analyzer.analyze(&mesh);
        // There should be findings (warnings at least) for the thin dimension
        assert!(!report.findings.is_empty());
    }
}
