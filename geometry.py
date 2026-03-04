"""
r3ditor — Pure geometry generation for 3D primitives.

All functions return mesh data as dicts with vertices/normals/indices.
No I/O or framework coupling.
"""
from __future__ import annotations

import math
import numpy as np
from model_schema import PrimitiveType, PrimitiveParams


def generate_primitive(params: PrimitiveParams) -> dict:
    """
    Generate mesh data for a primitive shape.
    Returns {"vertices": [...], "normals": [...], "indices": [...], "edges": [...]}.
    """
    pt = params.primitive_type
    if pt == PrimitiveType.BOX:
        return _gen_box(params.width, params.height, params.depth)
    elif pt == PrimitiveType.SPHERE:
        return _gen_sphere(params.radius, params.radial_segments)
    elif pt == PrimitiveType.CYLINDER:
        return _gen_cylinder(params.radius, params.radius, params.cyl_height,
                             params.radial_segments)
    elif pt == PrimitiveType.CONE:
        return _gen_cylinder(params.radius_top, params.radius_bottom,
                             params.cyl_height, params.radial_segments)
    elif pt == PrimitiveType.TORUS:
        return _gen_torus(params.radius, params.tube_radius,
                          params.radial_segments, params.tubular_segments)
    elif pt == PrimitiveType.PLANE:
        return _gen_plane(params.width, params.depth)
    else:
        return {"vertices": [], "normals": [], "indices": [], "edges": []}


def _gen_box(w: float, h: float, d: float) -> dict:
    """Generate a box centered at origin."""
    hw, hh, hd = w / 2, h / 2, d / 2

    # 8 corners
    corners = [
        (-hw, -hh, -hd), ( hw, -hh, -hd), ( hw,  hh, -hd), (-hw,  hh, -hd),
        (-hw, -hh,  hd), ( hw, -hh,  hd), ( hw,  hh,  hd), (-hw,  hh,  hd),
    ]

    # 6 faces, each with 4 vertices and unique normals
    faces = [
        # front (z+)
        ([4, 5, 6, 7], (0, 0, 1)),
        # back (z-)
        ([1, 0, 3, 2], (0, 0, -1)),
        # top (y+)
        ([3, 7, 6, 2], (0, 1, 0)),
        # bottom (y-)
        ([0, 1, 5, 4], (0, -1, 0)),
        # right (x+)
        ([1, 2, 6, 5], (1, 0, 0)),
        # left (x-)
        ([0, 4, 7, 3], (-1, 0, 0)),
    ]

    verts = []
    norms = []
    indices = []
    edges = []

    for ci, (face_idx, normal) in enumerate(faces):
        base = ci * 4
        for fi in face_idx:
            verts.extend(corners[fi])
            norms.extend(normal)
        indices.extend([base, base+1, base+2, base, base+2, base+3])

    # Edges (12 edges of a box)
    edge_pairs = [
        (0,1),(1,2),(2,3),(3,0),  # back
        (4,5),(5,6),(6,7),(7,4),  # front
        (0,4),(1,5),(2,6),(3,7),  # connecting
    ]
    for a, b in edge_pairs:
        edges.extend(list(corners[a]) + list(corners[b]))

    return {"vertices": verts, "normals": norms, "indices": indices, "edges": edges}


def _gen_sphere(radius: float, segments: int = 32) -> dict:
    """Generate a UV sphere."""
    rings = segments // 2
    verts = []
    norms = []
    indices = []

    for lat in range(rings + 1):
        theta = lat * math.pi / rings
        sin_t = math.sin(theta)
        cos_t = math.cos(theta)
        for lon in range(segments + 1):
            phi = lon * 2 * math.pi / segments
            x = sin_t * math.cos(phi)
            y = cos_t
            z = sin_t * math.sin(phi)
            verts.extend([x * radius, y * radius, z * radius])
            norms.extend([x, y, z])

    for lat in range(rings):
        for lon in range(segments):
            a = lat * (segments + 1) + lon
            b = a + segments + 1
            indices.extend([a, b, a + 1, b, b + 1, a + 1])

    # Edge wireframe (latitude + longitude lines)
    edges = _gen_sphere_edges(radius, max(12, segments // 2))

    return {"vertices": verts, "normals": norms, "indices": indices, "edges": edges}


def _gen_sphere_edges(radius: float, segs: int) -> list:
    edges = []
    # Latitude lines
    for lat_i in range(1, segs):
        theta = lat_i * math.pi / segs
        r = radius * math.sin(theta)
        y = radius * math.cos(theta)
        for lon_i in range(segs):
            phi1 = lon_i * 2 * math.pi / segs
            phi2 = (lon_i + 1) * 2 * math.pi / segs
            edges.extend([
                r * math.cos(phi1), y, r * math.sin(phi1),
                r * math.cos(phi2), y, r * math.sin(phi2),
            ])
    # Longitude lines
    for lon_i in range(segs):
        phi = lon_i * 2 * math.pi / segs
        for lat_i in range(segs):
            theta1 = lat_i * math.pi / segs
            theta2 = (lat_i + 1) * math.pi / segs
            edges.extend([
                radius * math.sin(theta1) * math.cos(phi),
                radius * math.cos(theta1),
                radius * math.sin(theta1) * math.sin(phi),
                radius * math.sin(theta2) * math.cos(phi),
                radius * math.cos(theta2),
                radius * math.sin(theta2) * math.sin(phi),
            ])
    return edges


def _gen_cylinder(r_top: float, r_bottom: float, height: float,
                  segments: int = 32) -> dict:
    """Generate a cylinder or cone."""
    hh = height / 2
    verts = []
    norms = []
    indices = []

    # Side vertices
    for i in range(segments + 1):
        angle = i * 2 * math.pi / segments
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)

        # Compute side normal
        dr = r_bottom - r_top
        ny = dr / math.sqrt(dr * dr + height * height) if abs(dr) > 1e-10 else 0
        nxz = height / math.sqrt(dr * dr + height * height) if height > 1e-10 else 1

        # Bottom vertex
        verts.extend([r_bottom * cos_a, -hh, r_bottom * sin_a])
        norms.extend([nxz * cos_a, ny, nxz * sin_a])

        # Top vertex
        verts.extend([r_top * cos_a, hh, r_top * sin_a])
        norms.extend([nxz * cos_a, ny, nxz * sin_a])

    for i in range(segments):
        a = i * 2
        b = a + 1
        c = a + 2
        d = a + 3
        indices.extend([a, c, b, b, c, d])

    # Top cap
    if r_top > 1e-10:
        cap_base = len(verts) // 3
        verts.extend([0, hh, 0])
        norms.extend([0, 1, 0])
        for i in range(segments + 1):
            angle = i * 2 * math.pi / segments
            verts.extend([r_top * math.cos(angle), hh, r_top * math.sin(angle)])
            norms.extend([0, 1, 0])
        for i in range(segments):
            indices.extend([cap_base, cap_base + 1 + i, cap_base + 2 + i])

    # Bottom cap
    if r_bottom > 1e-10:
        cap_base = len(verts) // 3
        verts.extend([0, -hh, 0])
        norms.extend([0, -1, 0])
        for i in range(segments + 1):
            angle = i * 2 * math.pi / segments
            verts.extend([r_bottom * math.cos(angle), -hh, r_bottom * math.sin(angle)])
            norms.extend([0, -1, 0])
        for i in range(segments):
            indices.extend([cap_base, cap_base + 2 + i, cap_base + 1 + i])

    # Edges
    edges = []
    for i in range(segments):
        a1 = i * 2 * math.pi / segments
        a2 = (i + 1) * 2 * math.pi / segments
        # Top circle
        if r_top > 1e-10:
            edges.extend([
                r_top * math.cos(a1), hh, r_top * math.sin(a1),
                r_top * math.cos(a2), hh, r_top * math.sin(a2),
            ])
        # Bottom circle
        if r_bottom > 1e-10:
            edges.extend([
                r_bottom * math.cos(a1), -hh, r_bottom * math.sin(a1),
                r_bottom * math.cos(a2), -hh, r_bottom * math.sin(a2),
            ])
    # Vertical edges (4 lines)
    for i in range(0, segments, max(1, segments // 4)):
        angle = i * 2 * math.pi / segments
        edges.extend([
            r_bottom * math.cos(angle), -hh, r_bottom * math.sin(angle),
            r_top * math.cos(angle), hh, r_top * math.sin(angle),
        ])

    return {"vertices": verts, "normals": norms, "indices": indices, "edges": edges}


def _gen_torus(radius: float, tube: float, radial: int = 32,
               tubular: int = 48) -> dict:
    """Generate a torus."""
    verts = []
    norms = []
    indices = []

    for j in range(radial + 1):
        for i in range(tubular + 1):
            u = i / tubular * 2 * math.pi
            v = j / radial * 2 * math.pi

            x = (radius + tube * math.cos(v)) * math.cos(u)
            y = tube * math.sin(v)
            z = (radius + tube * math.cos(v)) * math.sin(u)

            nx = math.cos(v) * math.cos(u)
            ny = math.sin(v)
            nz = math.cos(v) * math.sin(u)

            verts.extend([x, y, z])
            norms.extend([nx, ny, nz])

    for j in range(radial):
        for i in range(tubular):
            a = j * (tubular + 1) + i
            b = a + tubular + 1
            indices.extend([a, b, a + 1, b, b + 1, a + 1])

    edges = []
    for j in range(0, radial, max(1, radial // 8)):
        for i in range(tubular):
            u1 = i / tubular * 2 * math.pi
            u2 = (i + 1) / tubular * 2 * math.pi
            v = j / radial * 2 * math.pi
            edges.extend([
                (radius + tube * math.cos(v)) * math.cos(u1),
                tube * math.sin(v),
                (radius + tube * math.cos(v)) * math.sin(u1),
                (radius + tube * math.cos(v)) * math.cos(u2),
                tube * math.sin(v),
                (radius + tube * math.cos(v)) * math.sin(u2),
            ])

    return {"vertices": verts, "normals": norms, "indices": indices, "edges": edges}


def _gen_plane(w: float, d: float) -> dict:
    """Generate a flat plane (2 triangles)."""
    hw, hd = w / 2, d / 2
    verts = [
        -hw, 0, -hd,
         hw, 0, -hd,
         hw, 0,  hd,
        -hw, 0,  hd,
    ]
    norms = [0, 1, 0] * 4
    indices = [0, 2, 1, 0, 3, 2]
    edges = [
        -hw, 0, -hd,  hw, 0, -hd,
         hw, 0, -hd,  hw, 0,  hd,
         hw, 0,  hd, -hw, 0,  hd,
        -hw, 0,  hd, -hw, 0, -hd,
    ]
    return {"vertices": verts, "normals": norms, "indices": indices, "edges": edges}


# ── Mesh analysis utilities ─────────────────────────────────

def compute_bounding_box(vertices: list[float]) -> tuple[list, list]:
    """Compute AABB from flat vertex list. Returns (min_xyz, max_xyz)."""
    if not vertices:
        return [0, 0, 0], [0, 0, 0]
    arr = np.array(vertices).reshape(-1, 3)
    return arr.min(axis=0).tolist(), arr.max(axis=0).tolist()


def compute_mesh_stats(vertices: list[float], indices: list[int]) -> dict:
    """Compute vertex count, face count, bounding box, volume estimate."""
    n_verts = len(vertices) // 3 if vertices else 0
    n_faces = len(indices) // 3 if indices else 0
    bb_min, bb_max = compute_bounding_box(vertices)

    # Volume estimate via signed tetrahedron method
    volume = 0.0
    if vertices and indices:
        v = np.array(vertices).reshape(-1, 3)
        for i in range(0, len(indices), 3):
            if i + 2 < len(indices):
                a, b, c = v[indices[i]], v[indices[i+1]], v[indices[i+2]]
                volume += np.dot(a, np.cross(b, c)) / 6.0
    volume = abs(volume)

    # Surface area
    area = 0.0
    if vertices and indices:
        v = np.array(vertices).reshape(-1, 3)
        for i in range(0, len(indices), 3):
            if i + 2 < len(indices):
                a, b, c = v[indices[i]], v[indices[i+1]], v[indices[i+2]]
                area += np.linalg.norm(np.cross(b - a, c - a)) / 2.0

    return {
        "vertex_count": n_verts,
        "face_count": n_faces,
        "bbox_min": bb_min,
        "bbox_max": bb_max,
        "volume": round(volume, 4),
        "surface_area": round(area, 4),
    }


def center_mesh(vertices: list[float]) -> list[float]:
    """Translate vertices so centroid is at origin."""
    if not vertices:
        return vertices
    arr = np.array(vertices).reshape(-1, 3)
    centroid = arr.mean(axis=0)
    arr -= centroid
    return arr.flatten().tolist()
