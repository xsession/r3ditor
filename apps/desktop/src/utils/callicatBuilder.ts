/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  Callicat Builder — Runtime Callicat 3D Model Factory    ║
 * ║                                                           ║
 * ║  Programmatically builds the complete callicat (stylised ║
 * ║  3D cat) model by driving the editor store — creates     ║
 * ║  sketches, features, entities, and timeline entries.      ║
 * ║  This is the runtime equivalent of the test automata.     ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

import { useEditorStore } from '../store/editorStore';
import type {
  Entity,
  SketchPlaneInfo,
} from '../store/editorStore';
import {
  serializeProject,
  projectToJSON,
  type SketchSnapshot,
  type FeatureSnapshot,
} from '../store/modelSerializer';

// ─── Plane definitions ───────────────────────────────────────────────────────

const XY_PLANE: SketchPlaneInfo = {
  type: 'XY',
  origin: [0, 0, 0],
  normal: [0, 0, 1],
  uAxis: [1, 0, 0],
  vAxis: [0, 1, 0],
};

const XZ_PLANE: SketchPlaneInfo = {
  type: 'XZ',
  origin: [0, 0, 0],
  normal: [0, 1, 0],
  uAxis: [1, 0, 0],
  vAxis: [0, 0, 1],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function store() {
  return useEditorStore.getState();
}

let ptCounter = 0;
let segCounter = 0;

function mkPoint(x: number, y: number, id?: string) {
  ptCounter++;
  const pt = { id: id ?? `pt_${ptCounter}`, x, y, isConstruction: false };
  store().addSketchPoint(pt);
  return pt;
}

function mkSegment(
  type: 'line' | 'arc' | 'circle' | 'spline' | 'rectangle',
  pointIds: string[],
  id?: string,
) {
  segCounter++;
  const seg = {
    id: id ?? `seg_${segCounter}`,
    type,
    points: pointIds,
    isConstruction: false,
  };
  store().addSketchSegment(seg);
  return seg;
}

function beginSketch(plane: SketchPlaneInfo, planeName: 'XY' | 'XZ' | 'YZ') {
  store().beginPlaneSelection();
  store().selectSketchPlane(plane);
  useEditorStore.setState({ sketchPlane: planeName });
}

function finishSketch(sketchNum: number) {
  store().finishSketch();
  store().setTimeline([
    ...store().timeline,
    {
      id: `sketch_${sketchNum}`,
      name: `Sketch ${sketchNum}`,
      type: 'sketch',
      suppressed: false,
      hasError: false,
    },
  ]);
}

function addEntity(
  name: string,
  type: Entity['type'] = 'brep',
  counts: { faceCount?: number; edgeCount?: number; vertexCount?: number } = {},
  transform?: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] },
): Entity {
  const entity: Entity = {
    id: `ent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    visible: true,
    locked: false,
    suppressed: false,
    faceCount: counts.faceCount ?? 6,
    edgeCount: counts.edgeCount ?? 12,
    vertexCount: counts.vertexCount ?? 8,
    transform: {
      position: transform?.position ?? [0, 0, 0],
      rotation: transform?.rotation ?? [0, 0, 0],
      scale: transform?.scale ?? [1, 1, 1],
    },
    type,
  };
  store().addEntity(entity);
  return entity;
}

// ─── Build the callicat ──────────────────────────────────────────────────────

/**
 * Build a complete callicat 3D model from scratch.
 *
 * This drives the editor store through the same workflow a user would follow:
 * 1. Set up document name
 * 2. Create 5 sketches (body, head, left ear, right ear, tail)
 * 3. Extrude body, head, ears, sweep tail
 * 4. Boolean combine, fillet, eye holes, shell
 * 5. Add assembly mate
 *
 * Returns the project data (sketches + features) for saving.
 */
export function buildCallicat(): {
  sketches: SketchSnapshot[];
  features: FeatureSnapshot[];
} {
  ptCounter = 0;
  segCounter = 0;

  const sketches: SketchSnapshot[] = [];
  const features: FeatureSnapshot[] = [];

  // ═══ Setup ═══
  store().setDocumentName('Callicat v1.0');
  store().setCameraProjection('orthographic');

  // ═══ Sketch 1: Body (rounded rectangle on XY) ═══
  beginSketch(XY_PLANE, 'XY');
  store().setSketchTool('rectangle');
  const p0 = mkPoint(-30, -15, 'body_p0');
  const p1 = mkPoint(30, -15, 'body_p1');
  const p2 = mkPoint(30, 15, 'body_p2');
  const p3 = mkPoint(-30, 15, 'body_p3');
  mkSegment('line', [p0.id, p1.id], 'body_s0');
  mkSegment('line', [p1.id, p2.id], 'body_s1');
  mkSegment('line', [p2.id, p3.id], 'body_s2');
  mkSegment('line', [p3.id, p0.id], 'body_s3');
  store().addSketchConstraint({ id: 'c_h', type: 'horizontal', entityIds: ['body_s0'], satisfied: true });
  store().addSketchConstraint({ id: 'c_v', type: 'vertical', entityIds: ['body_s1'], satisfied: true });
  store().addSketchDimension({ id: 'd_w', type: 'distance', entityIds: [p0.id, p1.id], value: 60, driving: true });
  store().addSketchDimension({ id: 'd_h', type: 'distance', entityIds: [p1.id, p2.id], value: 30, driving: true });
  sketches.push({
    id: 'sketch_body', name: 'Sketch 1 — Body', plane: store().sketchPlane,
    planeInfo: store().sketchPlaneInfo ? { ...store().sketchPlaneInfo! } : null,
    points: [...store().sketchPoints], segments: [...store().sketchSegments],
    constraints: [...store().sketchConstraints], dimensions: [...store().sketchDimensions],
    dof: store().sketchDof,
  });
  finishSketch(1);

  // ═══ Sketch 2: Head (circle on XY) ═══
  beginSketch(XY_PLANE, 'XY');
  store().setSketchTool('circle');
  const hc = mkPoint(45, 0, 'head_center');
  const he = mkPoint(63, 0, 'head_edge');
  mkSegment('circle', [hc.id, he.id], 'head_circle');
  store().addSketchConstraint({ id: 'c_hh', type: 'horizontal', entityIds: [hc.id], satisfied: true });
  store().addSketchDimension({ id: 'd_r', type: 'radius', entityIds: [hc.id, he.id], value: 18, driving: true });
  sketches.push({
    id: 'sketch_head', name: 'Sketch 2 — Head', plane: store().sketchPlane,
    planeInfo: store().sketchPlaneInfo ? { ...store().sketchPlaneInfo! } : null,
    points: [...store().sketchPoints], segments: [...store().sketchSegments],
    constraints: [...store().sketchConstraints], dimensions: [...store().sketchDimensions],
    dof: store().sketchDof,
  });
  finishSketch(2);

  // ═══ Sketch 3: Left ear (triangle on XY) ═══
  beginSketch(XY_PLANE, 'XY');
  store().setSketchTool('line');
  const le0 = mkPoint(35, 14, 'le0');
  const leTip = mkPoint(38, 30, 'le_tip');
  const le1 = mkPoint(42, 14, 'le1');
  mkSegment('line', [le0.id, leTip.id], 'le_l0');
  mkSegment('line', [leTip.id, le1.id], 'le_l1');
  mkSegment('line', [le1.id, le0.id], 'le_l2');
  store().addSketchConstraint({ id: 'c_eq_l', type: 'equal', entityIds: ['le_l0', 'le_l1'], satisfied: true });
  store().addSketchDimension({ id: 'd_le', type: 'distance', entityIds: [le0.id, leTip.id], value: 16.5, driving: true });
  sketches.push({
    id: 'sketch_left_ear', name: 'Sketch 3 — Left Ear', plane: store().sketchPlane,
    planeInfo: store().sketchPlaneInfo ? { ...store().sketchPlaneInfo! } : null,
    points: [...store().sketchPoints], segments: [...store().sketchSegments],
    constraints: [...store().sketchConstraints], dimensions: [...store().sketchDimensions],
    dof: store().sketchDof,
  });
  finishSketch(3);

  // ═══ Sketch 4: Right ear (triangle on XY) ═══
  beginSketch(XY_PLANE, 'XY');
  store().setSketchTool('line');
  const re0 = mkPoint(48, 14, 're0');
  const reTip = mkPoint(52, 30, 're_tip');
  const re1 = mkPoint(55, 14, 're1');
  mkSegment('line', [re0.id, reTip.id], 're_l0');
  mkSegment('line', [reTip.id, re1.id], 're_l1');
  mkSegment('line', [re1.id, re0.id], 're_l2');
  store().addSketchConstraint({ id: 'c_eq_r', type: 'equal', entityIds: ['re_l0', 're_l1'], satisfied: true });
  store().addSketchConstraint({ id: 'c_sym', type: 'symmetric', entityIds: ['le_tip', 're_tip'], satisfied: true });
  sketches.push({
    id: 'sketch_right_ear', name: 'Sketch 4 — Right Ear', plane: store().sketchPlane,
    planeInfo: store().sketchPlaneInfo ? { ...store().sketchPlaneInfo! } : null,
    points: [...store().sketchPoints], segments: [...store().sketchSegments],
    constraints: [...store().sketchConstraints], dimensions: [...store().sketchDimensions],
    dof: store().sketchDof,
  });
  finishSketch(4);

  // ═══ Sketch 5: Tail (spline on XZ) ═══
  beginSketch(XZ_PLANE, 'XZ');
  store().setSketchTool('spline');
  const tailPts = [[-30, 0], [-38, 8], [-44, 18], [-40, 26], [-35, 30]].map(
    ([x, y], i) => mkPoint(x, y, `tail_pt_${i}`),
  );
  const splinePtIds = tailPts.map((p) => p.id);
  mkSegment('spline', splinePtIds, 'cat_tail');
  store().addSketchConstraint({ id: 'c_tan', type: 'tangent', entityIds: ['cat_tail'], satisfied: true });
  sketches.push({
    id: 'sketch_tail', name: 'Sketch 5 — Tail', plane: store().sketchPlane,
    planeInfo: store().sketchPlaneInfo ? { ...store().sketchPlaneInfo! } : null,
    points: [...store().sketchPoints], segments: [...store().sketchSegments],
    constraints: [...store().sketchConstraints], dimensions: [...store().sketchDimensions],
    dof: store().sketchDof,
  });
  finishSketch(5);

  // ═══ Extrude Body ═══
  store().openFeatureDialog('extrude');
  store().updateFeatureDialogParam('distance', 22);
  store().updateFeatureDialogParam('direction', 'one_side');
  store().updateFeatureDialogParam('operation', 'new_body');
  store().updateFeatureDialogParam('taper', 0);
  store().updateFeatureDialogParam('symmetric', true);
  const extBodyP = { ...store().featureDialog.params };
  store().closeFeatureDialog();
  // Body: 60×30 sketch, extruded 22 symmetric → box centered at origin
  // Viewport uses BoxGeometry(20,20,20), so scale to match: 60/20=3, 30/20=1.5, 22/20=1.1
  const bodyEnt = addEntity('Callicat Body', 'box', { faceCount: 10, edgeCount: 24, vertexCount: 16 },
    { position: [0, 0, 0], scale: [3, 1.5, 1.1] });
  features.push({ id: 'ext_body', name: 'Extrude 1', type: 'extrude', params: extBodyP, sketchRef: 'sketch_body', entityRef: bodyEnt.id });
  store().setTimeline([...store().timeline, { id: 'ext_body', name: 'Extrude 1', type: 'extrude', suppressed: false, hasError: false }]);

  // ═══ Extrude Head ═══
  store().openFeatureDialog('extrude');
  store().updateFeatureDialogParam('distance', 22);
  store().updateFeatureDialogParam('symmetric', true);
  const extHeadP = { ...store().featureDialog.params };
  store().closeFeatureDialog();
  // Head: circle at (45,0) radius=18, extruded 22 symmetric → sphere at (45,0,0)
  // Viewport uses SphereGeometry(10), so scale 18/10=1.8
  const headEnt = addEntity('Callicat Head', 'sphere', { faceCount: 3, edgeCount: 6, vertexCount: 2 },
    { position: [45, 0, 0], scale: [1.8, 1.8, 1.1] });
  features.push({ id: 'ext_head', name: 'Extrude 2', type: 'extrude', params: extHeadP, sketchRef: 'sketch_head', entityRef: headEnt.id });
  store().setTimeline([...store().timeline, { id: 'ext_head', name: 'Extrude 2', type: 'extrude', suppressed: false, hasError: false }]);

  // ═══ Extrude Ears ═══
  // Left ear: triangle centered around (38.5, 22) — 7 wide, 16 tall, extruded 5 symmetric
  // Scale: 7/20=0.35, 16/20=0.8, 5/20=0.25
  const earLEnt = addEntity('Left Ear', 'box', { faceCount: 5, edgeCount: 9, vertexCount: 6 },
    { position: [38.5, 22, 0], scale: [0.35, 0.8, 0.25] });
  // Right ear: triangle centered around (51.5, 22) — same dimensions
  const earREnt = addEntity('Right Ear', 'box', { faceCount: 5, edgeCount: 9, vertexCount: 6 },
    { position: [51.5, 22, 0], scale: [0.35, 0.8, 0.25] });
  features.push({ id: 'ext_earL', name: 'Extrude 3', type: 'extrude', params: { distance: 5, symmetric: true }, sketchRef: 'sketch_left_ear', entityRef: earLEnt.id });
  features.push({ id: 'ext_earR', name: 'Extrude 4', type: 'extrude', params: { distance: 5, symmetric: true }, sketchRef: 'sketch_right_ear', entityRef: earREnt.id });
  store().setTimeline([...store().timeline,
    { id: 'ext_earL', name: 'Extrude 3', type: 'extrude', suppressed: false, hasError: false },
    { id: 'ext_earR', name: 'Extrude 4', type: 'extrude', suppressed: false, hasError: false },
  ]);

  // ═══ Sweep Tail ═══
  store().openFeatureDialog('sweep');
  store().updateFeatureDialogParam('orientation', 'perpendicular');
  store().updateFeatureDialogParam('operation', 'new_body');
  const sweepP = { ...store().featureDialog.params };
  store().closeFeatureDialog();
  // Tail: spline from (-30,0) to (-35,30) swept perpendicular → cylinder
  // Centered at (-37, 15, 0), tall and thin
  // Viewport CylinderGeometry(10,10,30,32), scale: radius 3/10=0.3, height 30/30=1
  const tailEnt = addEntity('Callicat Tail', 'cylinder', { faceCount: 2, edgeCount: 4, vertexCount: 0 },
    { position: [-37, 15, 0], rotation: [0, 0, 0.3], scale: [0.3, 1, 0.3] });
  features.push({ id: 'sweep_tail', name: 'Sweep 1', type: 'sweep', params: sweepP, sketchRef: 'sketch_tail', entityRef: tailEnt.id });
  store().setTimeline([...store().timeline, { id: 'sweep_tail', name: 'Sweep 1', type: 'sweep', suppressed: false, hasError: false }]);

  // ═══ Boolean Combine ═══
  store().openFeatureDialog('boolean', { operation: 'combine' });
  const boolP = { ...store().featureDialog.params };
  store().closeFeatureDialog();
  features.push({ id: 'bool1', name: 'Combine 1', type: 'boolean', params: boolP });
  store().setTimeline([...store().timeline, { id: 'bool1', name: 'Combine 1', type: 'boolean', suppressed: false, hasError: false }]);

  // ═══ Fillet Edges ═══
  store().openFeatureDialog('fillet');
  store().updateFeatureDialogParam('radius', 4);
  const filletP = { ...store().featureDialog.params };
  store().closeFeatureDialog();
  features.push({ id: 'fil1', name: 'Fillet 1', type: 'fillet', params: filletP });
  store().setTimeline([...store().timeline, { id: 'fil1', name: 'Fillet 1', type: 'fillet', suppressed: false, hasError: false }]);

  // ═══ Eye Holes ═══
  store().openFeatureDialog('hole');
  store().updateFeatureDialogParam('diameter', 5);
  store().updateFeatureDialogParam('depth', 3);
  store().updateFeatureDialogParam('holeType', 'simple');
  const holeP = { ...store().featureDialog.params };
  store().closeFeatureDialog();
  features.push({ id: 'hole_eye1', name: 'Hole 1', type: 'hole', params: holeP });
  features.push({ id: 'hole_eye2', name: 'Hole 2', type: 'hole', params: { ...holeP } });
  store().setTimeline([...store().timeline,
    { id: 'hole_eye1', name: 'Hole 1', type: 'hole', suppressed: false, hasError: false },
    { id: 'hole_eye2', name: 'Hole 2', type: 'hole', suppressed: false, hasError: false },
  ]);

  // ═══ Shell ═══
  store().openFeatureDialog('shell');
  store().updateFeatureDialogParam('thickness', 1.5);
  store().updateFeatureDialogParam('direction', 'inside');
  const shellP = { ...store().featureDialog.params };
  store().closeFeatureDialog();
  features.push({ id: 'sh1', name: 'Shell 1', type: 'shell', params: shellP });
  store().setTimeline([...store().timeline, { id: 'sh1', name: 'Shell 1', type: 'shell', suppressed: false, hasError: false }]);

  // ═══ Assembly Mate ═══
  store().addMate({ id: 'j_body_head', type: 'fastened', part1: bodyEnt.id, part2: headEnt.id, name: 'Body-Head Joint' });

  // Set view
  store().setViewStyle('shadedEdges');
  store().setCameraProjection('orthographic');

  store().setStatusMessage(`✅ Callicat model built: ${store().entities.length} entities, ${store().timeline.length} timeline entries`);

  return { sketches, features };
}

/**
 * Build the callicat and serialize to a project JSON string.
 */
export function buildAndSerializeCallicat(): string {
  const { sketches, features } = buildCallicat();
  const project = serializeProject(sketches, features);
  return projectToJSON(project);
}
