use std::{fs::File, io::BufReader, path::Path};

use anyhow::{Context, Result};
use fyrox::utils::raw_mesh::RawMeshBuilder;

use crate::mesh::TriangleMesh;

/// Load STL (binary or ASCII) into a deduplicated triangle mesh.
///
/// Notes on large files:
/// - `stl_io` streams triangles from a reader, which is suitable for 500MB+ when used with `BufReader`.
/// - We deduplicate vertices using `RawMeshBuilder` to reduce memory usage significantly for typical STL exports.
pub fn load_stl(path: &Path) -> Result<TriangleMesh> {
    let file = File::open(path).with_context(|| format!("open STL: {path:?}"))?;
    let mut reader = BufReader::with_capacity(8 * 1024 * 1024, file);

    let stl = stl_io::read_stl(&mut reader).with_context(|| format!("parse STL: {path:?}"))?;

    // Start with capacities that are "close enough". Each face is 3 vertices.
    let tri_count = stl.faces.len();
    let mut builder = RawMeshBuilder::<([f32; 3], [f32; 3])>::new(tri_count * 3, tri_count * 3);

    // STL stores per-face normal; vertices may be duplicated.
    for face in &stl.faces {
        let n = face.normal;
        let normal = [n[0], n[1], n[2]];
        for &vi in &face.vertices {
            let v = stl.vertices[vi as usize];
            let pos = [v[0], v[1], v[2]];
            builder.insert((pos, normal));
        }
    }

    let raw = builder.build();
    let mut positions = Vec::with_capacity(raw.vertices.len());
    let mut normals = Vec::with_capacity(raw.vertices.len());
    for (p, n) in raw.vertices {
        positions.push(p);
        normals.push(n);
    }
    let indices: Vec<u32> = raw.indices.into_iter().map(|i| i as u32).collect();

    Ok(TriangleMesh::new(positions, normals, indices))
}
