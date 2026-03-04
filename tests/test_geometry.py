"""Unit tests for geometry module."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from model_schema import PrimitiveParams, PrimitiveType
from geometry import generate_primitive, compute_mesh_stats, compute_bounding_box


def test_box_generation():
    params = PrimitiveParams(primitive_type=PrimitiveType.BOX, width=10, height=10, depth=10)
    mesh = generate_primitive(params)
    assert len(mesh["vertices"]) > 0
    assert len(mesh["indices"]) > 0
    assert len(mesh["normals"]) == len(mesh["vertices"])

    stats = compute_mesh_stats(mesh["vertices"], mesh["indices"])
    assert stats["vertex_count"] == 24  # 6 faces * 4 vertices
    assert stats["face_count"] == 12    # 6 faces * 2 triangles


def test_sphere_generation():
    params = PrimitiveParams(primitive_type=PrimitiveType.SPHERE, radius=5, radial_segments=16)
    mesh = generate_primitive(params)
    assert len(mesh["vertices"]) > 0
    assert len(mesh["indices"]) > 0


def test_cylinder_generation():
    params = PrimitiveParams(primitive_type=PrimitiveType.CYLINDER, radius=5, cyl_height=10)
    mesh = generate_primitive(params)
    assert len(mesh["vertices"]) > 0


def test_torus_generation():
    params = PrimitiveParams(primitive_type=PrimitiveType.TORUS, radius=10, tube_radius=3)
    mesh = generate_primitive(params)
    assert len(mesh["vertices"]) > 0


def test_bounding_box():
    # Simple cube vertices (flat list)
    verts = [-5, -5, -5, 5, 5, 5]
    bb_min, bb_max = compute_bounding_box(verts)
    assert bb_min == [-5, -5, -5]
    assert bb_max == [5, 5, 5]


def test_mesh_stats_volume():
    params = PrimitiveParams(primitive_type=PrimitiveType.BOX, width=10, height=10, depth=10)
    mesh = generate_primitive(params)
    stats = compute_mesh_stats(mesh["vertices"], mesh["indices"])
    # Volume should be approximately 1000 (10x10x10)
    assert 990 < stats["volume"] < 1010
