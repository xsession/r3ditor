"""
r3ditor — Data model schema for 3D objects, scenes, sketches, and constraints.
Pure dataclasses, zero I/O coupling.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ── Enums ───────────────────────────────────────────────────

class PrimitiveType(str, Enum):
    BOX = "box"
    SPHERE = "sphere"
    CYLINDER = "cylinder"
    CONE = "cone"
    TORUS = "torus"
    PLANE = "plane"


class FeatureType(str, Enum):
    PRIMITIVE = "primitive"
    IMPORT = "import"
    EXTRUDE = "extrude"
    REVOLVE = "revolve"
    FILLET = "fillet"
    CHAMFER = "chamfer"
    BOOLEAN = "boolean"
    SKETCH = "sketch"
    TRANSFORM = "transform"
    GROUP = "group"


class BooleanOp(str, Enum):
    UNION = "union"
    SUBTRACT = "subtract"
    INTERSECT = "intersect"


class ConstraintType(str, Enum):
    COINCIDENT = "coincident"
    DISTANCE = "distance"
    ANGLE = "angle"
    HORIZONTAL = "horizontal"
    VERTICAL = "vertical"
    PARALLEL = "parallel"
    PERPENDICULAR = "perpendicular"
    TANGENT = "tangent"
    EQUAL = "equal"
    SYMMETRIC = "symmetric"
    MIDPOINT = "midpoint"
    FIX = "fix"


class SketchEntityType(str, Enum):
    POINT = "point"
    LINE = "line"
    ARC = "arc"
    CIRCLE = "circle"
    SPLINE = "spline"
    RECT = "rect"


# ── 3D Math ─────────────────────────────────────────────────

@dataclass
class Vec3:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "z": self.z}

    @classmethod
    def from_dict(cls, d: dict) -> Vec3:
        return cls(x=d.get("x", 0), y=d.get("y", 0), z=d.get("z", 0))

    def to_list(self) -> list:
        return [self.x, self.y, self.z]


@dataclass
class Quaternion:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    w: float = 1.0

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "z": self.z, "w": self.w}

    @classmethod
    def from_dict(cls, d: dict) -> Quaternion:
        return cls(x=d.get("x", 0), y=d.get("y", 0), z=d.get("z", 0), w=d.get("w", 1))


@dataclass
class Transform:
    position: Vec3 = field(default_factory=Vec3)
    rotation: Vec3 = field(default_factory=Vec3)  # Euler XYZ degrees
    scale: Vec3 = field(default_factory=lambda: Vec3(1, 1, 1))

    def to_dict(self) -> dict:
        return {
            "position": self.position.to_dict(),
            "rotation": self.rotation.to_dict(),
            "scale": self.scale.to_dict(),
        }

    @classmethod
    def from_dict(cls, d: dict) -> Transform:
        return cls(
            position=Vec3.from_dict(d.get("position", {})),
            rotation=Vec3.from_dict(d.get("rotation", {})),
            scale=Vec3.from_dict(d.get("scale", {"x": 1, "y": 1, "z": 1})),
        )


# ── Material ────────────────────────────────────────────────

@dataclass
class Material:
    color: str = "#6c8ebf"
    opacity: float = 1.0
    metalness: float = 0.3
    roughness: float = 0.6
    wireframe: bool = False

    def to_dict(self) -> dict:
        return {
            "color": self.color,
            "opacity": self.opacity,
            "metalness": self.metalness,
            "roughness": self.roughness,
            "wireframe": self.wireframe,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Material:
        return cls(
            color=d.get("color", "#6c8ebf"),
            opacity=d.get("opacity", 1.0),
            metalness=d.get("metalness", 0.3),
            roughness=d.get("roughness", 0.6),
            wireframe=d.get("wireframe", False),
        )


# ── Primitive Parameters ────────────────────────────────────

@dataclass
class PrimitiveParams:
    """Parameters for primitive shapes."""
    primitive_type: PrimitiveType = PrimitiveType.BOX
    # Box
    width: float = 10.0
    height: float = 10.0
    depth: float = 10.0
    # Sphere / Cylinder / Cone
    radius: float = 5.0
    radius_top: float = 5.0
    radius_bottom: float = 5.0
    # Cylinder / Cone
    cyl_height: float = 10.0
    radial_segments: int = 32
    # Torus
    tube_radius: float = 2.0
    tubular_segments: int = 48

    def to_dict(self) -> dict:
        return {
            "primitive_type": self.primitive_type.value,
            "width": self.width,
            "height": self.height,
            "depth": self.depth,
            "radius": self.radius,
            "radius_top": self.radius_top,
            "radius_bottom": self.radius_bottom,
            "cyl_height": self.cyl_height,
            "radial_segments": self.radial_segments,
            "tube_radius": self.tube_radius,
            "tubular_segments": self.tubular_segments,
        }

    @classmethod
    def from_dict(cls, d: dict) -> PrimitiveParams:
        return cls(
            primitive_type=PrimitiveType(d.get("primitive_type", "box")),
            width=d.get("width", 10),
            height=d.get("height", 10),
            depth=d.get("depth", 10),
            radius=d.get("radius", 5),
            radius_top=d.get("radius_top", 5),
            radius_bottom=d.get("radius_bottom", 5),
            cyl_height=d.get("cyl_height", 10),
            radial_segments=d.get("radial_segments", 32),
            tube_radius=d.get("tube_radius", 2),
            tubular_segments=d.get("tubular_segments", 48),
        )


# ── Scene Object ────────────────────────────────────────────

@dataclass
class SceneObject:
    """A single object in the 3D scene."""
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str = "Object"
    feature_type: FeatureType = FeatureType.PRIMITIVE
    visible: bool = True
    locked: bool = False
    transform: Transform = field(default_factory=Transform)
    material: Material = field(default_factory=Material)
    params: PrimitiveParams | None = None
    parent_id: str | None = None
    children_ids: list[str] = field(default_factory=list)
    # Mesh data (populated by backend)
    vertices: list[float] | None = None       # flat [x,y,z, x,y,z, ...]
    normals: list[float] | None = None        # flat [nx,ny,nz, ...]
    indices: list[int] | None = None          # triangle indices
    edges: list[float] | None = None          # edge lines [x,y,z, x,y,z, ...]
    # Import metadata
    source_file: str | None = None
    file_format: str | None = None

    def to_dict(self, include_mesh: bool = True) -> dict:
        d = {
            "id": self.id,
            "name": self.name,
            "feature_type": self.feature_type.value,
            "visible": self.visible,
            "locked": self.locked,
            "transform": self.transform.to_dict(),
            "material": self.material.to_dict(),
            "params": self.params.to_dict() if self.params else None,
            "parent_id": self.parent_id,
            "children_ids": self.children_ids,
            "source_file": self.source_file,
            "file_format": self.file_format,
        }
        if include_mesh:
            d["vertices"] = self.vertices
            d["normals"] = self.normals
            d["indices"] = self.indices
            d["edges"] = self.edges
        return d

    @classmethod
    def from_dict(cls, d: dict) -> SceneObject:
        return cls(
            id=d.get("id", uuid.uuid4().hex[:12]),
            name=d.get("name", "Object"),
            feature_type=FeatureType(d.get("feature_type", "primitive")),
            visible=d.get("visible", True),
            locked=d.get("locked", False),
            transform=Transform.from_dict(d.get("transform", {})),
            material=Material.from_dict(d.get("material", {})),
            params=PrimitiveParams.from_dict(d["params"]) if d.get("params") else None,
            parent_id=d.get("parent_id"),
            children_ids=d.get("children_ids", []),
            source_file=d.get("source_file"),
            file_format=d.get("file_format"),
        )


# ── Sketch entities & constraints ───────────────────────────

@dataclass
class SketchEntity:
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    entity_type: SketchEntityType = SketchEntityType.LINE
    # Point
    px: float = 0.0
    py: float = 0.0
    # Line / Arc start-end
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0
    # Arc / Circle center + radius
    cx: float = 0.0
    cy: float = 0.0
    radius: float = 5.0
    start_angle: float = 0.0
    end_angle: float = 360.0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "entity_type": self.entity_type.value,
            "px": self.px, "py": self.py,
            "x1": self.x1, "y1": self.y1,
            "x2": self.x2, "y2": self.y2,
            "cx": self.cx, "cy": self.cy,
            "radius": self.radius,
            "start_angle": self.start_angle,
            "end_angle": self.end_angle,
        }


@dataclass
class SketchConstraint:
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    constraint_type: ConstraintType = ConstraintType.DISTANCE
    entity_ids: list[str] = field(default_factory=list)  # 1 or 2 entity refs
    value: float | None = None  # for distance, angle, etc.

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "constraint_type": self.constraint_type.value,
            "entity_ids": self.entity_ids,
            "value": self.value,
        }


@dataclass
class Sketch:
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str = "Sketch"
    plane: str = "XY"  # XY, XZ, YZ or custom
    plane_origin: Vec3 = field(default_factory=Vec3)
    plane_normal: Vec3 = field(default_factory=lambda: Vec3(0, 0, 1))
    entities: list[SketchEntity] = field(default_factory=list)
    constraints: list[SketchConstraint] = field(default_factory=list)
    solved: bool = False
    dof: int = 0  # degrees of freedom

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "plane": self.plane,
            "plane_origin": self.plane_origin.to_dict(),
            "plane_normal": self.plane_normal.to_dict(),
            "entities": [e.to_dict() for e in self.entities],
            "constraints": [c.to_dict() for c in self.constraints],
            "solved": self.solved,
            "dof": self.dof,
        }


# ── Scene (top-level container) ────────────────────────────

@dataclass
class Scene:
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str = "Untitled"
    objects: dict[str, SceneObject] = field(default_factory=dict)
    sketches: dict[str, Sketch] = field(default_factory=dict)
    feature_order: list[str] = field(default_factory=list)  # ordered IDs
    units: str = "mm"
    grid_size: float = 10.0

    def add_object(self, obj: SceneObject) -> str:
        self.objects[obj.id] = obj
        self.feature_order.append(obj.id)
        return obj.id

    def remove_object(self, obj_id: str) -> bool:
        if obj_id in self.objects:
            del self.objects[obj_id]
            self.feature_order = [i for i in self.feature_order if i != obj_id]
            return True
        return False

    def get_object(self, obj_id: str) -> SceneObject | None:
        return self.objects.get(obj_id)

    def add_sketch(self, sketch: Sketch) -> str:
        self.sketches[sketch.id] = sketch
        return sketch.id

    def to_dict(self, include_mesh: bool = True) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "objects": {k: v.to_dict(include_mesh) for k, v in self.objects.items()},
            "sketches": {k: v.to_dict() for k, v in self.sketches.items()},
            "feature_order": self.feature_order,
            "units": self.units,
            "grid_size": self.grid_size,
        }

    def summary(self) -> dict:
        """Lightweight scene info without mesh data."""
        return {
            "id": self.id,
            "name": self.name,
            "object_count": len(self.objects),
            "sketch_count": len(self.sketches),
            "feature_order": self.feature_order,
            "objects": {k: v.to_dict(include_mesh=False) for k, v in self.objects.items()},
            "sketches": {k: v.to_dict() for k, v in self.sketches.items()},
            "units": self.units,
            "grid_size": self.grid_size,
        }


# ── Measurement result ──────────────────────────────────────

@dataclass
class MeasureResult:
    distance: float | None = None
    angle: float | None = None
    area: float | None = None
    volume: float | None = None
    bbox_min: Vec3 | None = None
    bbox_max: Vec3 | None = None
    center: Vec3 | None = None

    def to_dict(self) -> dict:
        d: dict[str, Any] = {}
        if self.distance is not None:
            d["distance"] = self.distance
        if self.angle is not None:
            d["angle"] = self.angle
        if self.area is not None:
            d["area"] = self.area
        if self.volume is not None:
            d["volume"] = self.volume
        if self.bbox_min is not None:
            d["bbox_min"] = self.bbox_min.to_dict()
        if self.bbox_max is not None:
            d["bbox_max"] = self.bbox_max.to_dict()
        if self.center is not None:
            d["center"] = self.center.to_dict()
        return d
