"""
r3ditor — SolveSpace constraint solver bridge.

Wraps python-solvespace to provide 2D sketch constraint solving.
Falls back to a simple iterative solver if python-solvespace is not installed.
"""
from __future__ import annotations

import math
import logging
from dataclasses import dataclass, field

from model_schema import (
    Sketch,
    SketchEntity,
    SketchEntityType,
    SketchConstraint,
    ConstraintType,
)

log = logging.getLogger(__name__)

# Try to import python-solvespace
_HAS_SOLVESPACE = False
try:
    from python_solvespace import SolverSystem, ResultFlag
    _HAS_SOLVESPACE = True
    log.info("python-solvespace available — using native constraint solver")
except ImportError:
    try:
        from slvs import System as SolverSystem, SLVS_RESULT_OKAY
        _HAS_SOLVESPACE = True
        log.info("slvs available — using native constraint solver")
    except ImportError:
        log.warning("python-solvespace not found — using fallback solver")


# ── SolveSpace-based solver ─────────────────────────────────

@dataclass
class SolveResult:
    success: bool = False
    dof: int = 0
    entities: list[dict] = field(default_factory=list)
    message: str = ""


def solve_sketch(sketch: Sketch) -> SolveResult:
    """
    Solve a 2D sketch's constraints using SolveSpace.
    Returns updated entity positions and DOF.
    """
    if _HAS_SOLVESPACE:
        return _solve_with_solvespace(sketch)
    else:
        return _solve_fallback(sketch)


def _solve_with_solvespace(sketch: Sketch) -> SolveResult:
    """Use python-solvespace constraint solver."""
    try:
        sys = SolverSystem()

        # Create the workplane
        wp = sys.create_2d_base()

        # Map entity IDs to solver handles
        point_handles = {}   # entity_id -> (handle_x, handle_y) or point handle
        line_handles = {}    # entity_id -> line handle
        entity_points = {}   # entity_id -> list of point handles

        for ent in sketch.entities:
            if ent.entity_type == SketchEntityType.POINT:
                p = sys.add_point_2d(ent.px, ent.py, wp)
                point_handles[ent.id] = p
                entity_points[ent.id] = [p]

            elif ent.entity_type == SketchEntityType.LINE:
                p1 = sys.add_point_2d(ent.x1, ent.y1, wp)
                p2 = sys.add_point_2d(ent.x2, ent.y2, wp)
                line = sys.add_line_2d(p1, p2, wp)
                line_handles[ent.id] = line
                point_handles[f"{ent.id}_p1"] = p1
                point_handles[f"{ent.id}_p2"] = p2
                entity_points[ent.id] = [p1, p2]

            elif ent.entity_type == SketchEntityType.CIRCLE:
                center = sys.add_point_2d(ent.cx, ent.cy, wp)
                point_handles[f"{ent.id}_c"] = center
                entity_points[ent.id] = [center]

        # Add constraints
        for con in sketch.constraints:
            try:
                _add_solvespace_constraint(sys, con, point_handles,
                                           line_handles, entity_points, wp)
            except Exception as e:
                log.warning(f"Could not add constraint {con.id}: {e}")

        # Solve
        result = sys.solve()

        # Check result
        if hasattr(result, 'name'):
            success = result.name == 'OKAY'
        else:
            success = result == 0

        dof = sys.dof() if hasattr(sys, 'dof') else 0

        # Read back solved positions
        solved_entities = []
        for ent in sketch.entities:
            ed = ent.to_dict()
            if ent.entity_type == SketchEntityType.POINT:
                p = point_handles.get(ent.id)
                if p:
                    params = sys.params(p)
                    ed["px"] = params[0]
                    ed["py"] = params[1]

            elif ent.entity_type == SketchEntityType.LINE:
                p1 = point_handles.get(f"{ent.id}_p1")
                p2 = point_handles.get(f"{ent.id}_p2")
                if p1:
                    params = sys.params(p1)
                    ed["x1"] = params[0]
                    ed["y1"] = params[1]
                if p2:
                    params = sys.params(p2)
                    ed["x2"] = params[0]
                    ed["y2"] = params[1]

            elif ent.entity_type == SketchEntityType.CIRCLE:
                cp = point_handles.get(f"{ent.id}_c")
                if cp:
                    params = sys.params(cp)
                    ed["cx"] = params[0]
                    ed["cy"] = params[1]

            solved_entities.append(ed)

        return SolveResult(
            success=success,
            dof=dof,
            entities=solved_entities,
            message="Solved" if success else "Failed to converge",
        )

    except Exception as e:
        log.error(f"SolveSpace solver error: {e}")
        return _solve_fallback(sketch)


def _add_solvespace_constraint(sys, con, point_handles, line_handles,
                                entity_points, wp):
    """Add a single constraint to the SolveSpace system."""
    ct = con.constraint_type
    eids = con.entity_ids
    val = con.value

    if ct == ConstraintType.DISTANCE and len(eids) == 2 and val is not None:
        pts = []
        for eid in eids:
            if eid in point_handles:
                pts.append(point_handles[eid])
            elif eid in entity_points and entity_points[eid]:
                pts.append(entity_points[eid][0])
        if len(pts) == 2:
            sys.distance(pts[0], pts[1], val, wp)

    elif ct == ConstraintType.HORIZONTAL and len(eids) == 1:
        lid = eids[0]
        if lid in line_handles:
            sys.horizontal(line_handles[lid], wp)

    elif ct == ConstraintType.VERTICAL and len(eids) == 1:
        lid = eids[0]
        if lid in line_handles:
            sys.vertical(line_handles[lid], wp)

    elif ct == ConstraintType.COINCIDENT and len(eids) == 2:
        pts = []
        for eid in eids:
            if eid in point_handles:
                pts.append(point_handles[eid])
        if len(pts) == 2:
            sys.coincident(pts[0], pts[1], wp)

    elif ct == ConstraintType.PARALLEL and len(eids) == 2:
        lines = [line_handles.get(eid) for eid in eids if eid in line_handles]
        if len(lines) == 2:
            sys.parallel(lines[0], lines[1], wp)

    elif ct == ConstraintType.PERPENDICULAR and len(eids) == 2:
        lines = [line_handles.get(eid) for eid in eids if eid in line_handles]
        if len(lines) == 2:
            sys.perpendicular(lines[0], lines[1], wp)

    elif ct == ConstraintType.EQUAL and len(eids) == 2:
        lines = [line_handles.get(eid) for eid in eids if eid in line_handles]
        if len(lines) == 2:
            sys.equal(lines[0], lines[1], wp)

    elif ct == ConstraintType.FIX and len(eids) == 1:
        eid = eids[0]
        if eid in point_handles:
            # Dragged constraint to fix a point
            pass  # Handled differently in slvs


# ── Fallback solver (no SolveSpace) ─────────────────────────

def _solve_fallback(sketch: Sketch) -> SolveResult:
    """
    Simple iterative constraint solver fallback.
    Handles basic constraints without SolveSpace.
    """
    # Copy entity positions
    positions = {}
    for ent in sketch.entities:
        if ent.entity_type == SketchEntityType.POINT:
            positions[ent.id] = {"px": ent.px, "py": ent.py}
        elif ent.entity_type == SketchEntityType.LINE:
            positions[ent.id] = {
                "x1": ent.x1, "y1": ent.y1,
                "x2": ent.x2, "y2": ent.y2,
            }
        elif ent.entity_type == SketchEntityType.CIRCLE:
            positions[ent.id] = {
                "cx": ent.cx, "cy": ent.cy, "radius": ent.radius,
            }

    max_iters = 50
    converged = True

    for _ in range(max_iters):
        max_err = 0.0
        for con in sketch.constraints:
            err = _apply_fallback_constraint(con, positions, sketch.entities)
            max_err = max(max_err, err)
        if max_err < 1e-6:
            break
    else:
        converged = False

    # Build result
    solved_entities = []
    for ent in sketch.entities:
        ed = ent.to_dict()
        if ent.id in positions:
            ed.update(positions[ent.id])
        solved_entities.append(ed)

    # Count unconstrained DOFs (rough estimate)
    total_dof = 0
    for ent in sketch.entities:
        if ent.entity_type == SketchEntityType.POINT:
            total_dof += 2
        elif ent.entity_type == SketchEntityType.LINE:
            total_dof += 4
        elif ent.entity_type == SketchEntityType.CIRCLE:
            total_dof += 3
    for con in sketch.constraints:
        if con.constraint_type in (ConstraintType.COINCIDENT,):
            total_dof -= 2
        elif con.constraint_type in (ConstraintType.DISTANCE, ConstraintType.HORIZONTAL,
                                      ConstraintType.VERTICAL, ConstraintType.FIX):
            total_dof -= 1
        elif con.constraint_type in (ConstraintType.PARALLEL, ConstraintType.PERPENDICULAR):
            total_dof -= 1
    total_dof = max(0, total_dof)

    return SolveResult(
        success=converged,
        dof=total_dof,
        entities=solved_entities,
        message="Solved (fallback)" if converged else "Did not converge (fallback)",
    )


def _apply_fallback_constraint(con: SketchConstraint, positions: dict,
                                entities: list[SketchEntity]) -> float:
    """Apply a single constraint, returning the error magnitude."""
    ct = con.constraint_type
    eids = con.entity_ids

    if ct == ConstraintType.HORIZONTAL and len(eids) == 1:
        eid = eids[0]
        if eid in positions and "y1" in positions[eid]:
            p = positions[eid]
            dy = p["y2"] - p["y1"]
            mid = (p["y1"] + p["y2"]) / 2
            p["y1"] = mid
            p["y2"] = mid
            return abs(dy)

    elif ct == ConstraintType.VERTICAL and len(eids) == 1:
        eid = eids[0]
        if eid in positions and "x1" in positions[eid]:
            p = positions[eid]
            dx = p["x2"] - p["x1"]
            mid = (p["x1"] + p["x2"]) / 2
            p["x1"] = mid
            p["x2"] = mid
            return abs(dx)

    elif ct == ConstraintType.DISTANCE and len(eids) == 2 and con.value is not None:
        # Point-point distance
        p1 = positions.get(eids[0])
        p2 = positions.get(eids[1])
        if p1 and p2:
            x1 = p1.get("px", p1.get("x1", 0))
            y1 = p1.get("py", p1.get("y1", 0))
            x2 = p2.get("px", p2.get("x1", 0))
            y2 = p2.get("py", p2.get("y1", 0))
            dist = math.hypot(x2 - x1, y2 - y1)
            if dist > 1e-10:
                scale = con.value / dist
                mx, my = (x1 + x2) / 2, (y1 + y2) / 2
                dx, dy = (x2 - x1) / 2 * scale, (y2 - y1) / 2 * scale
                if "px" in p2:
                    p2["px"] = mx + dx
                    p2["py"] = my + dy
                if "px" in p1:
                    p1["px"] = mx - dx
                    p1["py"] = my - dy
                return abs(dist - con.value)

    elif ct == ConstraintType.COINCIDENT and len(eids) == 2:
        p1 = positions.get(eids[0])
        p2 = positions.get(eids[1])
        if p1 and p2:
            x1 = p1.get("px", p1.get("x1", 0))
            y1 = p1.get("py", p1.get("y1", 0))
            x2 = p2.get("px", p2.get("x1", 0))
            y2 = p2.get("py", p2.get("y1", 0))
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            err = math.hypot(x2 - x1, y2 - y1)
            if "px" in p1:
                p1["px"] = mx
                p1["py"] = my
            if "px" in p2:
                p2["px"] = mx
                p2["py"] = my
            return err

    return 0.0


# ── Extrude / Revolve helpers ───────────────────────────────

def extrude_sketch_profile(
    profile_points: list[tuple[float, float]],
    height: float,
    direction: tuple[float, float, float] = (0, 0, 1),
) -> dict:
    """
    Extrude a 2D profile (polygon) along a direction to create a 3D mesh.
    Returns {"vertices": [...], "normals": [...], "indices": [...]}.
    """
    import numpy as np

    n = len(profile_points)
    if n < 3:
        return {"vertices": [], "normals": [], "indices": []}

    dx, dy, dz = direction
    norm = math.sqrt(dx*dx + dy*dy + dz*dz)
    if norm < 1e-10:
        return {"vertices": [], "normals": [], "indices": []}
    dx, dy, dz = dx/norm * height, dy/norm * height, dz/norm * height

    verts = []
    norms = []
    indices = []

    # Bottom face vertices (in XY plane at z=0)
    for px, py in profile_points:
        verts.extend([px, py, 0])
        norms.extend([0, 0, -1])

    # Top face vertices
    for px, py in profile_points:
        verts.extend([px + dx, py + dy, dz])
        norms.extend([0, 0, 1])

    # Bottom face triangles (fan)
    for i in range(1, n - 1):
        indices.extend([0, i + 1, i])

    # Top face triangles (fan)
    base = n
    for i in range(1, n - 1):
        indices.extend([base, base + i, base + i + 1])

    # Side faces
    side_base = len(verts) // 3
    for i in range(n):
        i_next = (i + 1) % n
        p0 = profile_points[i]
        p1 = profile_points[i_next]

        # Calculate side normal
        edge = (p1[0] - p0[0], p1[1] - p0[1])
        sn = (edge[1], -edge[0], 0)  # perpendicular in XY
        sn_len = math.sqrt(sn[0]**2 + sn[1]**2)
        if sn_len > 1e-10:
            sn = (sn[0]/sn_len, sn[1]/sn_len, 0)

        # Four vertices for side quad
        qi = side_base + i * 4
        verts.extend([p0[0], p0[1], 0])
        norms.extend(list(sn))
        verts.extend([p1[0], p1[1], 0])
        norms.extend(list(sn))
        verts.extend([p1[0] + dx, p1[1] + dy, dz])
        norms.extend(list(sn))
        verts.extend([p0[0] + dx, p0[1] + dy, dz])
        norms.extend(list(sn))

        indices.extend([qi, qi+1, qi+2, qi, qi+2, qi+3])

    return {
        "vertices": verts,
        "normals": norms,
        "indices": indices,
    }
