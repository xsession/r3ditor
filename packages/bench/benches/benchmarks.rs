//! Criterion benchmarks for r3ditor performance-critical paths.

use criterion::{black_box, criterion_group, criterion_main, Criterion};

use cad_kernel::brep::BRepModel;
use cad_kernel::tessellation::{self, TessellationConfig};
use cam_engine::cnc;
use cam_engine::nesting::{NestingPart, Sheet, rectangular_nest};
use constraint_solver::solver2d::SketchSolver;
use dfm_analyzer::DfmAnalyzer;
use shared_types::materials;

fn bench_tessellation(c: &mut Criterion) {
    let model = BRepModel::create_box("bench_box", 50.0, 30.0, 20.0);
    let config = TessellationConfig::default();

    c.bench_function("tessellate_box_50x30x20", |b| {
        b.iter(|| tessellation::tessellate(black_box(&model), black_box(&config)))
    });

    let cylinder = BRepModel::create_cylinder("bench_cyl", 25.0, 60.0, 64);
    c.bench_function("tessellate_cylinder_r25_h60", |b| {
        b.iter(|| tessellation::tessellate(black_box(&cylinder), black_box(&config)))
    });
}

fn bench_constraint_solver(c: &mut Criterion) {
    c.bench_function("solve_10_point_sketch", |b| {
        b.iter(|| {
            let mut solver = SketchSolver::new();
            // Add 10 points with distance and horizontal/vertical constraints
            for i in 0..10 {
                solver.add_point(i as f64 * 10.0 + 0.5, i as f64 * 5.0 + 0.3);
            }
            for i in 0..9 {
                solver.add_constraint(
                    constraint_solver::solver2d::Constraint2D::Distance {
                        p1: i,
                        p2: i + 1,
                        distance: 11.18,
                    },
                );
            }
            black_box(solver.solve())
        })
    });
}

fn bench_cnc_estimation(c: &mut Criterion) {
    let materials = materials::default_cnc_materials();
    let aluminum = &materials[0]; // 6061-T6

    c.bench_function("kienzle_cutting_force", |b| {
        b.iter(|| {
            cnc::kienzle_cutting_force(
                black_box(aluminum.specific_cutting_force),
                black_box(2.0),
                black_box(0.15),
                black_box(aluminum.mc_exponent),
            )
        })
    });

    c.bench_function("cnc_full_estimation", |b| {
        b.iter(|| {
            let params = cnc::CncParams {
                material: aluminum.clone(),
                tool_diameter: 10.0,
                depth_of_cut: 2.0,
                width_of_cut: 5.0,
                feed_per_tooth: 0.15,
                num_flutes: 3,
                spindle_speed_override: None,
            };
            let volume = 50.0 * 30.0 * 20.0 * 0.3; // 30% MRR
            black_box(cnc::estimate_cnc(&params, volume))
        })
    });
}

fn bench_nesting(c: &mut Criterion) {
    c.bench_function("nest_20_parts_on_sheet", |b| {
        let parts: Vec<NestingPart> = (0..20)
            .map(|i| NestingPart {
                id: format!("part_{}", i),
                width: 30.0 + (i as f64 % 5.0) * 10.0,
                height: 20.0 + (i as f64 % 3.0) * 8.0,
                quantity: 1,
                can_rotate: true,
            })
            .collect();

        let sheet = Sheet {
            width: 1000.0,
            height: 500.0,
            material_id: "steel".to_string(),
        };

        b.iter(|| black_box(rectangular_nest(black_box(&parts), black_box(&sheet), 3.0)))
    });
}

fn bench_dfm_analysis(c: &mut Criterion) {
    let model = BRepModel::create_box("dfm_test", 100.0, 50.0, 10.0);
    let config = TessellationConfig::default();
    let mesh = tessellation::tessellate(&model, &config);
    let analyzer = DfmAnalyzer::default();

    c.bench_function("dfm_analyze_box", |b| {
        b.iter(|| black_box(analyzer.analyze(black_box(&mesh))))
    });
}

criterion_group!(
    benches,
    bench_tessellation,
    bench_constraint_solver,
    bench_cnc_estimation,
    bench_nesting,
    bench_dfm_analysis,
);
criterion_main!(benches);
