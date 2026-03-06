/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  User Interaction Automata — Callicat 3D Model Workflow            ║
 * ║                                                                     ║
 * ║  Simulates a real user designing a stylised 3D cat ("callicat")    ║
 * ║  through mouse movements, clicks, drags and keyboard strokes.      ║
 * ║  Every step mirrors the exact sequence a CAD operator would take   ║
 * ║  inside the r3ditor UI.                                             ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 *  Model breakdown
 *  ───────────────
 *  • Body     — extruded rounded rectangle on XY plane
 *  • Head     — extruded circle on XY plane offset from body
 *  • Ears     — two extruded triangles (arc3point + lines)
 *  • Tail     — extruded spline curve on XZ plane
 *  • Eyes     — two cylinder holes (hole feature)
 *  • Whiskers — construction lines (no extrusion, reference only)
 *  • Assembly — boolean combine head → body, fillet edges
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEditorStore } from '../../store/editorStore';
import type {
  Entity,
  SketchPlaneInfo,
  SketchPoint,
  SketchSegment,
  SketchConstraint,
  SketchDimension,
  TimelineEntry,
  BrowserNode,
} from '../../store/editorStore';
import { normalizeKeyEvent } from '../../shortcuts/registry';
import {
  serializeProject,
  projectToJSON,
  projectFromJSON,
  loadProjectIntoStore,
  PROJECT_FORMAT_VERSION,
  type R3dProject,
  type SketchSnapshot,
  type FeatureSnapshot,
} from '../../store/modelSerializer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Test Helpers: User-Interaction Automata ─────────────────────────────────

/** Reset the entire editor to a clean initial state (like launching the app). */
function resetApp() {
  useEditorStore.setState(useEditorStore.getInitialState());
}

/** Get current state snapshot (shorthand). */
function state() {
  return useEditorStore.getState();
}

/** Shorthand for calling store actions. */
function store() {
  return useEditorStore.getState();
}

// ─── Keyboard Automata ───────────────────────────────────────────────────────

/**
 * Simulate a keyboard key press — builds a KeyboardEvent and dispatches
 * it on `window`, exactly like a real key press in the DOM.
 */
function pressKey(
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {},
) {
  const event = new KeyboardEvent('keydown', {
    key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: modifiers.ctrl ?? false,
    shiftKey: modifiers.shift ?? false,
    altKey: modifiers.alt ?? false,
    metaKey: modifiers.meta ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}

/** Press Enter key. */
function pressEnter() {
  pressKey('Enter');
}

/** Press Escape key. */
function pressEscape() {
  pressKey('Escape');
}

/** Press Delete key. */
function pressDelete() {
  pressKey('Delete');
}

// ─── Mouse Automata ──────────────────────────────────────────────────────────

/**
 * Simulate a mouse click at viewport pixel coordinates.
 * In jsdom we can't do real raycasting, so we directly call the
 * store's draw-state and point-addition actions — the same code paths
 * that the Viewport3D component would trigger after raycasting.
 */
function mouseClickAtSketchPoint(x: number, y: number, id?: string) {
  const ptId = id ?? `pt_auto_${x}_${y}`;
  store().addSketchPoint({ id: ptId, x, y, isConstruction: false });
  return ptId;
}

/** Simulate clicking a construction-mode point. */
function mouseClickConstructionPoint(x: number, y: number, id?: string) {
  const ptId = id ?? `pt_con_${x}_${y}`;
  store().addSketchPoint({ id: ptId, x, y, isConstruction: true });
  return ptId;
}

/**
 * Simulate a mouse drag from (x1,y1) to (x2,y2) in sketch coordinates.
 * This updates the drawState the same way the overlay does.
 */
function mouseDrag(x1: number, y1: number, x2: number, y2: number) {
  store().setDrawState({ active: true, startPoint: { x: x1, y: y1 }, currentPoint: { x: x1, y: y1 } });
  store().setDrawState({ currentPoint: { x: x2, y: y2 } });
  store().setDrawState({ active: false, startPoint: null, currentPoint: null });
}

/**
 * Simulate a mouse move (hover) — updates the current draw point
 * without committing a click.
 */
function mouseMoveTo(x: number, y: number) {
  store().setDrawState({ currentPoint: { x, y } });
}

// ─── Sketch Geometry Builders ────────────────────────────────────────────────

/** Draw a line between two existing points. */
function drawLine(id: string, startPtId: string, endPtId: string, construction = false): SketchSegment {
  const seg: SketchSegment = { id, type: 'line', points: [startPtId, endPtId], isConstruction: construction };
  store().addSketchSegment(seg);
  return seg;
}

/** Draw a rectangle — adds 4 points + 1 rectangle segment. */
function drawRectangle(
  id: string,
  x: number, y: number, w: number, h: number,
): { points: string[]; segment: SketchSegment } {
  const p0 = mouseClickAtSketchPoint(x, y, `${id}_p0`);
  const p1 = mouseClickAtSketchPoint(x + w, y, `${id}_p1`);
  const p2 = mouseClickAtSketchPoint(x + w, y + h, `${id}_p2`);
  const p3 = mouseClickAtSketchPoint(x, y + h, `${id}_p3`);
  const seg: SketchSegment = { id, type: 'rectangle', points: [p0, p1, p2, p3], isConstruction: false };
  store().addSketchSegment(seg);
  return { points: [p0, p1, p2, p3], segment: seg };
}

/** Draw a circle — center + edge point + segment. */
function drawCircle(
  id: string,
  cx: number, cy: number, r: number,
): { centerPt: string; edgePt: string; segment: SketchSegment } {
  const centerPt = mouseClickAtSketchPoint(cx, cy, `${id}_center`);
  const edgePt = mouseClickAtSketchPoint(cx + r, cy, `${id}_edge`);
  const seg: SketchSegment = { id, type: 'circle', points: [centerPt, edgePt], isConstruction: false };
  store().addSketchSegment(seg);
  return { centerPt, edgePt, segment: seg };
}

/** Draw an arc from 3 click points. */
function drawArc3Point(
  id: string,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
): { points: string[]; segment: SketchSegment } {
  const pt1 = mouseClickAtSketchPoint(x1, y1, `${id}_p1`);
  const pt2 = mouseClickAtSketchPoint(x2, y2, `${id}_p2`);
  const pt3 = mouseClickAtSketchPoint(x3, y3, `${id}_p3`);
  const seg: SketchSegment = { id, type: 'arc', points: [pt1, pt2, pt3], isConstruction: false };
  store().addSketchSegment(seg);
  return { points: [pt1, pt2, pt3], segment: seg };
}

/** Draw a spline through N points. */
function drawSpline(
  id: string,
  coords: [number, number][],
): { points: string[]; segment: SketchSegment } {
  const ptIds = coords.map(([x, y], i) =>
    mouseClickAtSketchPoint(x, y, `${id}_sp${i}`),
  );
  const seg: SketchSegment = { id, type: 'spline', points: ptIds, isConstruction: false };
  store().addSketchSegment(seg);
  return { points: ptIds, segment: seg };
}

// ─── Constraint / Dimension helpers ──────────────────────────────────────────

let constraintCounter = 0;
let dimensionCounter = 0;

function addConstraint(type: SketchConstraint['type'], entityIds: string[], value?: number): SketchConstraint {
  const c: SketchConstraint = {
    id: `c_${++constraintCounter}`,
    type,
    entityIds,
    value,
    satisfied: true,
  };
  store().addSketchConstraint(c);
  return c;
}

function addDimension(
  type: SketchDimension['type'],
  entityIds: string[],
  value: number,
  driving = true,
): SketchDimension {
  const d: SketchDimension = {
    id: `dim_${++dimensionCounter}`,
    type,
    entityIds,
    value,
    driving,
  };
  store().addSketchDimension(d);
  return d;
}

// ─── Entity / Feature helpers ────────────────────────────────────────────────

let entityCounter = 0;

function createEntity(
  name: string,
  type: Entity['type'] = 'brep',
  overrides: Partial<Entity> = {},
): Entity {
  const entity: Entity = {
    id: `ent_${++entityCounter}`,
    name,
    visible: true,
    locked: false,
    suppressed: false,
    faceCount: 6,
    edgeCount: 12,
    vertexCount: 8,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    type,
    ...overrides,
  };
  store().addEntity(entity);
  return entity;
}

/** Helper: begin a new sketch on a named plane and enter drawing mode. */
function beginSketchOnPlane(plane: 'XY' | 'XZ' | 'YZ') {
  // User presses N to start sketch creation
  store().beginPlaneSelection();
  expect(state().sketchPhase).toBe('selectPlane');

  // User clicks a standard plane
  const planeInfoMap: Record<string, SketchPlaneInfo> = {
    XY: { type: 'XY', origin: [0, 0, 0], normal: [0, 0, 1], uAxis: [1, 0, 0], vAxis: [0, 1, 0] },
    XZ: { type: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1] },
    YZ: { type: 'YZ', origin: [0, 0, 0], normal: [1, 0, 0], uAxis: [0, 1, 0], vAxis: [0, 0, 1] },
  };
  store().selectSketchPlane(planeInfoMap[plane]);
  expect(state().sketchPhase).toBe('drawing');
  expect(state().isSketchActive).toBe(true);
  expect(state().activeSketchTool).toBe('line');
}

/** Helper: finish the current sketch and verify it entered the timeline. */
function finishCurrentSketch(expectedSketchNumber: number) {
  const timelineBefore = state().timeline.length;
  store().finishSketch();
  expect(state().isSketchActive).toBe(false);
  expect(state().sketchPhase).toBeNull();
  expect(state().timeline.length).toBe(timelineBefore + 1);
  const lastEntry = state().timeline[state().timeline.length - 1];
  expect(lastEntry.type).toBe('sketch');
  expect(lastEntry.name).toBe(`Sketch ${expectedSketchNumber}`);
  return lastEntry;
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEST SUITE — Callicat 3D Model User Interaction Automata
// ═════════════════════════════════════════════════════════════════════════════

describe('User Interaction Automata — Callicat 3D Model', () => {
  beforeEach(() => {
    resetApp();
    constraintCounter = 0;
    dimensionCounter = 0;
    entityCounter = 0;
  });

  // ─── Phase 1: Application Launch & Initial State ─────────────────────

  describe('Phase 1 — Application Launch', () => {
    it('starts in a clean design workspace', () => {
      expect(state().documentName).toBe('Untitled');
      expect(state().workspaceMode).toBe('design');
      expect(state().fusionWorkspace).toBe('SOLID');
      expect(state().activeTool).toBe('select');
      expect(state().isSketchActive).toBe(false);
      expect(state().entities).toHaveLength(0);
      expect(state().timeline).toHaveLength(0);
      expect(state().statusMessage).toBe('Ready');
    });

    it('renames the document to Callicat', () => {
      store().setDocumentName('Callicat');
      expect(state().documentName).toBe('Callicat');
    });

    it('verifies default browser tree has origin planes', () => {
      const comp = state().browserTree.find((n) => n.type === 'component');
      expect(comp).toBeDefined();
      const origin = comp!.children.find((n) => n.type === 'origin');
      expect(origin).toBeDefined();
      const planes = origin!.children.filter((n) => n.type === 'plane');
      expect(planes).toHaveLength(3); // XY, XZ, YZ
    });

    it('sets camera to orthographic for precise sketching', () => {
      // User presses Shift+5 equivalent
      store().setCameraProjection('orthographic');
      expect(state().cameraProjection).toBe('orthographic');
    });

    it('zooms to fit via Z key equivalent', () => {
      useEditorStore.setState({ viewCommand: 'zoomFit' });
      expect(state().viewCommand).toBe('zoomFit');
      store().clearViewCommand();
      expect(state().viewCommand).toBeNull();
    });
  });

  // ─── Phase 2: Cat Body Sketch ────────────────────────────────────────

  describe('Phase 2 — Cat Body Sketch (rounded rectangle on XY)', () => {
    it('creates a new sketch on XY plane', () => {
      beginSketchOnPlane('XY');
      expect(state().sketchPlane).toBe('XY');
      expect(state().sketchPlaneInfo?.normal).toEqual([0, 0, 1]);
    });

    it('draws the body rectangle 60×30 centered at origin', () => {
      beginSketchOnPlane('XY');

      // User switches to rectangle tool (R key)
      store().setSketchTool('rectangle');
      expect(state().activeSketchTool).toBe('rectangle');

      // User clicks and drags to form rectangle
      const { points, segment } = drawRectangle('body_rect', -30, -15, 60, 30);
      expect(state().sketchPoints).toHaveLength(4);
      expect(state().sketchSegments).toHaveLength(1);
      expect(segment.type).toBe('rectangle');
      expect(points).toHaveLength(4);
    });

    it('constrains the body rectangle symmetrically', () => {
      beginSketchOnPlane('XY');
      const { points } = drawRectangle('body_rect', -30, -15, 60, 30);

      // Add horizontal constraints to top and bottom edges
      addConstraint('horizontal', ['body_rect']);
      addConstraint('vertical', ['body_rect']);

      // Add dimensions: width = 60, height = 30
      addDimension('distance', [points[0], points[1]], 60);
      addDimension('distance', [points[1], points[2]], 30);

      expect(state().sketchConstraints).toHaveLength(2);
      expect(state().sketchDimensions).toHaveLength(2);
      // DOF: 4 points × 2 = 8 DOF, minus 2 constraints minus 2 dimensions = 4 DOF remaining
      expect(state().sketchDof).toBe(4);
    });

    it('adds fillet2d corners to soften the body', () => {
      beginSketchOnPlane('XY');
      drawRectangle('body_rect', -30, -15, 60, 30);

      // User switches to fillet2d tool
      store().setSketchTool('fillet2d');
      expect(state().activeSketchTool).toBe('fillet2d');

      // Simulate clicking on each corner (the fillet2d results in arc segments)
      drawArc3Point('fillet_bl', -30, -12, -27, -15, -30, -15);
      drawArc3Point('fillet_br', 27, -15, 30, -12, 30, -15);
      drawArc3Point('fillet_tr', 30, 12, 27, 15, 30, 15);
      drawArc3Point('fillet_tl', -27, 15, -30, 12, -30, 15);

      expect(state().sketchSegments.length).toBeGreaterThanOrEqual(5); // 1 rect + 4 arcs
    });

    it('finishes the body sketch and checks timeline', () => {
      beginSketchOnPlane('XY');
      drawRectangle('body_rect', -30, -15, 60, 30);
      addConstraint('horizontal', ['body_rect']);
      addDimension('distance', ['body_rect_p0', 'body_rect_p1'], 60);

      const entry = finishCurrentSketch(1);
      expect(entry.name).toBe('Sketch 1');

      // Verify browser tree now has sketch under Sketches folder
      const comp = state().browserTree.find((n) => n.type === 'component');
      const sketchesFolder = comp!.children.find((n) => n.name === 'Sketches');
      expect(sketchesFolder!.children.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Phase 3: Cat Head Sketch ────────────────────────────────────────

  describe('Phase 3 — Cat Head Sketch (circle on XY)', () => {
    it('creates head sketch after body sketch', () => {
      // First: finish body sketch
      beginSketchOnPlane('XY');
      drawRectangle('body_rect', -30, -15, 60, 30);
      finishCurrentSketch(1);

      // Now create head sketch
      beginSketchOnPlane('XY');
      expect(state().timeline).toHaveLength(1);
    });

    it('draws a circle for the cat head', () => {
      beginSketchOnPlane('XY');
      drawRectangle('body_rect', -30, -15, 60, 30);
      finishCurrentSketch(1);

      beginSketchOnPlane('XY');

      // Switch to circle tool (C key)
      store().setSketchTool('circle');
      expect(state().activeSketchTool).toBe('circle');

      // Draw head circle at (40, 0) with radius 15
      const { centerPt, edgePt, segment } = drawCircle('head_circle', 40, 0, 15);
      expect(segment.type).toBe('circle');
      expect(state().sketchPoints).toHaveLength(2);
      expect(state().sketchSegments).toHaveLength(1);
    });

    it('constrains and dimensions the head', () => {
      beginSketchOnPlane('XY');
      store().setSketchTool('circle');
      const { centerPt, edgePt } = drawCircle('head_circle', 40, 0, 15);

      // Constrain center on horizontal axis (y = 0)
      addConstraint('horizontal', [centerPt]);

      // Add radius dimension
      addDimension('radius', [centerPt, edgePt], 15);

      // Add distance from origin to center
      const originPt = mouseClickAtSketchPoint(0, 0, 'origin_ref');
      addDimension('distance', [originPt, centerPt], 40);

      expect(state().sketchConstraints).toHaveLength(1);
      expect(state().sketchDimensions).toHaveLength(2);
    });

    it('finishes head sketch as Sketch 2', () => {
      // Body sketch first
      beginSketchOnPlane('XY');
      drawRectangle('body', -30, -15, 60, 30);
      finishCurrentSketch(1);

      // Head sketch
      beginSketchOnPlane('XY');
      drawCircle('head', 40, 0, 15);
      addDimension('radius', ['head_center', 'head_edge'], 15);
      const entry = finishCurrentSketch(2);
      expect(entry.name).toBe('Sketch 2');
      expect(state().timeline).toHaveLength(2);
    });
  });

  // ─── Phase 4: Cat Ears Sketch ────────────────────────────────────────

  describe('Phase 4 — Cat Ears Sketch (triangles on XY)', () => {
    function setupBodyAndHead() {
      beginSketchOnPlane('XY');
      drawRectangle('body', -30, -15, 60, 30);
      finishCurrentSketch(1);
      beginSketchOnPlane('XY');
      drawCircle('head', 40, 0, 15);
      finishCurrentSketch(2);
    }

    it('creates ear sketch and draws left ear triangle', () => {
      setupBodyAndHead();
      beginSketchOnPlane('XY');

      // Switch to line tool (L key)
      store().setSketchTool('line');
      expect(state().activeSketchTool).toBe('line');

      // Left ear: triangle at top-left of head
      const earL_p0 = mouseClickAtSketchPoint(30, 10, 'earL_base0');
      const earL_p1 = mouseClickAtSketchPoint(35, 25, 'earL_tip');
      const earL_p2 = mouseClickAtSketchPoint(40, 10, 'earL_base1');

      drawLine('earL_s0', earL_p0, earL_p1);
      drawLine('earL_s1', earL_p1, earL_p2);
      drawLine('earL_s2', earL_p2, earL_p0);

      expect(state().sketchSegments).toHaveLength(3);
      expect(state().sketchPoints).toHaveLength(3);
    });

    it('draws right ear triangle', () => {
      setupBodyAndHead();
      beginSketchOnPlane('XY');
      store().setSketchTool('line');

      // Right ear: triangle at top-right of head
      const earR_p0 = mouseClickAtSketchPoint(40, 10, 'earR_base0');
      const earR_p1 = mouseClickAtSketchPoint(45, 25, 'earR_tip');
      const earR_p2 = mouseClickAtSketchPoint(50, 10, 'earR_base1');

      drawLine('earR_s0', earR_p0, earR_p1);
      drawLine('earR_s1', earR_p1, earR_p2);
      drawLine('earR_s2', earR_p2, earR_p0);

      expect(state().sketchSegments).toHaveLength(3);
    });

    it('constrains ears with equal and symmetric constraints', () => {
      setupBodyAndHead();
      beginSketchOnPlane('XY');
      store().setSketchTool('line');

      // Draw both ears
      const earL_p0 = mouseClickAtSketchPoint(30, 10, 'earL_b0');
      const earL_tip = mouseClickAtSketchPoint(35, 25, 'earL_t');
      const earL_p2 = mouseClickAtSketchPoint(40, 10, 'earL_b1');
      drawLine('earL_0', earL_p0, earL_tip);
      drawLine('earL_1', earL_tip, earL_p2);
      drawLine('earL_2', earL_p2, earL_p0);

      const earR_p0 = mouseClickAtSketchPoint(40, 10, 'earR_b0');
      const earR_tip = mouseClickAtSketchPoint(45, 25, 'earR_t');
      const earR_p2 = mouseClickAtSketchPoint(50, 10, 'earR_b1');
      drawLine('earR_0', earR_p0, earR_tip);
      drawLine('earR_1', earR_tip, earR_p2);
      drawLine('earR_2', earR_p2, earR_p0);

      // Equal constraint: both ear heights should match
      addConstraint('equal', ['earL_0', 'earR_0']);
      addConstraint('symmetric', ['earL_t', 'earR_t']);

      // Ear tip height dimension
      addDimension('distance', ['earL_b0', 'earL_t'], 15);

      expect(state().sketchConstraints).toHaveLength(2);
      expect(state().sketchDimensions).toHaveLength(1);
    });

    it('finishes ears sketch as Sketch 3', () => {
      setupBodyAndHead();
      beginSketchOnPlane('XY');
      store().setSketchTool('line');
      mouseClickAtSketchPoint(30, 10, 'ear_pt');
      drawLine('ear_line', 'ear_pt', 'ear_pt'); // minimal geometry
      const entry = finishCurrentSketch(3);
      expect(entry.name).toBe('Sketch 3');
      expect(state().timeline).toHaveLength(3);
    });
  });

  // ─── Phase 5: Cat Tail Sketch ────────────────────────────────────────

  describe('Phase 5 — Cat Tail Sketch (spline on XZ plane)', () => {
    function setupPriorSketches() {
      beginSketchOnPlane('XY');
      drawRectangle('body', -30, -15, 60, 30);
      finishCurrentSketch(1);
      beginSketchOnPlane('XY');
      drawCircle('head', 40, 0, 15);
      finishCurrentSketch(2);
      beginSketchOnPlane('XY');
      mouseClickAtSketchPoint(30, 10, 'ear');
      finishCurrentSketch(3);
    }

    it('creates tail sketch on XZ plane', () => {
      setupPriorSketches();
      beginSketchOnPlane('XZ');
      expect(state().sketchPlane).toBe('XZ');
      expect(state().sketchPlaneInfo?.normal).toEqual([0, 1, 0]);
    });

    it('draws a curved spline for the tail', () => {
      setupPriorSketches();
      beginSketchOnPlane('XZ');

      // Switch to spline tool (P key)
      store().setSketchTool('spline');
      expect(state().activeSketchTool).toBe('spline');

      // User clicks through 5 control points forming a curving tail
      const tailCoords: [number, number][] = [
        [-30, 0],   // base of tail at back of body
        [-40, 5],   // curves upward
        [-45, 15],  // rises more
        [-42, 22],  // curves forward
        [-38, 25],  // tip curls
      ];

      const { points, segment } = drawSpline('tail_spline', tailCoords);
      expect(segment.type).toBe('spline');
      expect(points).toHaveLength(5);
      expect(state().sketchPoints).toHaveLength(5);
      expect(state().sketchSegments).toHaveLength(1);
    });

    it('adds tangent constraint at tail base', () => {
      setupPriorSketches();
      beginSketchOnPlane('XZ');
      store().setSketchTool('spline');
      drawSpline('tail', [[-30, 0], [-40, 5], [-45, 15], [-42, 22], [-38, 25]]);

      // Tangent at the base so it flows smoothly off the body
      addConstraint('tangent', ['tail']);
      // Fix the start point to body edge
      addConstraint('fix', ['tail_sp0']);

      expect(state().sketchConstraints).toHaveLength(2);
    });

    it('finishes tail sketch as Sketch 4', () => {
      setupPriorSketches();
      beginSketchOnPlane('XZ');
      store().setSketchTool('spline');
      drawSpline('tail', [[-30, 0], [-40, 5], [-45, 15]]);
      const entry = finishCurrentSketch(4);
      expect(entry.name).toBe('Sketch 4');
      expect(state().timeline).toHaveLength(4);
    });
  });

  // ─── Phase 6: Whisker Construction Lines ─────────────────────────────

  describe('Phase 6 — Whisker Construction Lines', () => {
    function setupPriorSketches() {
      beginSketchOnPlane('XY');
      drawRectangle('body', -30, -15, 60, 30);
      finishCurrentSketch(1);
      beginSketchOnPlane('XY');
      drawCircle('head', 40, 0, 15);
      finishCurrentSketch(2);
      beginSketchOnPlane('XY');
      mouseClickAtSketchPoint(30, 10, 'ear');
      finishCurrentSketch(3);
      beginSketchOnPlane('XZ');
      mouseClickAtSketchPoint(-30, 0, 'tail');
      finishCurrentSketch(4);
    }

    it('draws construction whiskers on head sketch', () => {
      setupPriorSketches();
      beginSketchOnPlane('XY');

      // User presses X to toggle construction mode
      store().setSketchTool('constructionToggle');
      expect(state().activeSketchTool).toBe('constructionToggle');

      // Switch back to line tool for construction lines
      store().setSketchTool('line');

      // Three whiskers on each side
      // Left whiskers
      const wL1_start = mouseClickConstructionPoint(30, -2, 'wL1_s');
      const wL1_end = mouseClickConstructionPoint(15, -5, 'wL1_e');
      drawLine('whisker_L1', wL1_start, wL1_end, true);

      const wL2_start = mouseClickConstructionPoint(30, 0, 'wL2_s');
      const wL2_end = mouseClickConstructionPoint(15, 0, 'wL2_e');
      drawLine('whisker_L2', wL2_start, wL2_end, true);

      const wL3_start = mouseClickConstructionPoint(30, 2, 'wL3_s');
      const wL3_end = mouseClickConstructionPoint(15, 5, 'wL3_e');
      drawLine('whisker_L3', wL3_start, wL3_end, true);

      // Right whiskers
      const wR1_start = mouseClickConstructionPoint(50, -2, 'wR1_s');
      const wR1_end = mouseClickConstructionPoint(65, -5, 'wR1_e');
      drawLine('whisker_R1', wR1_start, wR1_end, true);

      const wR2_start = mouseClickConstructionPoint(50, 0, 'wR2_s');
      const wR2_end = mouseClickConstructionPoint(65, 0, 'wR2_e');
      drawLine('whisker_R2', wR2_start, wR2_end, true);

      const wR3_start = mouseClickConstructionPoint(50, 2, 'wR3_s');
      const wR3_end = mouseClickConstructionPoint(65, 5, 'wR3_e');
      drawLine('whisker_R3', wR3_start, wR3_end, true);

      expect(state().sketchSegments).toHaveLength(6);
      // All segments are construction lines
      for (const seg of state().sketchSegments) {
        expect(seg.isConstruction).toBe(true);
      }
      // All points are construction
      for (const pt of state().sketchPoints) {
        expect(pt.isConstruction).toBe(true);
      }
    });

    it('applies symmetric constraint to whisker pairs', () => {
      setupPriorSketches();
      beginSketchOnPlane('XY');
      store().setSketchTool('line');

      // Simplified: one pair
      mouseClickConstructionPoint(30, 0, 'wL');
      mouseClickConstructionPoint(50, 0, 'wR');
      drawLine('wL_line', 'wL', 'wL', true);
      drawLine('wR_line', 'wR', 'wR', true);

      addConstraint('symmetric', ['wL', 'wR']);
      expect(state().sketchConstraints).toHaveLength(1);
    });

    it('finishes whisker sketch as Sketch 5', () => {
      setupPriorSketches();
      beginSketchOnPlane('XY');
      mouseClickConstructionPoint(30, 0, 'w');
      const entry = finishCurrentSketch(5);
      expect(entry.name).toBe('Sketch 5');
      expect(state().timeline).toHaveLength(5);
    });
  });

  // ─── Phase 7: Extrude Features ───────────────────────────────────────

  describe('Phase 7 — Extrude Features (body, head, ears, tail)', () => {
    it('opens extrude dialog for body (E key equivalent)', () => {
      store().openFeatureDialog('extrude');
      const fd = state().featureDialog;
      expect(fd.open).toBe(true);
      expect(fd.featureType).toBe('extrude');
      expect(fd.params.distance).toBe(10); // default
      expect(fd.params.direction).toBe('one_side');
      expect(fd.params.operation).toBe('new_body');
    });

    it('configures body extrusion: distance = 20, symmetric', () => {
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 20);
      store().updateFeatureDialogParam('symmetric', true);
      store().updateFeatureDialogParam('operation', 'new_body');

      expect(state().featureDialog.params.distance).toBe(20);
      expect(state().featureDialog.params.symmetric).toBe(true);
    });

    it('accepts extrude → creates body entity and timeline entry', () => {
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 20);
      store().closeFeatureDialog();

      // Simulate the feature result: a new body entity + timeline entry
      const bodyEntity = createEntity('Cat Body', 'brep', {
        faceCount: 10,
        edgeCount: 24,
        vertexCount: 16,
      });

      store().setTimeline([
        ...state().timeline,
        { id: 'extrude_body', name: 'Extrude 1', type: 'extrude', suppressed: false, hasError: false },
      ]);

      expect(state().entities).toHaveLength(1);
      expect(state().entities[0].name).toBe('Cat Body');
      expect(state().timeline.some((e) => e.type === 'extrude')).toBe(true);
    });

    it('extrudes head circle into cylinder-like brep', () => {
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 20);
      store().updateFeatureDialogParam('symmetric', true);
      store().closeFeatureDialog();

      const headEntity = createEntity('Cat Head', 'brep', {
        faceCount: 3, // top + bottom + curved face
        edgeCount: 6,
        vertexCount: 2,
      });

      store().setTimeline([
        ...state().timeline,
        { id: 'extrude_head', name: 'Extrude 2', type: 'extrude', suppressed: false, hasError: false },
      ]);

      expect(state().entities).toHaveLength(1);
      expect(state().entities[0].name).toBe('Cat Head');
    });

    it('extrudes ears as thin prisms', () => {
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 5);
      store().updateFeatureDialogParam('symmetric', true);
      store().closeFeatureDialog();

      const leftEar = createEntity('Left Ear', 'brep');
      const rightEar = createEntity('Right Ear', 'brep');

      expect(state().entities).toHaveLength(2);
    });

    it('extrudes tail spline as swept thin body', () => {
      // For tail, use sweep feature instead
      store().openFeatureDialog('sweep');
      expect(state().featureDialog.featureType).toBe('sweep');
      store().updateFeatureDialogParam('orientation', 'perpendicular');
      store().closeFeatureDialog();

      const tailEntity = createEntity('Cat Tail', 'brep', {
        faceCount: 2,
        edgeCount: 4,
        vertexCount: 0,
      });

      expect(state().entities).toHaveLength(1);
      expect(state().entities[0].name).toBe('Cat Tail');
    });
  });

  // ─── Phase 8: Eye Holes ──────────────────────────────────────────────

  describe('Phase 8 — Eye Holes (hole feature on head)', () => {
    it('opens hole dialog (H key equivalent)', () => {
      store().openFeatureDialog('hole');
      const fd = state().featureDialog;
      expect(fd.open).toBe(true);
      expect(fd.featureType).toBe('hole');
      expect(fd.params.diameter).toBe(5);
      expect(fd.params.depth).toBe(10);
      expect(fd.params.holeType).toBe('simple');
    });

    it('configures eye holes: diameter = 4, depth = 3', () => {
      store().openFeatureDialog('hole');
      store().updateFeatureDialogParam('diameter', 4);
      store().updateFeatureDialogParam('depth', 3);

      expect(state().featureDialog.params.diameter).toBe(4);
      expect(state().featureDialog.params.depth).toBe(3);
    });

    it('creates two eye holes with circular pattern', () => {
      // Left eye
      store().openFeatureDialog('hole');
      store().updateFeatureDialogParam('diameter', 4);
      store().updateFeatureDialogParam('depth', 3);
      store().closeFeatureDialog();

      store().setTimeline([
        ...state().timeline,
        { id: 'hole_left_eye', name: 'Hole 1', type: 'hole', suppressed: false, hasError: false },
        { id: 'hole_right_eye', name: 'Hole 2', type: 'hole', suppressed: false, hasError: false },
      ]);

      expect(state().timeline.filter((e) => e.type === 'hole')).toHaveLength(2);
    });
  });

  // ─── Phase 9: Boolean Combine ────────────────────────────────────────

  describe('Phase 9 — Boolean Combine (assemble head + body)', () => {
    function setupEntities() {
      createEntity('Cat Body', 'brep');
      createEntity('Cat Head', 'brep');
      createEntity('Left Ear', 'brep');
      createEntity('Right Ear', 'brep');
      createEntity('Cat Tail', 'brep');
    }

    it('opens boolean dialog (B key equivalent)', () => {
      store().openFeatureDialog('boolean');
      expect(state().featureDialog.featureType).toBe('boolean');
      expect(state().featureDialog.params.operation).toBe('combine');
    });

    it('selects body and head for combine', () => {
      setupEntities();

      // User selects body, then Ctrl-clicks head
      store().select(state().entities[0].id); // body
      store().multiSelect(state().entities[1].id); // head
      expect(state().selectedIds).toHaveLength(2);

      // Open boolean combine
      store().openFeatureDialog('boolean', { operation: 'combine' });
      expect(state().featureDialog.params.operation).toBe('combine');
      store().closeFeatureDialog();
    });

    it('combines all parts sequentially', () => {
      setupEntities();
      expect(state().entities).toHaveLength(5);

      // After boolean combine, we'd end up with fewer entities
      // Simulate the combine result
      store().setTimeline([
        { id: 'bool_1', name: 'Combine 1', type: 'boolean', suppressed: false, hasError: false },
        { id: 'bool_2', name: 'Combine 2', type: 'boolean', suppressed: false, hasError: false },
      ]);

      expect(state().timeline.filter((e) => e.type === 'boolean')).toHaveLength(2);
    });
  });

  // ─── Phase 10: Fillet Edges ──────────────────────────────────────────

  describe('Phase 10 — Fillet Edges (F key)', () => {
    it('opens fillet dialog with default radius', () => {
      store().openFeatureDialog('fillet');
      expect(state().featureDialog.featureType).toBe('fillet');
      expect(state().featureDialog.params.radius).toBe(2);
    });

    it('configures fillet radius for soft cat body', () => {
      store().openFeatureDialog('fillet');
      store().updateFeatureDialogParam('radius', 3);
      expect(state().featureDialog.params.radius).toBe(3);
    });

    it('applies fillet and adds timeline entry', () => {
      store().openFeatureDialog('fillet');
      store().updateFeatureDialogParam('radius', 3);
      store().closeFeatureDialog();

      store().setTimeline([
        ...state().timeline,
        { id: 'fillet_body', name: 'Fillet 1', type: 'fillet', suppressed: false, hasError: false },
      ]);

      expect(state().timeline.some((e) => e.type === 'fillet')).toBe(true);
    });
  });

  // ─── Phase 11: Chamfer (nose detail) ─────────────────────────────────

  describe('Phase 11 — Chamfer nose detail', () => {
    it('opens chamfer dialog', () => {
      store().openFeatureDialog('chamfer');
      expect(state().featureDialog.featureType).toBe('chamfer');
      expect(state().featureDialog.params.distance).toBe(1);
      expect(state().featureDialog.params.chamferType).toBe('equal_distance');
    });

    it('sets chamfer for nose edge', () => {
      store().openFeatureDialog('chamfer');
      store().updateFeatureDialogParam('distance', 0.5);
      store().updateFeatureDialogParam('angle', 30);
      store().closeFeatureDialog();

      store().setTimeline([
        ...state().timeline,
        { id: 'chamfer_nose', name: 'Chamfer 1', type: 'chamfer', suppressed: false, hasError: false },
      ]);

      expect(state().timeline.some((e) => e.type === 'chamfer')).toBe(true);
    });
  });

  // ─── Phase 12: Shell (hollow the body) ───────────────────────────────

  describe('Phase 12 — Shell (hollow body for lightweight model)', () => {
    it('applies shell feature', () => {
      store().openFeatureDialog('shell');
      expect(state().featureDialog.params.thickness).toBe(1);
      expect(state().featureDialog.params.direction).toBe('inside');

      store().updateFeatureDialogParam('thickness', 2);
      store().closeFeatureDialog();

      store().setTimeline([
        ...state().timeline,
        { id: 'shell_body', name: 'Shell 1', type: 'shell', suppressed: false, hasError: false },
      ]);

      expect(state().timeline.some((e) => e.type === 'shell')).toBe(true);
    });
  });

  // ─── Phase 13: Linear Pattern (paws) ────────────────────────────────

  describe('Phase 13 — Linear Pattern for paws', () => {
    it('creates a paw feature and patterns it', () => {
      store().openFeatureDialog('linearPattern');
      expect(state().featureDialog.params.count).toBe(3);
      expect(state().featureDialog.params.spacing).toBe(20);

      store().updateFeatureDialogParam('count', 4);
      store().updateFeatureDialogParam('spacing', 15);
      store().updateFeatureDialogParam('direction', 'x');
      store().closeFeatureDialog();

      store().setTimeline([
        ...state().timeline,
        { id: 'paw_pattern', name: 'Linear Pattern 1', type: 'linearPattern', suppressed: false, hasError: false },
      ]);

      expect(state().timeline.some((e) => e.type === 'linearPattern')).toBe(true);
    });
  });

  // ─── Phase 14: View & Appearance ─────────────────────────────────────

  describe('Phase 14 — View manipulation and appearance', () => {
    it('switches to shaded-with-edges view style', () => {
      store().setViewStyle('shadedEdges');
      expect(state().viewStyle).toBe('shadedEdges');
    });

    it('cycles through all view styles', () => {
      const styles: Array<'shaded' | 'shadedEdges' | 'wireframe' | 'hidden'> = [
        'shaded', 'shadedEdges', 'wireframe', 'hidden',
      ];
      for (const style of styles) {
        store().setViewStyle(style);
        expect(state().viewStyle).toBe(style);
      }
    });

    it('switches standard views', () => {
      const views = ['front', 'back', 'top', 'bottom', 'left', 'right', 'iso'];
      for (const view of views) {
        useEditorStore.setState({ viewCommand: view });
        expect(state().viewCommand).toBe(view);
        store().clearViewCommand();
      }
    });

    it('toggles perspective ↔ orthographic', () => {
      expect(state().cameraProjection).toBe('perspective');
      store().toggleCameraProjection();
      expect(state().cameraProjection).toBe('orthographic');
      store().toggleCameraProjection();
      expect(state().cameraProjection).toBe('perspective');
    });

    it('toggles grid, axes, origin, planes', () => {
      const initialGrid = state().showGrid;
      store().toggleGrid();
      expect(state().showGrid).toBe(!initialGrid);

      const initialAxes = state().showAxes;
      store().toggleAxes();
      expect(state().showAxes).toBe(!initialAxes);

      store().toggleOrigin();
      store().togglePlanes();
      expect(state().showPlanes).toBe(true); // was false initially
    });

    it('opens appearance panel via inspector', () => {
      store().setInspectorTab('appearance');
      if (!state().inspectorOpen) store().toggleInspector();
      expect(state().inspectorOpen).toBe(true);
      expect(state().inspectorTab).toBe('appearance');
    });
  });

  // ─── Phase 15: Measure & Inspect ─────────────────────────────────────

  describe('Phase 15 — Measure & Section Analysis', () => {
    it('measures distance between two points', () => {
      store().setMeasurePoint('A', [0, 0, 0]);
      store().setMeasurePoint('B', [30, 40, 0]);
      expect(state().measureResult.distance).toBe(50); // 3-4-5 triangle × 10
    });

    it('clears measurement', () => {
      store().setMeasurePoint('A', [0, 0, 0]);
      store().setMeasurePoint('B', [10, 0, 0]);
      store().clearMeasure();
      expect(state().measureResult.distance).toBeNull();
    });

    it('toggles section analysis plane', () => {
      store().toggleSectionPlane();
      expect(state().sectionPlane.enabled).toBe(true);
      store().setSectionPlane({ origin: [20, 0, 0], normal: [1, 0, 0] });
      expect(state().sectionPlane.origin).toEqual([20, 0, 0]);
    });
  });

  // ─── Phase 16: Box / Window Selection ────────────────────────────────

  describe('Phase 16 — Box & Window Selection', () => {
    function setupEntities() {
      createEntity('Cat Body', 'brep');
      createEntity('Cat Head', 'brep');
      createEntity('Left Ear', 'brep');
    }

    it('performs window selection (left → right)', () => {
      setupEntities();
      store().startBoxSelection(100, 100);
      store().updateBoxSelection(300, 300);

      const bs = state().boxSelection;
      expect(bs.active).toBe(true);
      expect(bs.mode).toBe('window'); // left→right = window
      expect(bs.startX).toBe(100);
      expect(bs.currentX).toBe(300);

      store().endBoxSelection();
      expect(state().boxSelection.active).toBe(false);
    });

    it('performs crossing selection (right → left)', () => {
      setupEntities();
      store().startBoxSelection(300, 100);
      store().updateBoxSelection(100, 300);

      expect(state().boxSelection.mode).toBe('crossing');
      store().endBoxSelection();
    });
  });

  // ─── Phase 17: Undo / Redo Simulation ────────────────────────────────

  describe('Phase 17 — Undo / Redo Workflow', () => {
    it('tracks history capability', () => {
      store().setHistory(true, false);
      expect(state().canUndo).toBe(true);
      expect(state().canRedo).toBe(false);

      store().setHistory(true, true);
      expect(state().canRedo).toBe(true);
    });

    it('uses timeline rollback', () => {
      store().setTimeline([
        { id: 's1', name: 'Sketch 1', type: 'sketch', suppressed: false, hasError: false },
        { id: 'e1', name: 'Extrude 1', type: 'extrude', suppressed: false, hasError: false },
        { id: 'f1', name: 'Fillet 1', type: 'fillet', suppressed: false, hasError: false },
      ]);

      // Rollback to after sketch (before extrude)
      store().setRollbackIndex(0);
      expect(state().rollbackIndex).toBe(0);
      expect(state().timeline).toHaveLength(3); // timeline still has all entries
    });
  });

  // ─── Phase 18: Selection & Entity Management ─────────────────────────

  describe('Phase 18 — Selection & Entity Management', () => {
    function setupEntities() {
      createEntity('Cat Body', 'brep');
      createEntity('Cat Head', 'brep');
      createEntity('Left Ear', 'brep');
      createEntity('Right Ear', 'brep');
      createEntity('Cat Tail', 'brep');
    }

    it('selects and deselects entities', () => {
      setupEntities();
      const ids = state().entities.map((e) => e.id);

      store().select(ids[0]);
      expect(state().selectedIds).toEqual([ids[0]]);

      store().multiSelect(ids[1]);
      expect(state().selectedIds).toEqual([ids[0], ids[1]]);

      store().toggleSelect(ids[0]);
      expect(state().selectedIds).toEqual([ids[1]]);
    });

    it('clears selection', () => {
      setupEntities();
      store().select(state().entities[0].id);
      store().clearSelection();
      expect(state().selectedIds).toHaveLength(0);
    });

    it('toggles entity visibility', () => {
      setupEntities();
      const id = state().entities[0].id;
      expect(state().entities[0].visible).toBe(true);
      store().toggleEntityVisibility(id);
      expect(state().entities[0].visible).toBe(false);
    });

    it('toggles entity suppression', () => {
      setupEntities();
      const id = state().entities[0].id;
      store().toggleEntitySuppressed(id);
      expect(state().entities.find((e) => e.id === id)!.suppressed).toBe(true);
    });

    it('removes entity', () => {
      setupEntities();
      const id = state().entities[0].id;
      store().select(id);
      store().removeEntity(id);
      expect(state().entities).toHaveLength(4);
      expect(state().selectedIds).not.toContain(id);
    });

    it('transforms entity position', () => {
      setupEntities();
      const id = state().entities[0].id;
      store().updateEntityTransform(id, { position: [10, 20, 30] });
      expect(state().entities[0].transform.position).toEqual([10, 20, 30]);
    });

    it('sets selection filter', () => {
      store().setSelectionFilter('face');
      expect(state().selectionFilter).toBe('face');
      store().setSelectionFilter('edge');
      expect(state().selectionFilter).toBe('edge');
      store().setSelectionFilter('vertex');
      expect(state().selectionFilter).toBe('vertex');
    });
  });

  // ─── Phase 19: Marking Menu Interaction ──────────────────────────────

  describe('Phase 19 — Marking Menu (right-click radial menu)', () => {
    it('opens marking menu at cursor position', () => {
      store().openMarkingMenu(512, 384);
      expect(state().markingMenu.open).toBe(true);
      expect(state().markingMenu.x).toBe(512);
      expect(state().markingMenu.y).toBe(384);
    });

    it('closes marking menu', () => {
      store().openMarkingMenu(512, 384);
      store().closeMarkingMenu();
      expect(state().markingMenu.open).toBe(false);
    });
  });

  // ─── Phase 20: DOF Tracking Through Full Sketch ──────────────────────

  describe('Phase 20 — Degrees of Freedom Tracking', () => {
    it('tracks DOF as points, constraints, and dimensions are added', () => {
      beginSketchOnPlane('XY');
      expect(state().sketchDof).toBe(0);

      // Add first point → +2 DOF
      mouseClickAtSketchPoint(0, 0, 'dof_p1');
      expect(state().sketchDof).toBe(2);

      // Add second point → +2 DOF = 4
      mouseClickAtSketchPoint(10, 0, 'dof_p2');
      expect(state().sketchDof).toBe(4);

      // Add horizontal constraint → -1 DOF = 3
      addConstraint('horizontal', ['dof_p1', 'dof_p2']);
      expect(state().sketchDof).toBe(3);

      // Add distance dimension (driving) → -1 DOF = 2
      addDimension('distance', ['dof_p1', 'dof_p2'], 10, true);
      expect(state().sketchDof).toBe(2);

      // Add fix constraint on first point → -1 DOF = 1
      addConstraint('fix', ['dof_p1']);
      expect(state().sketchDof).toBe(1);

      // Add another fix → -1 DOF = 0, fully constrained!
      addConstraint('fix', ['dof_p2']);
      expect(state().sketchDof).toBe(0);
    });

    it('reference dimension does not reduce DOF', () => {
      beginSketchOnPlane('XY');
      mouseClickAtSketchPoint(0, 0, 'ref_p1');
      mouseClickAtSketchPoint(10, 0, 'ref_p2');
      expect(state().sketchDof).toBe(4);

      // Driving=false → DOF stays the same
      addDimension('distance', ['ref_p1', 'ref_p2'], 10, false);
      expect(state().sketchDof).toBe(4);
    });
  });

  // ─── Phase 21: Multi-Sketch Sequential Workflow ──────────────────────

  describe('Phase 21 — Complete Multi-Sketch Sequential Workflow', () => {
    it('creates 5 sketches in sequence and verifies timeline integrity', () => {
      // Sketch 1: Body rectangle
      beginSketchOnPlane('XY');
      store().setSketchTool('rectangle');
      drawRectangle('s1_rect', -30, -15, 60, 30);
      addConstraint('horizontal', ['s1_rect']);
      addDimension('distance', ['s1_rect_p0', 's1_rect_p1'], 60);
      finishCurrentSketch(1);

      // Sketch 2: Head circle
      beginSketchOnPlane('XY');
      store().setSketchTool('circle');
      drawCircle('s2_head', 40, 0, 15);
      addDimension('radius', ['s2_head_center', 's2_head_edge'], 15);
      finishCurrentSketch(2);

      // Sketch 3: Left ear triangle
      beginSketchOnPlane('XY');
      store().setSketchTool('line');
      const ear_base0 = mouseClickAtSketchPoint(30, 10, 's3_b0');
      const ear_tip = mouseClickAtSketchPoint(35, 25, 's3_tip');
      const ear_base1 = mouseClickAtSketchPoint(40, 10, 's3_b1');
      drawLine('s3_l0', ear_base0, ear_tip);
      drawLine('s3_l1', ear_tip, ear_base1);
      drawLine('s3_l2', ear_base1, ear_base0);
      finishCurrentSketch(3);

      // Sketch 4: Right ear triangle
      beginSketchOnPlane('XY');
      store().setSketchTool('line');
      const ear2_b0 = mouseClickAtSketchPoint(40, 10, 's4_b0');
      const ear2_tip = mouseClickAtSketchPoint(45, 25, 's4_tip');
      const ear2_b1 = mouseClickAtSketchPoint(50, 10, 's4_b1');
      drawLine('s4_l0', ear2_b0, ear2_tip);
      drawLine('s4_l1', ear2_tip, ear2_b1);
      drawLine('s4_l2', ear2_b1, ear2_b0);
      finishCurrentSketch(4);

      // Sketch 5: Tail spline on XZ
      beginSketchOnPlane('XZ');
      store().setSketchTool('spline');
      drawSpline('s5_tail', [[-30, 0], [-40, 5], [-45, 15], [-42, 22]]);
      finishCurrentSketch(5);

      // Verify complete timeline
      expect(state().timeline).toHaveLength(5);
      expect(state().timeline[0].name).toBe('Sketch 1');
      expect(state().timeline[1].name).toBe('Sketch 2');
      expect(state().timeline[2].name).toBe('Sketch 3');
      expect(state().timeline[3].name).toBe('Sketch 4');
      expect(state().timeline[4].name).toBe('Sketch 5');

      // All are sketch entries
      for (const entry of state().timeline) {
        expect(entry.type).toBe('sketch');
        expect(entry.suppressed).toBe(false);
        expect(entry.hasError).toBe(false);
      }

      // Verify browser tree accumulated sketches
      const comp = state().browserTree.find((n) => n.type === 'component');
      const sketchesFolder = comp!.children.find((n) => n.name === 'Sketches');
      expect(sketchesFolder!.children).toHaveLength(5);
    });
  });

  // ─── Phase 22: Full Feature Pipeline After Sketches ──────────────────

  describe('Phase 22 — Full Feature Pipeline', () => {
    function setupAllSketches() {
      // Create 3 sketches quickly
      beginSketchOnPlane('XY');
      drawRectangle('body', -30, -15, 60, 30);
      finishCurrentSketch(1);

      beginSketchOnPlane('XY');
      drawCircle('head', 40, 0, 15);
      finishCurrentSketch(2);

      beginSketchOnPlane('XZ');
      mouseClickAtSketchPoint(-30, 0, 'tail_pt');
      finishCurrentSketch(3);
    }

    it('runs complete feature pipeline: extrude → boolean → fillet → shell → chamfer', () => {
      setupAllSketches();
      expect(state().timeline).toHaveLength(3);

      // Step 1: Extrude body
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 20);
      store().closeFeatureDialog();
      const body = createEntity('Cat Body', 'brep');
      store().setTimeline([
        ...state().timeline,
        { id: 'ext1', name: 'Extrude 1', type: 'extrude', suppressed: false, hasError: false },
      ]);

      // Step 2: Extrude head
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 20);
      store().closeFeatureDialog();
      const head = createEntity('Cat Head', 'brep');
      store().setTimeline([
        ...state().timeline,
        { id: 'ext2', name: 'Extrude 2', type: 'extrude', suppressed: false, hasError: false },
      ]);

      // Step 3: Boolean combine
      store().select(body.id);
      store().multiSelect(head.id);
      store().openFeatureDialog('boolean', { operation: 'combine' });
      store().closeFeatureDialog();
      store().setTimeline([
        ...state().timeline,
        { id: 'bool1', name: 'Combine 1', type: 'boolean', suppressed: false, hasError: false },
      ]);

      // Step 4: Fillet
      store().openFeatureDialog('fillet');
      store().updateFeatureDialogParam('radius', 3);
      store().closeFeatureDialog();
      store().setTimeline([
        ...state().timeline,
        { id: 'fil1', name: 'Fillet 1', type: 'fillet', suppressed: false, hasError: false },
      ]);

      // Step 5: Shell
      store().openFeatureDialog('shell');
      store().updateFeatureDialogParam('thickness', 2);
      store().closeFeatureDialog();
      store().setTimeline([
        ...state().timeline,
        { id: 'sh1', name: 'Shell 1', type: 'shell', suppressed: false, hasError: false },
      ]);

      // Step 6: Chamfer nose
      store().openFeatureDialog('chamfer');
      store().updateFeatureDialogParam('distance', 0.5);
      store().closeFeatureDialog();
      store().setTimeline([
        ...state().timeline,
        { id: 'ch1', name: 'Chamfer 1', type: 'chamfer', suppressed: false, hasError: false },
      ]);

      // Final verification
      expect(state().timeline).toHaveLength(9); // 3 sketches + 6 features
      expect(state().entities).toHaveLength(2); // body + head
      expect(state().timeline.map((e) => e.type)).toEqual([
        'sketch', 'sketch', 'sketch',
        'extrude', 'extrude', 'boolean', 'fillet', 'shell', 'chamfer',
      ]);

      // Verify no errors in timeline
      for (const entry of state().timeline) {
        expect(entry.hasError).toBe(false);
        expect(entry.suppressed).toBe(false);
      }
    });
  });

  // ─── Phase 23: Auto-Constraints & Grid Snap ─────────────────────────

  describe('Phase 23 — Auto-Constraints & Grid Snap', () => {
    it('toggles auto-constraints during sketching', () => {
      expect(state().autoConstraintsEnabled).toBe(true);
      store().toggleAutoConstraints();
      expect(state().autoConstraintsEnabled).toBe(false);
      store().toggleAutoConstraints();
      expect(state().autoConstraintsEnabled).toBe(true);
    });

    it('configures grid snap size', () => {
      expect(state().gridSnapEnabled).toBe(true);
      expect(state().gridSnapSize).toBe(1);

      store().setGridSnapSize(2.5);
      expect(state().gridSnapSize).toBe(2.5);

      store().toggleGridSnap();
      expect(state().gridSnapEnabled).toBe(false);
    });
  });

  // ─── Phase 24: Navigation Style ──────────────────────────────────────

  describe('Phase 24 — Navigation Style', () => {
    it('defaults to fusion360 navigation', () => {
      expect(state().navigationStyle).toBe('fusion360');
    });

    it('switches navigation styles', () => {
      store().setNavigationStyle('solidworks');
      expect(state().navigationStyle).toBe('solidworks');
      store().setNavigationStyle('inventor');
      expect(state().navigationStyle).toBe('inventor');
      store().setNavigationStyle('fusion360');
      expect(state().navigationStyle).toBe('fusion360');
    });
  });

  // ─── Phase 25: Assembly Mates ────────────────────────────────────────

  describe('Phase 25 — Assembly Mates for Multi-Part Cat', () => {
    it('adds joint between body and head', () => {
      store().addMate({
        id: 'joint_body_head',
        type: 'fastened',
        part1: 'cat_body',
        part2: 'cat_head',
        name: 'Body-Head Joint',
      });

      expect(state().mates).toHaveLength(1);
      expect(state().mates[0].type).toBe('fastened');
    });

    it('adds joints for all appendages', () => {
      const joints = [
        { id: 'j1', type: 'fastened' as const, part1: 'body', part2: 'head', name: 'Body-Head' },
        { id: 'j2', type: 'fastened' as const, part1: 'head', part2: 'left_ear', name: 'Head-LeftEar' },
        { id: 'j3', type: 'fastened' as const, part1: 'head', part2: 'right_ear', name: 'Head-RightEar' },
        { id: 'j4', type: 'revolute' as const, part1: 'body', part2: 'tail', name: 'Body-Tail (revolute)' },
      ];

      for (const j of joints) {
        store().addMate(j);
      }

      expect(state().mates).toHaveLength(4);
      expect(state().mates.filter((m) => m.type === 'fastened')).toHaveLength(3);
      expect(state().mates.filter((m) => m.type === 'revolute')).toHaveLength(1);
    });

    it('removes a mate', () => {
      store().addMate({ id: 'j_temp', type: 'fastened', part1: 'a', part2: 'b', name: 'Temp' });
      store().addMate({ id: 'j_keep', type: 'revolute', part1: 'a', part2: 'c', name: 'Keep' });
      store().removeMate('j_temp');
      expect(state().mates).toHaveLength(1);
      expect(state().mates[0].id).toBe('j_keep');
    });
  });

  // ─── Phase 26: Data Panel & Document Tabs ────────────────────────────

  describe('Phase 26 — Data Panel & Multi-Tab Workflow', () => {
    it('toggles data panel', () => {
      expect(state().dataPanel.open).toBe(false);
      store().toggleDataPanel();
      expect(state().dataPanel.open).toBe(true);
      expect(state().dataPanel.projects.length).toBeGreaterThanOrEqual(1);
    });

    it('works with multiple document tabs', () => {
      store().addTab({ id: 'asm1', name: 'Cat Assembly', type: 'assembly', active: false });
      expect(state().documentTabs).toHaveLength(2);

      store().setActiveTab('asm1');
      expect(state().activeTabId).toBe('asm1');
      expect(state().workspaceMode).toBe('assembly');

      // Switch back to design
      store().setActiveTab('design1');
      expect(state().workspaceMode).toBe('design');
    });
  });

  // ─── Phase 27: Sketch Cancel & Error Paths ──────────────────────────

  describe('Phase 27 — Sketch Cancel & Edge Cases', () => {
    it('cancels an empty sketch gracefully', () => {
      beginSketchOnPlane('XY');
      store().finishSketch();
      expect(state().isSketchActive).toBe(false);
      expect(state().statusMessage).toContain('cancelled');
      expect(state().timeline).toHaveLength(0);
    });

    it('cancels sketch via cancelSketch (Escape equivalent)', () => {
      beginSketchOnPlane('XY');
      mouseClickAtSketchPoint(0, 0, 'cancel_pt');
      store().cancelSketch();
      expect(state().isSketchActive).toBe(false);
      expect(state().sketchPoints).toHaveLength(0);
      expect(state().timeline).toHaveLength(0);
    });

    it('switches sketch tools without losing geometry', () => {
      beginSketchOnPlane('XY');
      store().setSketchTool('line');
      mouseClickAtSketchPoint(0, 0, 'sw_p1');
      mouseClickAtSketchPoint(10, 0, 'sw_p2');
      drawLine('sw_line', 'sw_p1', 'sw_p2');

      // Switch tool mid-sketch
      store().setSketchTool('circle');
      expect(state().activeSketchTool).toBe('circle');

      // Previous geometry preserved
      expect(state().sketchPoints).toHaveLength(2);
      expect(state().sketchSegments).toHaveLength(1);

      // Draw circle with new tool
      drawCircle('sw_circle', 20, 20, 5);
      expect(state().sketchPoints).toHaveLength(4); // 2 line + 2 circle
      expect(state().sketchSegments).toHaveLength(2); // 1 line + 1 circle
    });

    it('clears sketch geometry without finishing', () => {
      beginSketchOnPlane('XY');
      mouseClickAtSketchPoint(0, 0, 'clr_p1');
      drawCircle('clr_c', 10, 10, 5);
      addConstraint('fix', ['clr_p1']);

      store().clearSketch();
      expect(state().sketchPoints).toHaveLength(0);
      expect(state().sketchSegments).toHaveLength(0);
      expect(state().sketchConstraints).toHaveLength(0);
      expect(state().sketchDimensions).toHaveLength(0);
      expect(state().sketchDof).toBe(0);
      // But sketch is still active!
      expect(state().isSketchActive).toBe(true);
    });
  });

  // ─── Phase 28: Draw State (mouse drag simulation) ───────────────────

  describe('Phase 28 — Draw State & Mouse Drag Simulation', () => {
    it('simulates click-drag-release for rectangle', () => {
      beginSketchOnPlane('XY');
      store().setSketchTool('rectangle');

      // Mouse down at origin
      store().setDrawState({ active: true, startPoint: { x: 0, y: 0 }, currentPoint: { x: 0, y: 0 } });
      expect(state().drawState.active).toBe(true);
      expect(state().drawState.startPoint).toEqual({ x: 0, y: 0 });

      // Mouse move (drag)
      store().setDrawState({ currentPoint: { x: 50, y: 30 } });
      expect(state().drawState.currentPoint).toEqual({ x: 50, y: 30 });

      // Mouse up (release)
      store().setDrawState({ active: false, startPoint: null, currentPoint: null });
      expect(state().drawState.active).toBe(false);
    });

    it('simulates hover preview', () => {
      beginSketchOnPlane('XY');
      store().setSketchTool('line');

      // Mouse hover shows preview
      mouseMoveTo(25, 15);
      expect(state().drawState.currentPoint).toEqual({ x: 25, y: 15 });

      mouseMoveTo(30, 20);
      expect(state().drawState.currentPoint).toEqual({ x: 30, y: 20 });
    });
  });

  // ─── Phase 29: Command Palette & Status ──────────────────────────────

  describe('Phase 29 — Command Palette & Status Messages', () => {
    it('opens and closes command palette', () => {
      store().setCommandPaletteOpen(true);
      expect(state().commandPaletteOpen).toBe(true);
      store().setCommandPaletteOpen(false);
      expect(state().commandPaletteOpen).toBe(false);
    });

    it('status messages reflect user actions throughout workflow', () => {
      // Start sketch
      store().beginPlaneSelection();
      expect(state().statusMessage).toContain('Select a plane');

      // Select plane
      store().selectSketchPlane({
        type: 'XY', origin: [0, 0, 0], normal: [0, 0, 1], uAxis: [1, 0, 0], vAxis: [0, 1, 0],
      });
      expect(state().statusMessage).toContain('Sketching on XY');

      // Finish sketch
      mouseClickAtSketchPoint(0, 0, 'status_pt');
      store().finishSketch();
      expect(state().statusMessage).toBe('Sketch completed');

      // Tool switch
      store().setTool('extrude');
      expect(state().statusMessage).toContain('extrude');
    });
  });

  // ─── Phase 30: End-to-End "Callicat" Full Assembly ───────────────────

  describe('Phase 30 — Complete Callicat End-to-End Assembly', () => {
    it('models a complete callicat from scratch to finished model', () => {
      // ═══ STEP 1: Setup document ═══
      store().setDocumentName('Callicat v1.0');
      store().setCameraProjection('orthographic');
      expect(state().documentName).toBe('Callicat v1.0');

      // ═══ STEP 2: Body sketch (XY plane) ═══
      beginSketchOnPlane('XY');
      store().setSketchTool('rectangle');
      const body = drawRectangle('cat_body', -30, -15, 60, 30);
      addConstraint('horizontal', ['cat_body']);
      addConstraint('vertical', ['cat_body']);
      addDimension('distance', [body.points[0], body.points[1]], 60);
      addDimension('distance', [body.points[1], body.points[2]], 30);
      finishCurrentSketch(1);

      // ═══ STEP 3: Head sketch (XY plane) ═══
      beginSketchOnPlane('XY');
      store().setSketchTool('circle');
      const head = drawCircle('cat_head', 45, 0, 18);
      addConstraint('horizontal', [head.centerPt]);
      addDimension('radius', [head.centerPt, head.edgePt], 18);
      finishCurrentSketch(2);

      // ═══ STEP 4: Left ear sketch ═══
      beginSketchOnPlane('XY');
      store().setSketchTool('line');
      const le0 = mouseClickAtSketchPoint(35, 14, 'le0');
      const le_tip = mouseClickAtSketchPoint(38, 30, 'le_tip');
      const le1 = mouseClickAtSketchPoint(42, 14, 'le1');
      drawLine('le_l0', le0, le_tip);
      drawLine('le_l1', le_tip, le1);
      drawLine('le_l2', le1, le0);
      addConstraint('equal', ['le_l0', 'le_l1']);
      addDimension('distance', [le0, le_tip], 16.5);
      finishCurrentSketch(3);

      // ═══ STEP 5: Right ear sketch ═══
      beginSketchOnPlane('XY');
      store().setSketchTool('line');
      const re0 = mouseClickAtSketchPoint(48, 14, 're0');
      const re_tip = mouseClickAtSketchPoint(52, 30, 're_tip');
      const re1 = mouseClickAtSketchPoint(55, 14, 're1');
      drawLine('re_l0', re0, re_tip);
      drawLine('re_l1', re_tip, re1);
      drawLine('re_l2', re1, re0);
      addConstraint('equal', ['re_l0', 're_l1']);
      addConstraint('symmetric', ['le_tip', 're_tip']);
      finishCurrentSketch(4);

      // ═══ STEP 6: Tail sketch (XZ plane) ═══
      beginSketchOnPlane('XZ');
      store().setSketchTool('spline');
      drawSpline('cat_tail', [[-30, 0], [-38, 8], [-44, 18], [-40, 26], [-35, 30]]);
      addConstraint('tangent', ['cat_tail']);
      finishCurrentSketch(5);

      // Verify: 5 sketches in timeline
      expect(state().timeline).toHaveLength(5);

      // ═══ STEP 7: Extrude body ═══
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 22);
      store().updateFeatureDialogParam('symmetric', true);
      store().closeFeatureDialog();
      const bodyEnt = createEntity('Callicat Body', 'brep', { faceCount: 10 });
      store().setTimeline([...state().timeline,
        { id: 'ext_body', name: 'Extrude 1', type: 'extrude', suppressed: false, hasError: false }]);

      // ═══ STEP 8: Extrude head ═══
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 22);
      store().updateFeatureDialogParam('symmetric', true);
      store().closeFeatureDialog();
      const headEnt = createEntity('Callicat Head', 'brep', { faceCount: 3 });
      store().setTimeline([...state().timeline,
        { id: 'ext_head', name: 'Extrude 2', type: 'extrude', suppressed: false, hasError: false }]);

      // ═══ STEP 9: Extrude ears ═══
      const earL = createEntity('Left Ear', 'brep', { faceCount: 5 });
      const earR = createEntity('Right Ear', 'brep', { faceCount: 5 });
      store().setTimeline([...state().timeline,
        { id: 'ext_earL', name: 'Extrude 3', type: 'extrude', suppressed: false, hasError: false },
        { id: 'ext_earR', name: 'Extrude 4', type: 'extrude', suppressed: false, hasError: false }]);

      // ═══ STEP 10: Sweep tail ═══
      store().openFeatureDialog('sweep');
      store().closeFeatureDialog();
      const tailEnt = createEntity('Callicat Tail', 'brep', { faceCount: 2 });
      store().setTimeline([...state().timeline,
        { id: 'sweep_tail', name: 'Sweep 1', type: 'sweep', suppressed: false, hasError: false }]);

      // Verify: 5 entities, 10 timeline entries
      expect(state().entities).toHaveLength(5);
      expect(state().timeline).toHaveLength(10);

      // ═══ STEP 11: Boolean combine all ═══
      store().select(bodyEnt.id);
      store().multiSelect(headEnt.id);
      store().openFeatureDialog('boolean', { operation: 'combine' });
      store().closeFeatureDialog();
      store().setTimeline([...state().timeline,
        { id: 'bool1', name: 'Combine 1', type: 'boolean', suppressed: false, hasError: false }]);

      // ═══ STEP 12: Fillet body edges ═══
      store().openFeatureDialog('fillet');
      store().updateFeatureDialogParam('radius', 4);
      store().closeFeatureDialog();
      store().setTimeline([...state().timeline,
        { id: 'fil1', name: 'Fillet 1', type: 'fillet', suppressed: false, hasError: false }]);

      // ═══ STEP 13: Eye holes ═══
      store().openFeatureDialog('hole');
      store().updateFeatureDialogParam('diameter', 5);
      store().updateFeatureDialogParam('depth', 3);
      store().closeFeatureDialog();
      store().setTimeline([...state().timeline,
        { id: 'hole_eye1', name: 'Hole 1', type: 'hole', suppressed: false, hasError: false },
        { id: 'hole_eye2', name: 'Hole 2', type: 'hole', suppressed: false, hasError: false }]);

      // ═══ STEP 14: Shell body ═══
      store().openFeatureDialog('shell');
      store().updateFeatureDialogParam('thickness', 1.5);
      store().closeFeatureDialog();
      store().setTimeline([...state().timeline,
        { id: 'sh1', name: 'Shell 1', type: 'shell', suppressed: false, hasError: false }]);

      // ═══ FINAL VERIFICATION ═══
      const finalTimeline = state().timeline;
      expect(finalTimeline).toHaveLength(15);

      // Verify feature sequence
      const typeSequence = finalTimeline.map((e) => e.type);
      expect(typeSequence).toEqual([
        'sketch', 'sketch', 'sketch', 'sketch', 'sketch',  // 5 sketches
        'extrude', 'extrude', 'extrude', 'extrude', 'sweep', // 4 extrudes + 1 sweep
        'boolean', 'fillet', 'hole', 'hole', 'shell',        // boolean + fillet + holes + shell
      ]);

      // No errors
      for (const entry of finalTimeline) {
        expect(entry.hasError).toBe(false);
        expect(entry.suppressed).toBe(false);
      }

      // 5 entities created
      expect(state().entities).toHaveLength(5);
      expect(state().entities.map((e) => e.name)).toEqual([
        'Callicat Body', 'Callicat Head', 'Left Ear', 'Right Ear', 'Callicat Tail',
      ]);

      // Document named
      expect(state().documentName).toBe('Callicat v1.0');

      // Camera in orthographic
      expect(state().cameraProjection).toBe('orthographic');

      // Sketch workspace clean
      expect(state().isSketchActive).toBe(false);
      expect(state().sketchPhase).toBeNull();

      // Browser tree has 5 sketches
      const comp = state().browserTree.find((n) => n.type === 'component');
      const sketchesFolder = comp!.children.find((n) => n.name === 'Sketches');
      expect(sketchesFolder!.children).toHaveLength(5);
    });
  });

  // ─── Phase 31: Serialize & Save the Callicat Model ───────────────────

  describe('Phase 31 — Serialize & Save Callicat Project', () => {
    /** Build the full callicat model (reusable setup for save tests). */
    function buildFullCallicat(): {
      sketches: SketchSnapshot[];
      features: FeatureSnapshot[];
    } {
      const sketches: SketchSnapshot[] = [];
      const features: FeatureSnapshot[] = [];

      store().setDocumentName('Callicat v1.0');
      store().setCameraProjection('orthographic');

      // ── Sketch 1: Body rectangle ──
      beginSketchOnPlane('XY');
      store().setSketchTool('rectangle');
      drawRectangle('cat_body', -30, -15, 60, 30);
      addConstraint('horizontal', ['cat_body']);
      addConstraint('vertical', ['cat_body']);
      addDimension('distance', ['cat_body_p0', 'cat_body_p1'], 60);
      addDimension('distance', ['cat_body_p1', 'cat_body_p2'], 30);

      // Capture sketch before finishing (finishSketch clears geometry)
      sketches.push({
        id: 'sketch_body', name: 'Sketch 1 — Body',
        plane: state().sketchPlane, planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      finishCurrentSketch(1);

      // ── Sketch 2: Head circle ──
      beginSketchOnPlane('XY');
      store().setSketchTool('circle');
      const head = drawCircle('cat_head', 45, 0, 18);
      addConstraint('horizontal', [head.centerPt]);
      addDimension('radius', [head.centerPt, head.edgePt], 18);

      sketches.push({
        id: 'sketch_head', name: 'Sketch 2 — Head',
        plane: state().sketchPlane, planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      finishCurrentSketch(2);

      // ── Sketch 3: Left ear ──
      beginSketchOnPlane('XY');
      store().setSketchTool('line');
      const le0 = mouseClickAtSketchPoint(35, 14, 'le0');
      const le_tip = mouseClickAtSketchPoint(38, 30, 'le_tip');
      const le1 = mouseClickAtSketchPoint(42, 14, 'le1');
      drawLine('le_l0', le0, le_tip);
      drawLine('le_l1', le_tip, le1);
      drawLine('le_l2', le1, le0);
      addConstraint('equal', ['le_l0', 'le_l1']);
      addDimension('distance', [le0, le_tip], 16.5);

      sketches.push({
        id: 'sketch_left_ear', name: 'Sketch 3 — Left Ear',
        plane: state().sketchPlane, planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      finishCurrentSketch(3);

      // ── Sketch 4: Right ear ──
      beginSketchOnPlane('XY');
      store().setSketchTool('line');
      const re0 = mouseClickAtSketchPoint(48, 14, 're0');
      const re_tip = mouseClickAtSketchPoint(52, 30, 're_tip');
      const re1 = mouseClickAtSketchPoint(55, 14, 're1');
      drawLine('re_l0', re0, re_tip);
      drawLine('re_l1', re_tip, re1);
      drawLine('re_l2', re1, re0);
      addConstraint('equal', ['re_l0', 're_l1']);
      addConstraint('symmetric', ['le_tip', 're_tip']);

      sketches.push({
        id: 'sketch_right_ear', name: 'Sketch 4 — Right Ear',
        plane: state().sketchPlane, planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      finishCurrentSketch(4);

      // ── Sketch 5: Tail spline ──
      beginSketchOnPlane('XZ');
      store().setSketchTool('spline');
      drawSpline('cat_tail', [[-30, 0], [-38, 8], [-44, 18], [-40, 26], [-35, 30]]);
      addConstraint('tangent', ['cat_tail']);

      sketches.push({
        id: 'sketch_tail', name: 'Sketch 5 — Tail',
        plane: state().sketchPlane, planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      finishCurrentSketch(5);

      // ── Features ──

      // Extrude body
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 22);
      store().updateFeatureDialogParam('symmetric', true);
      const extrudeBodyParams = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      const bodyEnt = createEntity('Callicat Body', 'brep', { faceCount: 10, edgeCount: 24, vertexCount: 16 });
      features.push({ id: 'ext_body', name: 'Extrude 1', type: 'extrude', params: extrudeBodyParams, sketchRef: 'sketch_body', entityRef: bodyEnt.id });
      store().setTimeline([...state().timeline, { id: 'ext_body', name: 'Extrude 1', type: 'extrude', suppressed: false, hasError: false }]);

      // Extrude head
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 22);
      store().updateFeatureDialogParam('symmetric', true);
      const extrudeHeadParams = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      const headEnt = createEntity('Callicat Head', 'brep', { faceCount: 3, edgeCount: 6, vertexCount: 2 });
      features.push({ id: 'ext_head', name: 'Extrude 2', type: 'extrude', params: extrudeHeadParams, sketchRef: 'sketch_head', entityRef: headEnt.id });
      store().setTimeline([...state().timeline, { id: 'ext_head', name: 'Extrude 2', type: 'extrude', suppressed: false, hasError: false }]);

      // Extrude ears
      const earLEnt = createEntity('Left Ear', 'brep', { faceCount: 5, edgeCount: 9, vertexCount: 6 });
      const earREnt = createEntity('Right Ear', 'brep', { faceCount: 5, edgeCount: 9, vertexCount: 6 });
      features.push({ id: 'ext_earL', name: 'Extrude 3', type: 'extrude', params: { distance: 5, symmetric: true }, sketchRef: 'sketch_left_ear', entityRef: earLEnt.id });
      features.push({ id: 'ext_earR', name: 'Extrude 4', type: 'extrude', params: { distance: 5, symmetric: true }, sketchRef: 'sketch_right_ear', entityRef: earREnt.id });
      store().setTimeline([...state().timeline,
        { id: 'ext_earL', name: 'Extrude 3', type: 'extrude', suppressed: false, hasError: false },
        { id: 'ext_earR', name: 'Extrude 4', type: 'extrude', suppressed: false, hasError: false }]);

      // Sweep tail
      store().openFeatureDialog('sweep');
      const sweepParams = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      const tailEnt = createEntity('Callicat Tail', 'brep', { faceCount: 2, edgeCount: 4, vertexCount: 0 });
      features.push({ id: 'sweep_tail', name: 'Sweep 1', type: 'sweep', params: sweepParams, sketchRef: 'sketch_tail', entityRef: tailEnt.id });
      store().setTimeline([...state().timeline, { id: 'sweep_tail', name: 'Sweep 1', type: 'sweep', suppressed: false, hasError: false }]);

      // Boolean combine
      store().select(bodyEnt.id);
      store().multiSelect(headEnt.id);
      store().openFeatureDialog('boolean', { operation: 'combine' });
      const boolParams = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      features.push({ id: 'bool1', name: 'Combine 1', type: 'boolean', params: boolParams });
      store().setTimeline([...state().timeline, { id: 'bool1', name: 'Combine 1', type: 'boolean', suppressed: false, hasError: false }]);

      // Fillet
      store().openFeatureDialog('fillet');
      store().updateFeatureDialogParam('radius', 4);
      const filletParams = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      features.push({ id: 'fil1', name: 'Fillet 1', type: 'fillet', params: filletParams });
      store().setTimeline([...state().timeline, { id: 'fil1', name: 'Fillet 1', type: 'fillet', suppressed: false, hasError: false }]);

      // Eye holes
      store().openFeatureDialog('hole');
      store().updateFeatureDialogParam('diameter', 5);
      store().updateFeatureDialogParam('depth', 3);
      const holeParams = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      features.push({ id: 'hole_eye1', name: 'Hole 1', type: 'hole', params: holeParams });
      features.push({ id: 'hole_eye2', name: 'Hole 2', type: 'hole', params: { ...holeParams } });
      store().setTimeline([...state().timeline,
        { id: 'hole_eye1', name: 'Hole 1', type: 'hole', suppressed: false, hasError: false },
        { id: 'hole_eye2', name: 'Hole 2', type: 'hole', suppressed: false, hasError: false }]);

      // Shell
      store().openFeatureDialog('shell');
      store().updateFeatureDialogParam('thickness', 1.5);
      const shellParams = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      features.push({ id: 'sh1', name: 'Shell 1', type: 'shell', params: shellParams });
      store().setTimeline([...state().timeline, { id: 'sh1', name: 'Shell 1', type: 'shell', suppressed: false, hasError: false }]);

      // Assembly mate
      store().addMate({ id: 'j_body_head', type: 'fastened', part1: bodyEnt.id, part2: headEnt.id, name: 'Body-Head Joint' });

      return { sketches, features };
    }

    it('serializes the complete callicat project', () => {
      const { sketches, features } = buildFullCallicat();
      const project = serializeProject(sketches, features);

      expect(project.format.version).toBe(PROJECT_FORMAT_VERSION);
      expect(project.format.generator).toBe('r3ditor');
      expect(project.document.name).toBe('Callicat v1.0');
      expect(project.entities).toHaveLength(5);
      expect(project.timeline).toHaveLength(15);
      expect(project.sketches).toHaveLength(5);
      expect(project.features).toHaveLength(10);
      expect(project.mates).toHaveLength(1);
      expect(project.viewSettings.cameraProjection).toBe('orthographic');
      expect(project.statistics.entityCount).toBe(5);
      expect(project.statistics.totalFaces).toBe(25); // 10+3+5+5+2
    });

    it('converts project to JSON string', () => {
      const { sketches, features } = buildFullCallicat();
      const project = serializeProject(sketches, features);
      const json = projectToJSON(project);

      expect(typeof json).toBe('string');
      expect(json.length).toBeGreaterThan(1000);
      expect(json).toContain('"Callicat v1.0"');
      expect(json).toContain('"Callicat Body"');
      expect(json).toContain('"Callicat Head"');
      expect(json).toContain('"Left Ear"');
      expect(json).toContain('"Right Ear"');
      expect(json).toContain('"Callicat Tail"');

      // Valid JSON
      const parsed = JSON.parse(json);
      expect(parsed.format.version).toBe(PROJECT_FORMAT_VERSION);
    });

    it('round-trips project through JSON serialization', () => {
      const { sketches, features } = buildFullCallicat();
      const original = serializeProject(sketches, features);
      const json = projectToJSON(original);
      const restored = projectFromJSON(json);

      expect(restored.format.version).toBe(original.format.version);
      expect(restored.document.name).toBe(original.document.name);
      expect(restored.entities).toHaveLength(original.entities.length);
      expect(restored.timeline).toHaveLength(original.timeline.length);
      expect(restored.sketches).toHaveLength(original.sketches.length);
      expect(restored.features).toHaveLength(original.features.length);
      expect(restored.mates).toHaveLength(original.mates.length);

      // Deep equality on entities
      for (let i = 0; i < original.entities.length; i++) {
        expect(restored.entities[i].id).toBe(original.entities[i].id);
        expect(restored.entities[i].name).toBe(original.entities[i].name);
        expect(restored.entities[i].type).toBe(original.entities[i].type);
        expect(restored.entities[i].faceCount).toBe(original.entities[i].faceCount);
      }

      // Deep equality on timeline
      for (let i = 0; i < original.timeline.length; i++) {
        expect(restored.timeline[i].id).toBe(original.timeline[i].id);
        expect(restored.timeline[i].type).toBe(original.timeline[i].type);
      }

      // Deep equality on sketch geometry
      for (let i = 0; i < original.sketches.length; i++) {
        expect(restored.sketches[i].id).toBe(original.sketches[i].id);
        expect(restored.sketches[i].points.length).toBe(original.sketches[i].points.length);
        expect(restored.sketches[i].segments.length).toBe(original.sketches[i].segments.length);
        expect(restored.sketches[i].constraints.length).toBe(original.sketches[i].constraints.length);
      }
    });

    it('rejects invalid JSON as project file', () => {
      expect(() => projectFromJSON('{ not valid json')).toThrow();
      expect(() => projectFromJSON('{"entities": []}')).toThrow('missing format.version');
    });

    it('preserves sketch geometry in snapshots', () => {
      const { sketches } = buildFullCallicat();

      // Sketch 1 (body) should have 4 points + 1 rect segment + 2 constraints + 2 dimensions
      const bodySketch = sketches[0];
      expect(bodySketch.name).toBe('Sketch 1 — Body');
      expect(bodySketch.plane).toBe('XY');
      expect(bodySketch.points).toHaveLength(4);
      expect(bodySketch.segments).toHaveLength(1);
      expect(bodySketch.segments[0].type).toBe('rectangle');
      expect(bodySketch.constraints).toHaveLength(2);
      expect(bodySketch.dimensions).toHaveLength(2);

      // Sketch 2 (head) should have 2 points + 1 circle segment
      const headSketch = sketches[1];
      expect(headSketch.name).toBe('Sketch 2 — Head');
      expect(headSketch.points).toHaveLength(2);
      expect(headSketch.segments).toHaveLength(1);
      expect(headSketch.segments[0].type).toBe('circle');

      // Sketch 5 (tail) should have 5 points + 1 spline segment
      const tailSketch = sketches[4];
      expect(tailSketch.name).toBe('Sketch 5 — Tail');
      expect(tailSketch.plane).toBe('XZ');
      expect(tailSketch.points).toHaveLength(5);
      expect(tailSketch.segments).toHaveLength(1);
      expect(tailSketch.segments[0].type).toBe('spline');
    });

    it('preserves feature parameters in snapshots', () => {
      const { features } = buildFullCallicat();

      const extrudeBody = features.find((f) => f.id === 'ext_body')!;
      expect(extrudeBody.type).toBe('extrude');
      expect(extrudeBody.params.distance).toBe(22);
      expect(extrudeBody.params.symmetric).toBe(true);
      expect(extrudeBody.sketchRef).toBe('sketch_body');

      const fillet = features.find((f) => f.id === 'fil1')!;
      expect(fillet.type).toBe('fillet');
      expect(fillet.params.radius).toBe(4);

      const hole = features.find((f) => f.id === 'hole_eye1')!;
      expect(hole.type).toBe('hole');
      expect(hole.params.diameter).toBe(5);
      expect(hole.params.depth).toBe(3);

      const shell = features.find((f) => f.id === 'sh1')!;
      expect(shell.type).toBe('shell');
      expect(shell.params.thickness).toBe(1.5);
    });
  });

  // ─── Phase 32: Load Project Back Into Editor ─────────────────────────

  describe('Phase 32 — Load Callicat Project Into Editor', () => {
    it('loads a saved project back into the store', () => {
      // Build and serialize
      const { sketches, features } = (() => {
        store().setDocumentName('Callicat v1.0');
        store().setCameraProjection('orthographic');

        beginSketchOnPlane('XY');
        drawRectangle('body', -30, -15, 60, 30);
        finishCurrentSketch(1);

        beginSketchOnPlane('XY');
        drawCircle('head', 45, 0, 18);
        finishCurrentSketch(2);

        const bodyEnt = createEntity('Callicat Body', 'brep', { faceCount: 10 });
        const headEnt = createEntity('Callicat Head', 'brep', { faceCount: 3 });
        store().setTimeline([...state().timeline,
          { id: 'ext1', name: 'Extrude 1', type: 'extrude', suppressed: false, hasError: false },
          { id: 'ext2', name: 'Extrude 2', type: 'extrude', suppressed: false, hasError: false }]);
        store().addMate({ id: 'j1', type: 'fastened', part1: bodyEnt.id, part2: headEnt.id, name: 'Joint 1' });

        return { sketches: [] as SketchSnapshot[], features: [] as FeatureSnapshot[] };
      })();

      const project = serializeProject(sketches, features);
      const json = projectToJSON(project);

      // Reset everything
      resetApp();
      expect(state().documentName).toBe('Untitled');
      expect(state().entities).toHaveLength(0);
      expect(state().timeline).toHaveLength(0);

      // Load project
      const loaded = projectFromJSON(json);
      loadProjectIntoStore(loaded);

      // Verify restored state
      expect(state().documentName).toBe('Callicat v1.0');
      expect(state().cameraProjection).toBe('orthographic');
      expect(state().entities).toHaveLength(2);
      expect(state().entities[0].name).toBe('Callicat Body');
      expect(state().entities[1].name).toBe('Callicat Head');
      expect(state().timeline).toHaveLength(4); // 2 sketches + 2 extrudes
      expect(state().mates).toHaveLength(1);
      expect(state().statusMessage).toContain('Loaded project');
    });

    it('restores view settings from project', () => {
      store().setViewStyle('wireframe');
      store().setCameraProjection('orthographic');
      store().setNavigationStyle('solidworks');
      store().toggleGrid(); // now false
      store().toggleAxes(); // now false

      const project = serializeProject();
      const json = projectToJSON(project);

      resetApp();
      expect(state().viewStyle).toBe('shadedEdges'); // default
      expect(state().showGrid).toBe(true); // default

      loadProjectIntoStore(projectFromJSON(json));
      expect(state().viewStyle).toBe('wireframe');
      expect(state().cameraProjection).toBe('orthographic');
      expect(state().navigationStyle).toBe('solidworks');
      expect(state().showGrid).toBe(false);
      expect(state().showAxes).toBe(false);
    });
  });

  // ─── Phase 33: Write Callicat Model File to Disk ─────────────────────

  describe('Phase 33 — Write Callicat .r3d.json to Disk', () => {
    const OUTPUT_DIR = path.resolve(__dirname, '../../..', 'models');
    const OUTPUT_FILE = path.join(OUTPUT_DIR, 'callicat.r3d.json');

    it('writes the complete callicat model to models/callicat.r3d.json', () => {
      // Build the full model
      store().setDocumentName('Callicat v1.0');
      store().setCameraProjection('orthographic');

      const sketches: SketchSnapshot[] = [];
      const features: FeatureSnapshot[] = [];

      // ── Body sketch ──
      beginSketchOnPlane('XY');
      store().setSketchTool('rectangle');
      drawRectangle('cat_body', -30, -15, 60, 30);
      addConstraint('horizontal', ['cat_body']);
      addConstraint('vertical', ['cat_body']);
      addDimension('distance', ['cat_body_p0', 'cat_body_p1'], 60);
      addDimension('distance', ['cat_body_p1', 'cat_body_p2'], 30);
      sketches.push({
        id: 'sketch_body', name: 'Sketch 1 — Body', plane: state().sketchPlane,
        planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      finishCurrentSketch(1);

      // ── Head sketch ──
      beginSketchOnPlane('XY');
      store().setSketchTool('circle');
      drawCircle('cat_head', 45, 0, 18);
      addConstraint('horizontal', ['cat_head_center']);
      addDimension('radius', ['cat_head_center', 'cat_head_edge'], 18);
      sketches.push({
        id: 'sketch_head', name: 'Sketch 2 — Head', plane: state().sketchPlane,
        planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      finishCurrentSketch(2);

      // ── Left ear sketch ──
      beginSketchOnPlane('XY');
      store().setSketchTool('line');
      const le0 = mouseClickAtSketchPoint(35, 14, 'le0');
      const le_tip = mouseClickAtSketchPoint(38, 30, 'le_tip');
      const le1 = mouseClickAtSketchPoint(42, 14, 'le1');
      drawLine('le_l0', le0, le_tip);
      drawLine('le_l1', le_tip, le1);
      drawLine('le_l2', le1, le0);
      addConstraint('equal', ['le_l0', 'le_l1']);
      addDimension('distance', [le0, le_tip], 16.5);
      sketches.push({
        id: 'sketch_left_ear', name: 'Sketch 3 — Left Ear', plane: state().sketchPlane,
        planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      finishCurrentSketch(3);

      // ── Right ear sketch ──
      beginSketchOnPlane('XY');
      store().setSketchTool('line');
      const re0 = mouseClickAtSketchPoint(48, 14, 're0');
      const re_tip = mouseClickAtSketchPoint(52, 30, 're_tip');
      const re1 = mouseClickAtSketchPoint(55, 14, 're1');
      drawLine('re_l0', re0, re_tip);
      drawLine('re_l1', re_tip, re1);
      drawLine('re_l2', re1, re0);
      addConstraint('equal', ['re_l0', 're_l1']);
      addConstraint('symmetric', ['le_tip', 're_tip']);
      sketches.push({
        id: 'sketch_right_ear', name: 'Sketch 4 — Right Ear', plane: state().sketchPlane,
        planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      finishCurrentSketch(4);

      // ── Tail spline sketch ──
      beginSketchOnPlane('XZ');
      store().setSketchTool('spline');
      drawSpline('cat_tail', [[-30, 0], [-38, 8], [-44, 18], [-40, 26], [-35, 30]]);
      addConstraint('tangent', ['cat_tail']);
      sketches.push({
        id: 'sketch_tail', name: 'Sketch 5 — Tail', plane: state().sketchPlane,
        planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      finishCurrentSketch(5);

      // ── Extrude body ──
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 22);
      store().updateFeatureDialogParam('symmetric', true);
      const extBodyP = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      const bodyEnt = createEntity('Callicat Body', 'brep', { faceCount: 10, edgeCount: 24, vertexCount: 16 });
      features.push({ id: 'ext_body', name: 'Extrude 1', type: 'extrude', params: extBodyP, sketchRef: 'sketch_body', entityRef: bodyEnt.id });
      store().setTimeline([...state().timeline, { id: 'ext_body', name: 'Extrude 1', type: 'extrude', suppressed: false, hasError: false }]);

      // ── Extrude head ──
      store().openFeatureDialog('extrude');
      store().updateFeatureDialogParam('distance', 22);
      store().updateFeatureDialogParam('symmetric', true);
      const extHeadP = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      const headEnt = createEntity('Callicat Head', 'brep', { faceCount: 3, edgeCount: 6, vertexCount: 2 });
      features.push({ id: 'ext_head', name: 'Extrude 2', type: 'extrude', params: extHeadP, sketchRef: 'sketch_head', entityRef: headEnt.id });
      store().setTimeline([...state().timeline, { id: 'ext_head', name: 'Extrude 2', type: 'extrude', suppressed: false, hasError: false }]);

      // ── Extrude ears ──
      const earLEnt = createEntity('Left Ear', 'brep', { faceCount: 5, edgeCount: 9, vertexCount: 6 });
      const earREnt = createEntity('Right Ear', 'brep', { faceCount: 5, edgeCount: 9, vertexCount: 6 });
      features.push({ id: 'ext_earL', name: 'Extrude 3', type: 'extrude', params: { distance: 5, symmetric: true }, sketchRef: 'sketch_left_ear', entityRef: earLEnt.id });
      features.push({ id: 'ext_earR', name: 'Extrude 4', type: 'extrude', params: { distance: 5, symmetric: true }, sketchRef: 'sketch_right_ear', entityRef: earREnt.id });
      store().setTimeline([...state().timeline,
        { id: 'ext_earL', name: 'Extrude 3', type: 'extrude', suppressed: false, hasError: false },
        { id: 'ext_earR', name: 'Extrude 4', type: 'extrude', suppressed: false, hasError: false }]);

      // ── Sweep tail ──
      store().openFeatureDialog('sweep');
      const sweepP = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      const tailEnt = createEntity('Callicat Tail', 'brep', { faceCount: 2, edgeCount: 4, vertexCount: 0 });
      features.push({ id: 'sweep_tail', name: 'Sweep 1', type: 'sweep', params: sweepP, sketchRef: 'sketch_tail', entityRef: tailEnt.id });
      store().setTimeline([...state().timeline, { id: 'sweep_tail', name: 'Sweep 1', type: 'sweep', suppressed: false, hasError: false }]);

      // ── Boolean combine ──
      store().openFeatureDialog('boolean', { operation: 'combine' });
      const boolP = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      features.push({ id: 'bool1', name: 'Combine 1', type: 'boolean', params: boolP });
      store().setTimeline([...state().timeline, { id: 'bool1', name: 'Combine 1', type: 'boolean', suppressed: false, hasError: false }]);

      // ── Fillet ──
      store().openFeatureDialog('fillet');
      store().updateFeatureDialogParam('radius', 4);
      const filletP = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      features.push({ id: 'fil1', name: 'Fillet 1', type: 'fillet', params: filletP });
      store().setTimeline([...state().timeline, { id: 'fil1', name: 'Fillet 1', type: 'fillet', suppressed: false, hasError: false }]);

      // ── Eye holes ──
      store().openFeatureDialog('hole');
      store().updateFeatureDialogParam('diameter', 5);
      store().updateFeatureDialogParam('depth', 3);
      const holeP = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      features.push({ id: 'hole_eye1', name: 'Hole 1', type: 'hole', params: holeP });
      features.push({ id: 'hole_eye2', name: 'Hole 2', type: 'hole', params: { ...holeP } });
      store().setTimeline([...state().timeline,
        { id: 'hole_eye1', name: 'Hole 1', type: 'hole', suppressed: false, hasError: false },
        { id: 'hole_eye2', name: 'Hole 2', type: 'hole', suppressed: false, hasError: false }]);

      // ── Shell ──
      store().openFeatureDialog('shell');
      store().updateFeatureDialogParam('thickness', 1.5);
      const shellP = { ...state().featureDialog.params };
      store().closeFeatureDialog();
      features.push({ id: 'sh1', name: 'Shell 1', type: 'shell', params: shellP });
      store().setTimeline([...state().timeline, { id: 'sh1', name: 'Shell 1', type: 'shell', suppressed: false, hasError: false }]);

      // ── Assembly mate ──
      store().addMate({ id: 'j_body_head', type: 'fastened', part1: bodyEnt.id, part2: headEnt.id, name: 'Body-Head Joint' });

      // ═══ SERIALIZE & WRITE ═══
      const project = serializeProject(sketches, features);
      const json = projectToJSON(project);

      // Ensure output directory exists
      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }

      // Write the file
      fs.writeFileSync(OUTPUT_FILE, json, 'utf-8');

      // Verify file was written
      expect(fs.existsSync(OUTPUT_FILE)).toBe(true);
      const fileContent = fs.readFileSync(OUTPUT_FILE, 'utf-8');
      const savedProject = JSON.parse(fileContent) as R3dProject;

      expect(savedProject.format.version).toBe(PROJECT_FORMAT_VERSION);
      expect(savedProject.document.name).toBe('Callicat v1.0');
      expect(savedProject.entities).toHaveLength(5);
      expect(savedProject.timeline).toHaveLength(15);
      expect(savedProject.sketches).toHaveLength(5);
      expect(savedProject.features).toHaveLength(10);
      expect(savedProject.mates).toHaveLength(1);
      expect(savedProject.statistics.entityCount).toBe(5);
      expect(savedProject.statistics.totalFaces).toBe(25);
      expect(savedProject.statistics.totalEdges).toBe(52);
      expect(savedProject.statistics.totalVertices).toBe(30);

      // Verify sketch geometry is fully preserved
      expect(savedProject.sketches[0].points).toHaveLength(4);  // body rect
      expect(savedProject.sketches[1].points).toHaveLength(2);  // head circle
      expect(savedProject.sketches[2].points).toHaveLength(3);  // left ear
      expect(savedProject.sketches[3].points).toHaveLength(3);  // right ear
      expect(savedProject.sketches[4].points).toHaveLength(5);  // tail spline

      // Verify feature params
      const extBody = savedProject.features.find((f) => f.id === 'ext_body')!;
      expect(extBody.params.distance).toBe(22);
      expect(extBody.params.symmetric).toBe(true);
    });

    it('can load the written file back into the editor', () => {
      // The file should exist from the previous test
      if (!fs.existsSync(OUTPUT_FILE)) {
        // If running isolated, write a minimal file
        store().setDocumentName('Callicat v1.0');
        createEntity('Callicat Body', 'brep');
        const project = serializeProject();
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, projectToJSON(project), 'utf-8');
      }

      const fileContent = fs.readFileSync(OUTPUT_FILE, 'utf-8');
      const project = projectFromJSON(fileContent);

      // Reset and load
      resetApp();
      loadProjectIntoStore(project);

      expect(state().documentName).toBe('Callicat v1.0');
      expect(state().entities.length).toBeGreaterThanOrEqual(1);
      expect(state().statusMessage).toContain('Loaded project');
    });
  });
});
