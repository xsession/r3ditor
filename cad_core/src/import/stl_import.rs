use std::collections::HashMap;
use std::{fs::File, io::BufReader, path::Path};

use anyhow::{Context, Result};

use crate::mesh::TriangleMesh;

/// A hash-friendly key for vertex deduplication.
/// We bitcast f32 → u32 so we can derive Hash/Eq.
#[derive(Hash, Eq, PartialEq)]
struct VertexKey([u32; 6]); // pos (3) + normal (3)

impl VertexKey {
    fn new(pos: [f32; 3], normal: [f32; 3]) -> Self {
        Self([
            pos[0].to_bits(),
            pos[1].to_bits(),
            pos[2].to_bits(),
            normal[0].to_bits(),
            normal[1].to_bits(),
            normal[2].to_bits(),
        ])
    }
}

/// Load STL (binary or ASCII) into a deduplicated triangle mesh.
///
/// Notes on large files:
/// - `stl_io` streams triangles from a reader, which is suitable for 500MB+ when used with `BufReader`.
/// - We deduplicate vertices using a `HashMap` to reduce memory usage significantly for typical STL exports.
pub fn load_stl(path: &Path) -> Result<TriangleMesh> {
    let file = File::open(path).with_context(|| format!("open STL: {path:?}"))?;
    let mut reader = BufReader::with_capacity(8 * 1024 * 1024, file);

    let stl = stl_io::read_stl(&mut reader).with_context(|| format!("parse STL: {path:?}"))?;

    let tri_count = stl.faces.len();
    let mut positions = Vec::with_capacity(tri_count * 3);
    let mut normals = Vec::with_capacity(tri_count * 3);
    let mut indices = Vec::with_capacity(tri_count * 3);
    let mut dedup: HashMap<VertexKey, u32> = HashMap::with_capacity(tri_count * 3);

    // STL stores per-face normal; vertices may be duplicated.
    for face in &stl.faces {
        let n = face.normal;
        let normal = [n[0], n[1], n[2]];
        for &vi in &face.vertices {
            let v = stl.vertices[vi as usize];
            let pos = [v[0], v[1], v[2]];
            let key = VertexKey::new(pos, normal);
            let idx = *dedup.entry(key).or_insert_with(|| {
                let i = positions.len() as u32;
                positions.push(pos);
                normals.push(normal);
                i
            });
            indices.push(idx);
        }
    }

    Ok(TriangleMesh::new(positions, normals, indices))
}
