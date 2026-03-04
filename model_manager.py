"""
r3ditor — Model manager: import, export, scene management.

Handles file I/O for 3D models (STL, OBJ, GLTF, 3MF, PLY).
Manages in-memory scenes and object lifecycle.
"""
from __future__ import annotations

import io
import json
import logging
import pathlib
import struct
import uuid
from typing import Any

import numpy as np

from model_schema import (
    Scene, SceneObject, FeatureType, PrimitiveParams, PrimitiveType,
    Transform, Vec3, Material, MeasureResult,
)
from geometry import generate_primitive, compute_mesh_stats, compute_bounding_box

log = logging.getLogger(__name__)

# Optional trimesh import
_HAS_TRIMESH = False
try:
    import trimesh
    _HAS_TRIMESH = True
except ImportError:
    log.warning("trimesh not installed — advanced mesh operations unavailable")


# ── Scene store (in-memory) ─────────────────────────────────

_SCENES: dict[str, Scene] = {}


def get_or_create_scene(scene_id: str | None = None) -> Scene:
    """Get scene by ID or create a new one."""
    if scene_id and scene_id in _SCENES:
        return _SCENES[scene_id]
    scene = Scene()
    _SCENES[scene.id] = scene
    return scene


def get_scene(scene_id: str) -> Scene | None:
    return _SCENES.get(scene_id)


def list_scenes() -> list[dict]:
    return [
        {"id": s.id, "name": s.name, "object_count": len(s.objects)}
        for s in _SCENES.values()
    ]


def delete_scene(scene_id: str) -> bool:
    if scene_id in _SCENES:
        del _SCENES[scene_id]
        return True
    return False


# ── Object creation ─────────────────────────────────────────

def create_primitive_object(
    scene_id: str,
    primitive_type: str,
    name: str | None = None,
    params: dict | None = None,
    transform: dict | None = None,
    material: dict | None = None,
) -> SceneObject:
    """Create a primitive object and add it to the scene."""
    scene = get_or_create_scene(scene_id)

    pt = PrimitiveType(primitive_type)
    prim_params = PrimitiveParams(primitive_type=pt)
    if params:
        prim_params = PrimitiveParams.from_dict({**prim_params.to_dict(), **params})

    # Auto-name
    if not name:
        count = sum(1 for o in scene.objects.values()
                    if o.feature_type == FeatureType.PRIMITIVE)
        name = f"{pt.value.capitalize()} {count + 1}"

    obj = SceneObject(
        name=name,
        feature_type=FeatureType.PRIMITIVE,
        params=prim_params,
        transform=Transform.from_dict(transform) if transform else Transform(),
        material=Material.from_dict(material) if material else Material(),
    )

    # Generate mesh
    mesh = generate_primitive(prim_params)
    obj.vertices = mesh["vertices"]
    obj.normals = mesh["normals"]
    obj.indices = mesh["indices"]
    obj.edges = mesh.get("edges", [])

    scene.add_object(obj)
    return obj


def update_object(scene_id: str, obj_id: str, updates: dict) -> SceneObject | None:
    """Update object properties (transform, material, params)."""
    scene = get_scene(scene_id)
    if not scene:
        return None
    obj = scene.get_object(obj_id)
    if not obj:
        return None

    if "name" in updates:
        obj.name = updates["name"]
    if "visible" in updates:
        obj.visible = updates["visible"]
    if "locked" in updates:
        obj.locked = updates["locked"]
    if "transform" in updates:
        obj.transform = Transform.from_dict(updates["transform"])
    if "material" in updates:
        obj.material = Material.from_dict(updates["material"])
    if "params" in updates and obj.params:
        old = obj.params.to_dict()
        old.update(updates["params"])
        obj.params = PrimitiveParams.from_dict(old)
        # Regenerate mesh
        mesh = generate_primitive(obj.params)
        obj.vertices = mesh["vertices"]
        obj.normals = mesh["normals"]
        obj.indices = mesh["indices"]
        obj.edges = mesh.get("edges", [])

    return obj


def delete_object(scene_id: str, obj_id: str) -> bool:
    scene = get_scene(scene_id)
    if not scene:
        return False
    return scene.remove_object(obj_id)


def duplicate_object(scene_id: str, obj_id: str) -> SceneObject | None:
    """Duplicate an object in the scene."""
    scene = get_scene(scene_id)
    if not scene:
        return None
    orig = scene.get_object(obj_id)
    if not orig:
        return None

    new_obj = SceneObject(
        name=f"{orig.name} (copy)",
        feature_type=orig.feature_type,
        transform=Transform.from_dict(orig.transform.to_dict()),
        material=Material.from_dict(orig.material.to_dict()),
        params=PrimitiveParams.from_dict(orig.params.to_dict()) if orig.params else None,
        vertices=list(orig.vertices) if orig.vertices else None,
        normals=list(orig.normals) if orig.normals else None,
        indices=list(orig.indices) if orig.indices else None,
        edges=list(orig.edges) if orig.edges else None,
        source_file=orig.source_file,
        file_format=orig.file_format,
    )
    # Offset a bit so it's visible
    new_obj.transform.position.x += 5
    scene.add_object(new_obj)
    return new_obj


# ── File import ─────────────────────────────────────────────

def import_file(scene_id: str, file_path: str, file_data: bytes | None = None,
                filename: str | None = None) -> SceneObject | None:
    """Import a 3D model file into the scene."""
    scene = get_or_create_scene(scene_id)
    path = pathlib.Path(file_path) if file_path else None
    ext = (path.suffix if path else pathlib.Path(filename or "").suffix).lower()

    if not filename:
        filename = path.name if path else "imported"

    obj_name = pathlib.Path(filename).stem

    if ext == ".stl":
        mesh_data = _import_stl(file_path, file_data)
    elif ext == ".obj":
        mesh_data = _import_obj(file_path, file_data)
    elif ext in (".glb", ".gltf"):
        mesh_data = _import_gltf(file_path, file_data)
    elif ext == ".ply":
        mesh_data = _import_ply(file_path, file_data)
    elif ext == ".3mf":
        mesh_data = _import_3mf(file_path, file_data)
    else:
        log.error(f"Unsupported file format: {ext}")
        return None

    if not mesh_data or not mesh_data.get("vertices"):
        log.error(f"Failed to import: {filename}")
        return None

    obj = SceneObject(
        name=obj_name,
        feature_type=FeatureType.IMPORT,
        vertices=mesh_data["vertices"],
        normals=mesh_data.get("normals", []),
        indices=mesh_data.get("indices", []),
        edges=mesh_data.get("edges", []),
        source_file=filename,
        file_format=ext.lstrip("."),
    )

    # Center the mesh
    if obj.vertices:
        bb_min, bb_max = compute_bounding_box(obj.vertices)
        cx = (bb_min[0] + bb_max[0]) / 2
        cy = (bb_min[1] + bb_max[1]) / 2
        cz = (bb_min[2] + bb_max[2]) / 2
        arr = np.array(obj.vertices).reshape(-1, 3)
        arr -= [cx, cy, cz]
        obj.vertices = arr.flatten().tolist()

    scene.add_object(obj)
    return obj


def _import_stl(file_path: str | None, file_data: bytes | None) -> dict | None:
    """Import STL file (binary or ASCII)."""
    if _HAS_TRIMESH:
        return _import_with_trimesh(file_path, file_data, "stl")

    # Fallback: simple binary STL parser
    data = file_data
    if not data and file_path:
        data = pathlib.Path(file_path).read_bytes()
    if not data:
        return None

    try:
        return _parse_binary_stl(data)
    except Exception:
        return _parse_ascii_stl(data)


def _parse_binary_stl(data: bytes) -> dict:
    """Parse binary STL."""
    header = data[:80]
    num_triangles = struct.unpack("<I", data[80:84])[0]

    verts = []
    norms = []
    indices = []

    offset = 84
    for i in range(num_triangles):
        nx, ny, nz = struct.unpack("<3f", data[offset:offset+12])
        offset += 12
        for j in range(3):
            x, y, z = struct.unpack("<3f", data[offset:offset+12])
            offset += 12
            vi = i * 3 + j
            verts.extend([x, y, z])
            norms.extend([nx, ny, nz])
            indices.append(vi)
        offset += 2  # attribute byte count

    return {"vertices": verts, "normals": norms, "indices": indices, "edges": []}


def _parse_ascii_stl(data: bytes) -> dict:
    """Parse ASCII STL."""
    text = data.decode("utf-8", errors="replace")
    verts = []
    norms = []
    indices = []
    current_normal = [0, 0, 0]
    vi = 0

    for line in text.splitlines():
        line = line.strip()
        if line.startswith("facet normal"):
            parts = line.split()
            current_normal = [float(parts[2]), float(parts[3]), float(parts[4])]
        elif line.startswith("vertex"):
            parts = line.split()
            verts.extend([float(parts[1]), float(parts[2]), float(parts[3])])
            norms.extend(current_normal)
            indices.append(vi)
            vi += 1

    return {"vertices": verts, "normals": norms, "indices": indices, "edges": []}


def _import_obj(file_path: str | None, file_data: bytes | None) -> dict | None:
    """Import OBJ file."""
    if _HAS_TRIMESH:
        return _import_with_trimesh(file_path, file_data, "obj")

    # Fallback: simple OBJ parser
    text = None
    if file_data:
        text = file_data.decode("utf-8", errors="replace")
    elif file_path:
        text = pathlib.Path(file_path).read_text(errors="replace")
    if not text:
        return None

    positions = []
    normals_pool = []
    verts = []
    norms = []
    indices = []

    for line in text.splitlines():
        line = line.strip()
        if line.startswith("v "):
            parts = line.split()
            positions.append([float(parts[1]), float(parts[2]), float(parts[3])])
        elif line.startswith("vn "):
            parts = line.split()
            normals_pool.append([float(parts[1]), float(parts[2]), float(parts[3])])
        elif line.startswith("f "):
            parts = line.split()[1:]
            face_verts = []
            for p in parts:
                indices_parts = p.split("/")
                vi = int(indices_parts[0]) - 1
                ni = int(indices_parts[2]) - 1 if len(indices_parts) > 2 and indices_parts[2] else -1
                face_verts.append((vi, ni))

            # Triangulate face
            for i in range(1, len(face_verts) - 1):
                for idx in [0, i, i + 1]:
                    vi, ni = face_verts[idx]
                    vert_idx = len(verts) // 3
                    verts.extend(positions[vi])
                    if ni >= 0 and ni < len(normals_pool):
                        norms.extend(normals_pool[ni])
                    else:
                        norms.extend([0, 0, 0])
                    indices.append(vert_idx)

    return {"vertices": verts, "normals": norms, "indices": indices, "edges": []}


def _import_gltf(file_path: str | None, file_data: bytes | None) -> dict | None:
    if _HAS_TRIMESH:
        return _import_with_trimesh(file_path, file_data, "glb")
    return None


def _import_ply(file_path: str | None, file_data: bytes | None) -> dict | None:
    if _HAS_TRIMESH:
        return _import_with_trimesh(file_path, file_data, "ply")
    return None


def _import_3mf(file_path: str | None, file_data: bytes | None) -> dict | None:
    if _HAS_TRIMESH:
        return _import_with_trimesh(file_path, file_data, "3mf")
    return None


def _import_with_trimesh(file_path: str | None, file_data: bytes | None,
                          fmt: str) -> dict | None:
    """Use trimesh for robust mesh loading."""
    try:
        if file_data:
            mesh = trimesh.load(
                io.BytesIO(file_data),
                file_type=fmt,
                force="mesh",
            )
        elif file_path:
            mesh = trimesh.load(file_path, force="mesh")
        else:
            return None

        if isinstance(mesh, trimesh.Scene):
            mesh = mesh.dump(concatenate=True)

        verts = mesh.vertices.flatten().tolist()
        faces = mesh.faces.flatten().tolist()

        # Compute vertex normals
        if hasattr(mesh, "vertex_normals") and mesh.vertex_normals is not None:
            norms = mesh.vertex_normals.flatten().tolist()
        else:
            norms = []
            for v in mesh.vertices:
                norms.extend([0, 1, 0])

        return {"vertices": verts, "normals": norms, "indices": faces, "edges": []}

    except Exception as e:
        log.error(f"trimesh import failed: {e}")
        return None


# ── File export ─────────────────────────────────────────────

def export_scene(scene_id: str, fmt: str = "stl") -> bytes | None:
    """Export entire scene to a file format."""
    scene = get_scene(scene_id)
    if not scene:
        return None

    # Combine all visible meshes
    all_verts = []
    all_indices = []
    offset = 0

    for obj in scene.objects.values():
        if not obj.visible or not obj.vertices or not obj.indices:
            continue
        v = np.array(obj.vertices).reshape(-1, 3)
        all_verts.append(v)
        idx = np.array(obj.indices) + offset
        all_indices.append(idx)
        offset += len(v)

    if not all_verts:
        return None

    combined_verts = np.vstack(all_verts)
    combined_indices = np.concatenate(all_indices)

    if fmt == "stl":
        return _export_stl(combined_verts, combined_indices)
    elif fmt == "obj":
        return _export_obj(combined_verts, combined_indices)
    elif fmt == "json":
        return json.dumps({
            "vertices": combined_verts.flatten().tolist(),
            "indices": combined_indices.tolist(),
        }).encode()
    return None


def export_object(scene_id: str, obj_id: str, fmt: str = "stl") -> bytes | None:
    """Export a single object."""
    scene = get_scene(scene_id)
    if not scene:
        return None
    obj = scene.get_object(obj_id)
    if not obj or not obj.vertices or not obj.indices:
        return None

    verts = np.array(obj.vertices).reshape(-1, 3)
    indices = np.array(obj.indices)

    if fmt == "stl":
        return _export_stl(verts, indices)
    elif fmt == "obj":
        return _export_obj(verts, indices)
    return None


def _export_stl(verts: np.ndarray, indices: np.ndarray) -> bytes:
    """Export as binary STL."""
    num_triangles = len(indices) // 3
    buf = io.BytesIO()

    # Header (80 bytes)
    buf.write(b"r3ditor export" + b"\0" * 66)
    buf.write(struct.pack("<I", num_triangles))

    for i in range(num_triangles):
        i0, i1, i2 = indices[i*3], indices[i*3+1], indices[i*3+2]
        v0, v1, v2 = verts[i0], verts[i1], verts[i2]

        # Face normal
        edge1 = v1 - v0
        edge2 = v2 - v0
        normal = np.cross(edge1, edge2)
        norm_len = np.linalg.norm(normal)
        if norm_len > 1e-10:
            normal /= norm_len

        buf.write(struct.pack("<3f", *normal))
        buf.write(struct.pack("<3f", *v0))
        buf.write(struct.pack("<3f", *v1))
        buf.write(struct.pack("<3f", *v2))
        buf.write(struct.pack("<H", 0))

    return buf.getvalue()


def _export_obj(verts: np.ndarray, indices: np.ndarray) -> bytes:
    """Export as OBJ."""
    lines = ["# r3ditor export", ""]
    for v in verts:
        lines.append(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}")

    lines.append("")
    for i in range(0, len(indices), 3):
        i0, i1, i2 = indices[i]+1, indices[i+1]+1, indices[i+2]+1
        lines.append(f"f {i0} {i1} {i2}")

    return "\n".join(lines).encode()


# ── Measurement ─────────────────────────────────────────────

def measure_object(scene_id: str, obj_id: str) -> MeasureResult | None:
    """Compute measurements for an object."""
    scene = get_scene(scene_id)
    if not scene:
        return None
    obj = scene.get_object(obj_id)
    if not obj or not obj.vertices:
        return None

    stats = compute_mesh_stats(obj.vertices, obj.indices or [])
    bb_min = stats["bbox_min"]
    bb_max = stats["bbox_max"]

    return MeasureResult(
        volume=stats["volume"],
        area=stats["surface_area"],
        bbox_min=Vec3(*bb_min),
        bbox_max=Vec3(*bb_max),
        center=Vec3(
            (bb_min[0] + bb_max[0]) / 2,
            (bb_min[1] + bb_max[1]) / 2,
            (bb_min[2] + bb_max[2]) / 2,
        ),
    )


def measure_distance(scene_id: str, obj_id_1: str, obj_id_2: str) -> float | None:
    """Measure center-to-center distance between two objects."""
    scene = get_scene(scene_id)
    if not scene:
        return None
    o1 = scene.get_object(obj_id_1)
    o2 = scene.get_object(obj_id_2)
    if not o1 or not o2:
        return None

    p1 = o1.transform.position
    p2 = o2.transform.position
    import math
    return math.sqrt((p2.x-p1.x)**2 + (p2.y-p1.y)**2 + (p2.z-p1.z)**2)
