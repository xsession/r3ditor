"""
r3ditor — Flask server: REST JSON API + static file serving.

All responses are JSON. No templates, no SSR, no WebSocket.
"""
from __future__ import annotations

import io
import logging
import pathlib
import uuid

from flask import Flask, jsonify, request, send_from_directory, Response
from werkzeug.utils import secure_filename

import model_manager as mm
import model_schema as ms
import solver_bridge as solver
from geometry import compute_mesh_stats

# ── App setup ───────────────────────────────────────────────

_HERE = pathlib.Path(__file__).resolve().parent
_UPLOAD_DIR = _HERE / "uploads"
_UPLOAD_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
log = logging.getLogger("r3ditor")

app = Flask(
    __name__,
    static_folder=str(_HERE / "web"),
    static_url_path="",
)
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024  # 200 MB upload limit


# ── Static file serving ────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


# ── Scene management ────────────────────────────────────────

@app.route("/api/scenes")
def list_scenes():
    """List all active scenes."""
    return jsonify(mm.list_scenes())


@app.route("/api/scene", methods=["POST"])
def create_scene():
    """Create a new scene."""
    body = request.get_json(force=True) if request.data else {}
    scene = mm.get_or_create_scene()
    if body.get("name"):
        scene.name = body["name"]
    return jsonify(scene.summary())


@app.route("/api/scene/<scene_id>")
def get_scene(scene_id: str):
    """Get full scene with mesh data."""
    scene = mm.get_scene(scene_id)
    if not scene:
        return jsonify({"error": f"Scene not found: {scene_id}"}), 404
    return jsonify(scene.to_dict(include_mesh=True))


@app.route("/api/scene/<scene_id>/summary")
def get_scene_summary(scene_id: str):
    """Get scene summary (no mesh data)."""
    scene = mm.get_scene(scene_id)
    if not scene:
        return jsonify({"error": f"Scene not found: {scene_id}"}), 404
    return jsonify(scene.summary())


@app.route("/api/scene/<scene_id>", methods=["DELETE"])
def delete_scene(scene_id: str):
    """Delete a scene."""
    if mm.delete_scene(scene_id):
        return jsonify({"success": True})
    return jsonify({"error": "Scene not found"}), 404


# ── Object CRUD ─────────────────────────────────────────────

@app.route("/api/scene/<scene_id>/objects")
def list_objects(scene_id: str):
    """List all objects in a scene (without mesh data)."""
    scene = mm.get_scene(scene_id)
    if not scene:
        return jsonify({"error": "Scene not found"}), 404
    objects = [o.to_dict(include_mesh=False) for o in scene.objects.values()]
    return jsonify({"objects": objects, "feature_order": scene.feature_order})


@app.route("/api/scene/<scene_id>/object/<obj_id>")
def get_object(scene_id: str, obj_id: str):
    """Get a single object with full mesh data."""
    scene = mm.get_scene(scene_id)
    if not scene:
        return jsonify({"error": "Scene not found"}), 404
    obj = scene.get_object(obj_id)
    if not obj:
        return jsonify({"error": f"Object not found: {obj_id}"}), 404
    return jsonify(obj.to_dict(include_mesh=True))


@app.route("/api/scene/<scene_id>/primitive", methods=["POST"])
def create_primitive(scene_id: str):
    """Create a primitive object (box, sphere, cylinder, cone, torus)."""
    body = request.get_json(force=True)
    ptype = body.get("primitive_type", "box")
    name = body.get("name")
    params = body.get("params", {})
    transform = body.get("transform")
    material = body.get("material")

    try:
        obj = mm.create_primitive_object(
            scene_id=scene_id,
            primitive_type=ptype,
            name=name,
            params=params,
            transform=transform,
            material=material,
        )
        return jsonify(obj.to_dict(include_mesh=True))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/scene/<scene_id>/object/<obj_id>", methods=["PUT"])
def update_object(scene_id: str, obj_id: str):
    """Update object properties (transform, material, params, name)."""
    body = request.get_json(force=True)
    obj = mm.update_object(scene_id, obj_id, body)
    if not obj:
        return jsonify({"error": "Object not found"}), 404
    return jsonify(obj.to_dict(include_mesh=True))


@app.route("/api/scene/<scene_id>/object/<obj_id>", methods=["DELETE"])
def delete_object(scene_id: str, obj_id: str):
    """Delete an object from the scene."""
    if mm.delete_object(scene_id, obj_id):
        return jsonify({"success": True})
    return jsonify({"error": "Object not found"}), 404


@app.route("/api/scene/<scene_id>/object/<obj_id>/duplicate", methods=["POST"])
def duplicate_object(scene_id: str, obj_id: str):
    """Duplicate an object."""
    obj = mm.duplicate_object(scene_id, obj_id)
    if not obj:
        return jsonify({"error": "Object not found"}), 404
    return jsonify(obj.to_dict(include_mesh=True))


# ── File import ─────────────────────────────────────────────

@app.route("/api/scene/<scene_id>/import", methods=["POST"])
def import_file(scene_id: str):
    """Import a 3D model file (STL, OBJ, GLTF, PLY, 3MF)."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    f = request.files["file"]
    filename = secure_filename(f.filename or "model.stl")
    file_data = f.read()

    # Save to upload dir
    save_path = _UPLOAD_DIR / f"{uuid.uuid4().hex[:8]}_{filename}"
    save_path.write_bytes(file_data)

    obj = mm.import_file(
        scene_id=scene_id,
        file_path=str(save_path),
        file_data=file_data,
        filename=filename,
    )
    if not obj:
        return jsonify({"error": f"Failed to import {filename}"}), 400

    return jsonify(obj.to_dict(include_mesh=True))


# ── File export ─────────────────────────────────────────────

@app.route("/api/scene/<scene_id>/export")
def export_scene(scene_id: str):
    """Export entire scene. Query param: ?format=stl|obj|json"""
    fmt = request.args.get("format", "stl")
    data = mm.export_scene(scene_id, fmt)
    if not data:
        return jsonify({"error": "Nothing to export"}), 400

    mime_map = {"stl": "model/stl", "obj": "text/plain", "json": "application/json"}
    ext_map = {"stl": "stl", "obj": "obj", "json": "json"}

    return Response(
        data,
        mimetype=mime_map.get(fmt, "application/octet-stream"),
        headers={
            "Content-Disposition": f"attachment; filename=r3ditor_export.{ext_map.get(fmt, 'bin')}"
        },
    )


@app.route("/api/scene/<scene_id>/object/<obj_id>/export")
def export_object(scene_id: str, obj_id: str):
    """Export a single object. Query param: ?format=stl|obj"""
    fmt = request.args.get("format", "stl")
    data = mm.export_object(scene_id, obj_id, fmt)
    if not data:
        return jsonify({"error": "Nothing to export"}), 400

    scene = mm.get_scene(scene_id)
    obj = scene.get_object(obj_id) if scene else None
    name = obj.name.replace(" ", "_") if obj else "object"

    mime_map = {"stl": "model/stl", "obj": "text/plain"}
    return Response(
        data,
        mimetype=mime_map.get(fmt, "application/octet-stream"),
        headers={"Content-Disposition": f"attachment; filename={name}.{fmt}"},
    )


# ── Measurement ─────────────────────────────────────────────

@app.route("/api/scene/<scene_id>/measure/<obj_id>")
def measure_object(scene_id: str, obj_id: str):
    """Get measurements for an object (volume, area, bbox)."""
    result = mm.measure_object(scene_id, obj_id)
    if not result:
        return jsonify({"error": "Object not found"}), 404
    return jsonify(result.to_dict())


@app.route("/api/scene/<scene_id>/measure-distance", methods=["POST"])
def measure_distance(scene_id: str):
    """Measure distance between two objects."""
    body = request.get_json(force=True)
    obj1 = body.get("object_id_1")
    obj2 = body.get("object_id_2")
    if not obj1 or not obj2:
        return jsonify({"error": "Two object IDs required"}), 400
    dist = mm.measure_distance(scene_id, obj1, obj2)
    if dist is None:
        return jsonify({"error": "Objects not found"}), 404
    return jsonify({"distance": dist})


# ── Mesh stats ──────────────────────────────────────────────

@app.route("/api/scene/<scene_id>/object/<obj_id>/stats")
def object_stats(scene_id: str, obj_id: str):
    """Get mesh statistics for an object."""
    scene = mm.get_scene(scene_id)
    if not scene:
        return jsonify({"error": "Scene not found"}), 404
    obj = scene.get_object(obj_id)
    if not obj:
        return jsonify({"error": "Object not found"}), 404
    stats = compute_mesh_stats(obj.vertices or [], obj.indices or [])
    return jsonify(stats)


# ── Sketch / Constraint solver ──────────────────────────────

@app.route("/api/scene/<scene_id>/sketch", methods=["POST"])
def create_sketch(scene_id: str):
    """Create a new sketch on a plane."""
    body = request.get_json(force=True)
    scene = mm.get_or_create_scene(scene_id)

    sketch = ms.Sketch(
        name=body.get("name", f"Sketch {len(scene.sketches) + 1}"),
        plane=body.get("plane", "XY"),
    )

    if body.get("plane_origin"):
        sketch.plane_origin = ms.Vec3.from_dict(body["plane_origin"])
    if body.get("plane_normal"):
        sketch.plane_normal = ms.Vec3.from_dict(body["plane_normal"])

    scene.add_sketch(sketch)
    return jsonify(sketch.to_dict())


@app.route("/api/scene/<scene_id>/sketch/<sketch_id>")
def get_sketch(scene_id: str, sketch_id: str):
    """Get sketch details."""
    scene = mm.get_scene(scene_id)
    if not scene:
        return jsonify({"error": "Scene not found"}), 404
    sk = scene.sketches.get(sketch_id)
    if not sk:
        return jsonify({"error": "Sketch not found"}), 404
    return jsonify(sk.to_dict())


@app.route("/api/scene/<scene_id>/sketch/<sketch_id>/entity", methods=["POST"])
def add_sketch_entity(scene_id: str, sketch_id: str):
    """Add an entity (line, circle, arc, point) to a sketch."""
    body = request.get_json(force=True)
    scene = mm.get_scene(scene_id)
    if not scene:
        return jsonify({"error": "Scene not found"}), 404
    sk = scene.sketches.get(sketch_id)
    if not sk:
        return jsonify({"error": "Sketch not found"}), 404

    ent = ms.SketchEntity(
        entity_type=ms.SketchEntityType(body.get("entity_type", "line")),
        px=body.get("px", 0), py=body.get("py", 0),
        x1=body.get("x1", 0), y1=body.get("y1", 0),
        x2=body.get("x2", 0), y2=body.get("y2", 0),
        cx=body.get("cx", 0), cy=body.get("cy", 0),
        radius=body.get("radius", 5),
        start_angle=body.get("start_angle", 0),
        end_angle=body.get("end_angle", 360),
    )
    sk.entities.append(ent)
    return jsonify(ent.to_dict())


@app.route("/api/scene/<scene_id>/sketch/<sketch_id>/constraint", methods=["POST"])
def add_sketch_constraint(scene_id: str, sketch_id: str):
    """Add a constraint to a sketch."""
    body = request.get_json(force=True)
    scene = mm.get_scene(scene_id)
    if not scene:
        return jsonify({"error": "Scene not found"}), 404
    sk = scene.sketches.get(sketch_id)
    if not sk:
        return jsonify({"error": "Sketch not found"}), 404

    con = ms.SketchConstraint(
        constraint_type=ms.ConstraintType(body.get("constraint_type", "distance")),
        entity_ids=body.get("entity_ids", []),
        value=body.get("value"),
    )
    sk.constraints.append(con)
    return jsonify(con.to_dict())


@app.route("/api/scene/<scene_id>/sketch/<sketch_id>/solve", methods=["POST"])
def solve_sketch(scene_id: str, sketch_id: str):
    """Solve sketch constraints using SolveSpace."""
    scene = mm.get_scene(scene_id)
    if not scene:
        return jsonify({"error": "Scene not found"}), 404
    sk = scene.sketches.get(sketch_id)
    if not sk:
        return jsonify({"error": "Sketch not found"}), 404

    result = solver.solve_sketch(sk)

    # Update sketch entities with solved positions
    if result.success:
        sk.solved = True
        sk.dof = result.dof
        for i, ed in enumerate(result.entities):
            if i < len(sk.entities):
                ent = sk.entities[i]
                ent.px = ed.get("px", ent.px)
                ent.py = ed.get("py", ent.py)
                ent.x1 = ed.get("x1", ent.x1)
                ent.y1 = ed.get("y1", ent.y1)
                ent.x2 = ed.get("x2", ent.x2)
                ent.y2 = ed.get("y2", ent.y2)
                ent.cx = ed.get("cx", ent.cx)
                ent.cy = ed.get("cy", ent.cy)

    return jsonify({
        "success": result.success,
        "dof": result.dof,
        "message": result.message,
        "entities": result.entities,
        "sketch": sk.to_dict(),
    })


@app.route("/api/scene/<scene_id>/sketch/<sketch_id>/extrude", methods=["POST"])
def extrude_sketch(scene_id: str, sketch_id: str):
    """Extrude a sketch profile into a 3D object."""
    body = request.get_json(force=True)
    scene = mm.get_scene(scene_id)
    if not scene:
        return jsonify({"error": "Scene not found"}), 404
    sk = scene.sketches.get(sketch_id)
    if not sk:
        return jsonify({"error": "Sketch not found"}), 404

    height = body.get("height", 10.0)
    direction = body.get("direction", [0, 0, 1])

    # Extract profile points from sketch lines (connect them)
    profile = _extract_sketch_profile(sk)
    if len(profile) < 3:
        return jsonify({"error": "Sketch profile needs at least 3 points"}), 400

    mesh = solver.extrude_sketch_profile(profile, height, tuple(direction))

    obj = ms.SceneObject(
        name=f"Extrude ({sk.name})",
        feature_type=ms.FeatureType.EXTRUDE,
        vertices=mesh["vertices"],
        normals=mesh["normals"],
        indices=mesh["indices"],
    )
    scene.add_object(obj)
    return jsonify(obj.to_dict(include_mesh=True))


def _extract_sketch_profile(sk: ms.Sketch) -> list[tuple[float, float]]:
    """Extract an ordered list of 2D points from sketch line entities."""
    points = []
    for ent in sk.entities:
        if ent.entity_type == ms.SketchEntityType.LINE:
            p1 = (ent.x1, ent.y1)
            p2 = (ent.x2, ent.y2)
            if not points or (abs(points[-1][0] - p1[0]) < 0.01
                              and abs(points[-1][1] - p1[1]) < 0.01):
                if not points:
                    points.append(p1)
                points.append(p2)
            else:
                points.append(p1)
                points.append(p2)
        elif ent.entity_type == ms.SketchEntityType.POINT:
            points.append((ent.px, ent.py))
        elif ent.entity_type == ms.SketchEntityType.RECT:
            x1, y1, x2, y2 = ent.x1, ent.y1, ent.x2, ent.y2
            points.extend([(x1, y1), (x2, y1), (x2, y2), (x1, y2)])

    # Deduplicate consecutive points
    if points:
        deduped = [points[0]]
        for p in points[1:]:
            if abs(p[0] - deduped[-1][0]) > 0.001 or abs(p[1] - deduped[-1][1]) > 0.001:
                deduped.append(p)
        points = deduped

    return points


# ── System info ─────────────────────────────────────────────

@app.route("/api/info")
def system_info():
    """System information and capabilities."""
    import sys
    caps = {
        "solvespace": solver._HAS_SOLVESPACE,
        "trimesh": mm._HAS_TRIMESH,
        "import_formats": ["stl", "obj"],
        "export_formats": ["stl", "obj", "json"],
    }
    if mm._HAS_TRIMESH:
        caps["import_formats"].extend(["glb", "gltf", "ply", "3mf"])

    return jsonify({
        "name": "r3ditor",
        "version": (_HERE / "VERSION").read_text().strip(),
        "python": sys.version,
        "capabilities": caps,
    })


# ── Error handlers ──────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large (max 200MB)"}), 413


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500
