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
