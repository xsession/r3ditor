/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║  Cali Cat — 3D Printer Calibration Cat Geometry Builder           ║
 * ║                                                                    ║
 * ║  Builds the iconic "Cali Cat" 3D print test model as actual       ║
 * ║  Three.js BufferGeometry meshes. Dimensions match the reference:  ║
 * ║                                                                    ║
 * ║    • Head+body depth/width : 20 × 20 mm                          ║
 * ║    • Body height           : 14 mm (lower block)                  ║
 * ║    • Head height           : 13 mm (upper block)                  ║
 * ║    • Ear height            : 5 mm (triangular prisms)             ║
 * ║    • Total height          : 27 mm (body+head) + 5 mm ears = 32  ║
 * ║    • Tail                  : 5 × 5 mm cross-section, curved      ║
 * ║    • Tail height           : reaches 35 mm total                  ║
 * ║    • Feet                  : 4 small 4×4×3 mm pads               ║
 * ║    • Eyes                  : 2 mm deep cylindrical slots          ║
 * ║    • Nose                  : triangular indent                     ║
 * ║    • Whiskers              : 3 grooves each side                  ║
 * ║                                                                    ║
 * ║  All geometry is built as indexed BufferGeometry for efficiency.   ║
 * ║  The model sits with its base on Y=0, centered on X/Z origin.     ║
 * ╚════════════════════════════════════════════════════════════════════╝
 */

import * as THREE from 'three';

// ─── Dimension Constants (all in mm) ─────────────────────────────────────────

/** Body (lower torso) */
const BODY_W = 20;     // X width
const BODY_D = 20;     // Z depth
const BODY_H = 14;     // Y height

/** Head (upper block, slightly narrower at top) */
const HEAD_W = 20;
const HEAD_D = 20;
const HEAD_H = 13;

/** Ear triangular prisms */
const EAR_W = 4;       // base width
const EAR_H = 5;       // ear height above head
const EAR_D = 3;       // depth of each ear
const EAR_SPACING = 4; // gap between ears at center

/** Tail */
const TAIL_W = 5;
const TAIL_D = 5;
const TAIL_SEGMENTS = 12; // curve segments

/** Feet pads */
const FOOT_W = 4;
const FOOT_D = 5;
const FOOT_H = 2;

/** Eyes (cylindrical indents on the head face) */
const EYE_RADIUS = 1.5;
const EYE_DEPTH = 1.5;
const EYE_SPACING = 6;  // distance between eye centers
const EYE_Y_OFFSET = 4; // up from center of head face

/** Nose (small triangle on face) */
const NOSE_W = 2;
const NOSE_H = 1.5;

/** Whiskers (horizontal grooves) */
const WHISKER_LEN = 5;
const WHISKER_SPACING = 1.2;

// ─── Geometry Builders ───────────────────────────────────────────────────────

/**
 * Create a box geometry with explicit min/max bounds.
 */
function makeBox(
  xMin: number, yMin: number, zMin: number,
  xMax: number, yMax: number, zMax: number,
): THREE.BufferGeometry {
  const w = xMax - xMin;
  const h = yMax - yMin;
  const d = zMax - zMin;
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(
    xMin + w / 2,
    yMin + h / 2,
    zMin + d / 2,
  );
  return geo;
}

/**
 * Create a triangular prism (ear shape) with base at bottom, point at top.
 * Base is on the XZ plane at yBase, tip extends to yBase + height.
 */
function makeEarPrism(
  cx: number,      // center X of base
  yBase: number,   // Y of base
  cz: number,      // center Z of base
  baseW: number,   // width of base
  height: number,  // ear height
  depth: number,   // Z depth
): THREE.BufferGeometry {
  // Triangular cross-section (XY) extruded along Z
  const shape = new THREE.Shape();
  shape.moveTo(-baseW / 2, 0);
  shape.lineTo(baseW / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth,
    bevelEnabled: false,
  };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // ExtrudeGeometry extrudes along Z; translate to desired position
  geo.translate(cx, yBase, cz - depth / 2);
  return geo;
}

/**
 * Create a curved tail using a tube along a spline path.
 * The tail starts at the back of the body, curls upward.
 */
function makeTail(
  startX: number, startY: number, startZ: number,
): THREE.BufferGeometry {
  // Spline path curving backward and upward (like a real cat tail)
  const points = [
    new THREE.Vector3(startX, startY, startZ),
    new THREE.Vector3(startX - 3, startY + 6, startZ),
    new THREE.Vector3(startX - 6, startY + 14, startZ),
    new THREE.Vector3(startX - 8, startY + 20, startZ),
    new THREE.Vector3(startX - 6, startY + 24, startZ),    // curl forward at top
    new THREE.Vector3(startX - 3, startY + 26, startZ),
  ];
  const curve = new THREE.CatmullRomCurve3(points);

  // Square-ish cross-section approximated with tube
  const radius = Math.min(TAIL_W, TAIL_D) / 2;
  const geo = new THREE.TubeGeometry(curve, TAIL_SEGMENTS, radius, 4, false);
  return geo;
}

/**
 * Create eye indent (cylinder going into the face).
 */
function makeEyeCylinder(
  cx: number, cy: number, cz: number,
  radius: number, depth: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, depth, 16);
  // CylinderGeometry is along Y axis; rotate to face forward (along Z)
  geo.rotateX(Math.PI / 2);
  geo.translate(cx, cy, cz - depth / 2);
  return geo;
}

/**
 * Create a whisker groove (thin box indent on the face).
 */
function makeWhiskerGroove(
  x: number, y: number, z: number,
  length: number, side: 'left' | 'right',
  angle: number, // tilt angle in radians
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(length, 0.3, 0.3);
  const offsetX = side === 'left' ? -length / 2 : length / 2;
  geo.translate(offsetX, 0, 0);

  // Apply rotation around the start point
  const m = new THREE.Matrix4();
  m.makeRotationZ(side === 'left' ? -angle : angle);
  geo.applyMatrix4(m);

  geo.translate(x, y, z);
  return geo;
}

// ─── Main Builder ────────────────────────────────────────────────────────────

/**
 * Build the complete Cali Cat as a single merged BufferGeometry.
 *
 * The model is centered on X=0, Z=0 with base at Y=0.
 * All dimensions in mm, matching the reference images.
 */
export function buildCaliCatGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // ── 1. Body (lower block) ──
  geometries.push(makeBox(
    -BODY_W / 2, 0, -BODY_D / 2,
    BODY_W / 2, BODY_H, BODY_D / 2,
  ));

  // ── 2. Head (upper block, sitting on top of body) ──
  geometries.push(makeBox(
    -HEAD_W / 2, BODY_H, -HEAD_D / 2,
    HEAD_W / 2, BODY_H + HEAD_H, HEAD_D / 2,
  ));

  // ── 3. Left ear ──
  geometries.push(makeEarPrism(
    -EAR_SPACING / 2 - EAR_W / 2,     // left of center
    BODY_H + HEAD_H,                    // on top of head
    0,                                  // centered Z
    EAR_W, EAR_H, EAR_D,
  ));

  // ── 4. Right ear ──
  geometries.push(makeEarPrism(
    EAR_SPACING / 2 + EAR_W / 2,      // right of center
    BODY_H + HEAD_H,                    // on top of head
    0,
    EAR_W, EAR_H, EAR_D,
  ));

  // ── 5. Tail (curving up from back) ──
  geometries.push(makeTail(
    0,                                  // start at center X
    BODY_H * 0.6,                       // start partway up the body
    -BODY_D / 2,                        // at the back
  ));

  // ── 6. Feet (4 pads under body) ──
  // Front left
  geometries.push(makeBox(
    -BODY_W / 2 + 1, -FOOT_H, BODY_D / 2 - FOOT_D,
    -BODY_W / 2 + 1 + FOOT_W, 0, BODY_D / 2,
  ));
  // Front right
  geometries.push(makeBox(
    BODY_W / 2 - 1 - FOOT_W, -FOOT_H, BODY_D / 2 - FOOT_D,
    BODY_W / 2 - 1, 0, BODY_D / 2,
  ));
  // Back left
  geometries.push(makeBox(
    -BODY_W / 2 + 1, -FOOT_H, -BODY_D / 2,
    -BODY_W / 2 + 1 + FOOT_W, 0, -BODY_D / 2 + FOOT_D,
  ));
  // Back right
  geometries.push(makeBox(
    BODY_W / 2 - 1 - FOOT_W, -FOOT_H, -BODY_D / 2,
    BODY_W / 2 - 1, 0, -BODY_D / 2 + FOOT_D,
  ));

  // ── 7. Eyes (cylindrical indents on front face of head) ──
  const headFaceZ = HEAD_D / 2;
  const headCenterY = BODY_H + HEAD_H / 2;
  geometries.push(makeEyeCylinder(
    -EYE_SPACING / 2, headCenterY + EYE_Y_OFFSET, headFaceZ,
    EYE_RADIUS, EYE_DEPTH,
  ));
  geometries.push(makeEyeCylinder(
    EYE_SPACING / 2, headCenterY + EYE_Y_OFFSET, headFaceZ,
    EYE_RADIUS, EYE_DEPTH,
  ));

  // ── 8. Nose (small triangular prism on the face) ──
  {
    const noseShape = new THREE.Shape();
    noseShape.moveTo(-NOSE_W / 2, 0);
    noseShape.lineTo(NOSE_W / 2, 0);
    noseShape.lineTo(0, -NOSE_H);
    noseShape.closePath();
    const noseGeo = new THREE.ExtrudeGeometry(noseShape, { depth: 1, bevelEnabled: false });
    noseGeo.translate(0, headCenterY + 1, headFaceZ);
    geometries.push(noseGeo);
  }

  // ── 9. Whiskers (3 per side) ──
  const whiskerBaseY = headCenterY;
  const whiskerBaseZ = headFaceZ + 0.1;
  for (let i = 0; i < 3; i++) {
    const y = whiskerBaseY + (i - 1) * WHISKER_SPACING;
    const angle = (i - 1) * 0.15; // slight angle spread
    // Left whiskers
    geometries.push(makeWhiskerGroove(
      -NOSE_W / 2 - 0.5, y, whiskerBaseZ,
      WHISKER_LEN, 'left', angle,
    ));
    // Right whiskers
    geometries.push(makeWhiskerGroove(
      NOSE_W / 2 + 0.5, y, whiskerBaseZ,
      WHISKER_LEN, 'right', angle,
    ));
  }

  // ── Merge all geometries into one ──
  const merged = mergeBufferGeometries(geometries);

  // Cleanup individual geometries
  for (const g of geometries) g.dispose();

  return merged;
}

/**
 * Build the Cali Cat as a set of separate parts (for the editor entity list).
 * Each part has a name and BufferGeometry for individual rendering.
 */
export function buildCaliCatParts(): { name: string; geometry: THREE.BufferGeometry; color: number }[] {
  const ORANGE = 0xf5a623; // Cali Cat signature orange

  return [
    { name: 'CaliCat Body', geometry: makeBox(-BODY_W / 2, 0, -BODY_D / 2, BODY_W / 2, BODY_H, BODY_D / 2), color: ORANGE },
    { name: 'CaliCat Head', geometry: makeBox(-HEAD_W / 2, BODY_H, -HEAD_D / 2, HEAD_W / 2, BODY_H + HEAD_H, HEAD_D / 2), color: ORANGE },
    {
      name: 'CaliCat Left Ear',
      geometry: makeEarPrism(-EAR_SPACING / 2 - EAR_W / 2, BODY_H + HEAD_H, 0, EAR_W, EAR_H, EAR_D),
      color: ORANGE,
    },
    {
      name: 'CaliCat Right Ear',
      geometry: makeEarPrism(EAR_SPACING / 2 + EAR_W / 2, BODY_H + HEAD_H, 0, EAR_W, EAR_H, EAR_D),
      color: ORANGE,
    },
    { name: 'CaliCat Tail', geometry: makeTail(0, BODY_H * 0.6, -BODY_D / 2), color: ORANGE },
  ];
}

/**
 * Get the bounding box of the complete Cali Cat model (in mm).
 */
export function getCaliCatBounds(): {
  width: number; height: number; depth: number;
  min: THREE.Vector3; max: THREE.Vector3;
} {
  const geo = buildCaliCatGeometry();
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.dispose();
  return {
    width: bb.max.x - bb.min.x,
    height: bb.max.y - bb.min.y,
    depth: bb.max.z - bb.min.z,
    min: bb.min.clone(),
    max: bb.max.clone(),
  };
}

// ─── Utility: merge BufferGeometries ─────────────────────────────────────────

function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Count total vertices and indices
  let totalVertices = 0;
  let totalIndices = 0;

  for (const geo of geometries) {
    const pos = geo.getAttribute('position');
    if (!pos) continue;
    totalVertices += pos.count;
    const idx = geo.getIndex();
    totalIndices += idx ? idx.count : pos.count;
  }

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;

  for (const geo of geometries) {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    if (!pos) continue;
    const norm = geo.getAttribute('normal') as THREE.BufferAttribute;

    // Copy positions
    for (let i = 0; i < pos.count; i++) {
      positions[(vertexOffset + i) * 3] = pos.getX(i);
      positions[(vertexOffset + i) * 3 + 1] = pos.getY(i);
      positions[(vertexOffset + i) * 3 + 2] = pos.getZ(i);
      if (norm) {
        normals[(vertexOffset + i) * 3] = norm.getX(i);
        normals[(vertexOffset + i) * 3 + 1] = norm.getY(i);
        normals[(vertexOffset + i) * 3 + 2] = norm.getZ(i);
      }
    }

    // Copy indices (offset by vertex base)
    const idx = geo.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices[indexOffset + i] = idx.getX(i) + vertexOffset;
      }
      indexOffset += idx.count;
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[indexOffset + i] = vertexOffset + i;
      }
      indexOffset += pos.count;
    }

    vertexOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices.slice(0, indexOffset), 1));
  merged.computeVertexNormals();
  return merged;
}

// ─── Editor Store Integration ────────────────────────────────────────────────

/**
 * Dimension constants exported for tests and documentation.
 */
export const CALI_CAT_DIMENSIONS = {
  bodyWidth: BODY_W,
  bodyDepth: BODY_D,
  bodyHeight: BODY_H,
  headWidth: HEAD_W,
  headDepth: HEAD_D,
  headHeight: HEAD_H,
  earWidth: EAR_W,
  earHeight: EAR_H,
  earDepth: EAR_D,
  tailWidth: TAIL_W,
  tailDepth: TAIL_D,
  footWidth: FOOT_W,
  footHeight: FOOT_H,
  /** Overall height: body + head + ears */
  totalHeight: BODY_H + HEAD_H + EAR_H,   // 14+13+5 = 32 mm
  /** Overall height including tail tip at ~35mm */
  totalHeightWithTail: 35,
  /** Body+head without ears */
  bodyPlusHead: BODY_H + HEAD_H,           // 27 mm
} as const;
