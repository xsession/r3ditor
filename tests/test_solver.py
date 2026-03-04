"""Unit tests for SolveSpace constraint solver bridge."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from model_schema import (
    Sketch, SketchEntity, SketchEntityType,
    SketchConstraint, ConstraintType,
)
from solver_bridge import solve_sketch, extrude_sketch_profile


def test_horizontal_constraint():
    """A line with a horizontal constraint should have equal Y coordinates."""
    sketch = Sketch(plane="XY")
    line = SketchEntity(
        entity_type=SketchEntityType.LINE,
        x1=0, y1=0, x2=10, y2=5,  # Diagonal line
    )
    sketch.entities.append(line)

    con = SketchConstraint(
        constraint_type=ConstraintType.HORIZONTAL,
        entity_ids=[line.id],
    )
    sketch.constraints.append(con)

    result = solve_sketch(sketch)
    assert result.success

    # Check the line is now horizontal (y1 ≈ y2)
    solved = result.entities[0]
    assert abs(solved["y1"] - solved["y2"]) < 0.01


def test_vertical_constraint():
    """A line with a vertical constraint should have equal X coordinates."""
    sketch = Sketch(plane="XY")
    line = SketchEntity(
        entity_type=SketchEntityType.LINE,
        x1=0, y1=0, x2=5, y2=10,
    )
    sketch.entities.append(line)

    con = SketchConstraint(
        constraint_type=ConstraintType.VERTICAL,
        entity_ids=[line.id],
    )
    sketch.constraints.append(con)

    result = solve_sketch(sketch)
    assert result.success
    solved = result.entities[0]
    assert abs(solved["x1"] - solved["x2"]) < 0.01


def test_extrude_profile():
    """Extrude a triangle profile."""
    profile = [(0, 0), (10, 0), (5, 10)]
    mesh = extrude_sketch_profile(profile, height=5)

    assert len(mesh["vertices"]) > 0
    assert len(mesh["indices"]) > 0
    assert len(mesh["normals"]) > 0


def test_extrude_square():
    """Extrude a square profile."""
    profile = [(0, 0), (10, 0), (10, 10), (0, 10)]
    mesh = extrude_sketch_profile(profile, height=20)

    assert len(mesh["vertices"]) > 0
    assert len(mesh["indices"]) > 0


def test_empty_sketch():
    """An empty sketch should solve successfully."""
    sketch = Sketch()
    result = solve_sketch(sketch)
    assert result.success
