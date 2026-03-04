//! STL parser (binary & ASCII).

use glam::Vec3;

use crate::mesh::WasmMesh;

/// Parse STL bytes (auto-detects binary vs ASCII)
pub fn parse_stl_bytes(data: &[u8]) -> Result<WasmMesh, String> {
    if data.len() < 84 {
        return Err("File too small to be a valid STL".to_string());
    }

    // Check if ASCII by looking at header
    if data.starts_with(b"solid ") {
        // Could be ASCII — but some binary STLs also start with "solid"
        // Check if it contains "facet" keyword
        let header_str = std::str::from_utf8(&data[..std::cmp::min(data.len(), 1024)]);
        if let Ok(s) = header_str {
            if s.contains("facet") {
                return parse_stl_ascii(data);
            }
        }
    }

    parse_stl_binary(data)
}

/// Parse binary STL
fn parse_stl_binary(data: &[u8]) -> Result<WasmMesh, String> {
    if data.len() < 84 {
        return Err("Invalid binary STL: too short".to_string());
    }

    // Skip 80-byte header
    let num_triangles = u32::from_le_bytes([data[80], data[81], data[82], data[83]]) as usize;

    let expected_size = 84 + num_triangles * 50;
    if data.len() < expected_size {
        return Err(format!(
            "Binary STL truncated: expected {} bytes, got {}",
            expected_size,
            data.len()
        ));
    }

    let mut mesh = WasmMesh::new();
    let mut offset = 84;

    for _ in 0..num_triangles {
        // Read normal (3 floats)
        let nx = f32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
        let ny = f32::from_le_bytes([data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]]);
        let nz = f32::from_le_bytes([data[offset + 8], data[offset + 9], data[offset + 10], data[offset + 11]]);
        let normal = Vec3::new(nx, ny, nz);
        offset += 12;

        // Read 3 vertices
        let base_idx = mesh.vertex_count() as u32;
        for _ in 0..3 {
            let x = f32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            let y = f32::from_le_bytes([data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]]);
            let z = f32::from_le_bytes([data[offset + 8], data[offset + 9], data[offset + 10], data[offset + 11]]);
            mesh.add_vertex(Vec3::new(x, y, z), normal);
            offset += 12;
        }

        mesh.add_triangle(base_idx, base_idx + 1, base_idx + 2);

        // Skip attribute byte count
        offset += 2;
    }

    Ok(mesh)
}

/// Parse ASCII STL
fn parse_stl_ascii(data: &[u8]) -> Result<WasmMesh, String> {
    let text = std::str::from_utf8(data).map_err(|e| format!("Invalid UTF-8: {}", e))?;
    let mut mesh = WasmMesh::new();

    let mut current_normal = Vec3::ZERO;
    let mut tri_verts: Vec<u32> = Vec::new();

    for line in text.lines() {
        let line = line.trim();

        if let Some(rest) = line.strip_prefix("facet normal ") {
            let parts: Vec<f32> = rest
                .split_whitespace()
                .filter_map(|s| s.parse().ok())
                .collect();
            if parts.len() == 3 {
                current_normal = Vec3::new(parts[0], parts[1], parts[2]);
            }
            tri_verts.clear();
        } else if let Some(rest) = line.strip_prefix("vertex ") {
            let parts: Vec<f32> = rest
                .split_whitespace()
                .filter_map(|s| s.parse().ok())
                .collect();
            if parts.len() == 3 {
                let idx = mesh.add_vertex(
                    Vec3::new(parts[0], parts[1], parts[2]),
                    current_normal,
                );
                tri_verts.push(idx);
            }
        } else if line.starts_with("endfacet") {
            if tri_verts.len() == 3 {
                mesh.add_triangle(tri_verts[0], tri_verts[1], tri_verts[2]);
            }
        }
    }

    if mesh.triangle_count() == 0 {
        return Err("No triangles found in ASCII STL".to_string());
    }

    Ok(mesh)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_binary_stl_header() {
        // Minimal binary STL with 0 triangles
        let mut data = vec![0u8; 80]; // header
        data.extend_from_slice(&0u32.to_le_bytes()); // 0 triangles

        let mesh = parse_stl_binary(&data).unwrap();
        assert_eq!(mesh.triangle_count(), 0);
    }
}
