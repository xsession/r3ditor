/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  Cali Cat 3D Calibration Model — Geometry & Build Tests            ║
 * ║                                                                     ║
 * ║  Tests the Cali Cat geometry builder to ensure dimensions match     ║
 * ║  the reference images:                                              ║
 * ║    • 20×20mm body/head footprint                                   ║
 * ║    • 27mm body+head height                                         ║
 * ║    • 5mm ear height                                                ║
 * ║    • 5×5mm tail cross-section                                      ║
 * ║    • 35mm total height to tail tip                                 ║
 * ║  Also tests serialization, STL export, and editor integration.     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  buildCaliCatGeometry,
  buildCaliCatParts,
  getCaliCatBounds,
  CALI_CAT_DIMENSIONS,
} from '../../utils/caliCatGeometry';
import { useEditorStore } from '../../store/editorStore';
import type { Entity } from '../../store/editorStore';
import {
  serializeProject,
  projectToJSON,
  projectFromJSON,
  loadProjectIntoStore,
  type SketchSnapshot,
  type FeatureSnapshot,
} from '../../store/modelSerializer';
import { exportSceneToBinarySTL } from '../../utils/stlExporter';
import * as fs from 'fs';
import * as path from 'path';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetApp() {
  useEditorStore.setState(useEditorStore.getInitialState());
}

function state() {
  return useEditorStore.getState();
}

function store() {
  return useEditorStore.getState();
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEST SUITE — Cali Cat 3D Calibration Model
// ═════════════════════════════════════════════════════════════════════════════

describe('Cali Cat 3D Calibration Model', () => {
  beforeEach(() => {
    resetApp();
  });

  // ─── Phase 1: Dimension Constants ──────────────────────────────────────

  describe('Dimension Constants', () => {
    it('has correct body dimensions (20×20×14mm)', () => {
      expect(CALI_CAT_DIMENSIONS.bodyWidth).toBe(20);
      expect(CALI_CAT_DIMENSIONS.bodyDepth).toBe(20);
      expect(CALI_CAT_DIMENSIONS.bodyHeight).toBe(14);
    });

    it('has correct head dimensions (20×20×13mm)', () => {
      expect(CALI_CAT_DIMENSIONS.headWidth).toBe(20);
      expect(CALI_CAT_DIMENSIONS.headDepth).toBe(20);
      expect(CALI_CAT_DIMENSIONS.headHeight).toBe(13);
    });

    it('has correct ear height (5mm)', () => {
      expect(CALI_CAT_DIMENSIONS.earHeight).toBe(5);
    });

    it('has correct tail cross-section (5×5mm)', () => {
      expect(CALI_CAT_DIMENSIONS.tailWidth).toBe(5);
      expect(CALI_CAT_DIMENSIONS.tailDepth).toBe(5);
    });

    it('body+head height is 27mm', () => {
      expect(CALI_CAT_DIMENSIONS.bodyPlusHead).toBe(27);
    });

    it('total height (body+head+ears) is 32mm', () => {
      expect(CALI_CAT_DIMENSIONS.totalHeight).toBe(32);
    });
  });

  // ─── Phase 2: Geometry Building ────────────────────────────────────────

  describe('Geometry Building', () => {
    it('builds merged geometry with valid buffer attributes', () => {
      const geo = buildCaliCatGeometry();

      // Should have position attribute
      const pos = geo.getAttribute('position');
      expect(pos).toBeDefined();
      expect(pos.count).toBeGreaterThan(100);

      // Should have normal attribute
      const norm = geo.getAttribute('normal');
      expect(norm).toBeDefined();
      expect(norm.count).toBe(pos.count);

      // Should have index
      const idx = geo.getIndex();
      expect(idx).toBeDefined();
      expect(idx!.count).toBeGreaterThan(100);

      geo.dispose();
    });

    it('bounding box width matches ~20mm body width', () => {
      const bounds = getCaliCatBounds();
      // Width should be slightly more than 20mm due to whiskers
      expect(bounds.width).toBeGreaterThanOrEqual(20);
      expect(bounds.width).toBeLessThanOrEqual(35); // whiskers extend ~5mm each side
    });

    it('bounding box height reaches above 27mm (body+head)', () => {
      const bounds = getCaliCatBounds();
      // Should be at least 27mm (body+head) and up to ~35mm with ears/tail
      expect(bounds.height).toBeGreaterThanOrEqual(27);
      expect(bounds.height).toBeLessThanOrEqual(40);
    });

    it('bounding box depth is ~20mm', () => {
      const bounds = getCaliCatBounds();
      expect(bounds.depth).toBeGreaterThanOrEqual(20);
      expect(bounds.depth).toBeLessThanOrEqual(35); // tail extends backward
    });

    it('base of model starts near Y=0 (with feet extending below)', () => {
      const bounds = getCaliCatBounds();
      // Feet extend 2mm below Y=0
      expect(bounds.min.y).toBeCloseTo(-2, 0);
    });

    it('model is roughly centered on X=0', () => {
      const bounds = getCaliCatBounds();
      const centerX = (bounds.min.x + bounds.max.x) / 2;
      expect(Math.abs(centerX)).toBeLessThan(5);
    });
  });

  // ─── Phase 3: Separate Parts ───────────────────────────────────────────

  describe('Part Breakdown', () => {
    it('builds 5 separate parts', () => {
      const parts = buildCaliCatParts();
      expect(parts).toHaveLength(5);
    });

    it('parts are named correctly', () => {
      const parts = buildCaliCatParts();
      const names = parts.map(p => p.name);
      expect(names).toContain('CaliCat Body');
      expect(names).toContain('CaliCat Head');
      expect(names).toContain('CaliCat Left Ear');
      expect(names).toContain('CaliCat Right Ear');
      expect(names).toContain('CaliCat Tail');
    });

    it('all parts use the signature orange color', () => {
      const parts = buildCaliCatParts();
      for (const part of parts) {
        expect(part.color).toBe(0xf5a623);
      }
    });

    it('each part has valid geometry', () => {
      const parts = buildCaliCatParts();
      for (const part of parts) {
        const pos = part.geometry.getAttribute('position');
        expect(pos).toBeDefined();
        expect(pos.count).toBeGreaterThan(3);
        part.geometry.dispose();
      }
    });

    it('body part has correct approximate height', () => {
      const parts = buildCaliCatParts();
      const body = parts.find(p => p.name === 'CaliCat Body')!;
      body.geometry.computeBoundingBox();
      const bb = body.geometry.boundingBox!;
      const height = bb.max.y - bb.min.y;
      expect(height).toBeCloseTo(CALI_CAT_DIMENSIONS.bodyHeight, 0);
      body.geometry.dispose();
    });

    it('head part sits on top of body', () => {
      const parts = buildCaliCatParts();
      const head = parts.find(p => p.name === 'CaliCat Head')!;
      head.geometry.computeBoundingBox();
      const bb = head.geometry.boundingBox!;
      // Head base Y should equal body height
      expect(bb.min.y).toBeCloseTo(CALI_CAT_DIMENSIONS.bodyHeight, 0);
      // Head top Y should be body + head height
      expect(bb.max.y).toBeCloseTo(
        CALI_CAT_DIMENSIONS.bodyHeight + CALI_CAT_DIMENSIONS.headHeight, 0,
      );
      head.geometry.dispose();
    });

    it('ears sit on top of head', () => {
      const parts = buildCaliCatParts();
      const leftEar = parts.find(p => p.name === 'CaliCat Left Ear')!;
      leftEar.geometry.computeBoundingBox();
      const bb = leftEar.geometry.boundingBox!;
      // Ear base should be at body + head height
      expect(bb.min.y).toBeCloseTo(
        CALI_CAT_DIMENSIONS.bodyHeight + CALI_CAT_DIMENSIONS.headHeight, 0,
      );
      // Ear top should be body + head + ear height
      expect(bb.max.y).toBeCloseTo(
        CALI_CAT_DIMENSIONS.bodyHeight + CALI_CAT_DIMENSIONS.headHeight + CALI_CAT_DIMENSIONS.earHeight, 0,
      );
      leftEar.geometry.dispose();
    });
  });

  // ─── Phase 4: STL Export ───────────────────────────────────────────────

  describe('STL Export', () => {
    it('exports the Cali Cat to a valid binary STL', () => {
      const geo = buildCaliCatGeometry();
      const scene = new THREE.Scene();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: 0xf5a623 }),
      );
      scene.add(mesh);
      scene.updateMatrixWorld(true);

      const stlBuffer = exportSceneToBinarySTL(scene);

      // Binary STL: 80 header + 4 byte triangle count + N*50
      expect(stlBuffer.byteLength).toBeGreaterThan(84);

      // Read triangle count from header
      const view = new DataView(stlBuffer);
      const triangleCount = view.getUint32(80, true);
      expect(triangleCount).toBeGreaterThan(50);

      // Verify file size matches: 84 + triangleCount * 50
      expect(stlBuffer.byteLength).toBe(84 + triangleCount * 50);

      geo.dispose();
    });

    it('writes CaliCat STL to disk', () => {
      const outputDir = path.resolve(__dirname, '../../..', 'models');
      const outputFile = path.join(outputDir, 'calicat-calibration.stl');

      const geo = buildCaliCatGeometry();
      const scene = new THREE.Scene();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: 0xf5a623 }),
      );
      scene.add(mesh);
      scene.updateMatrixWorld(true);

      const stlBuffer = exportSceneToBinarySTL(scene);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputFile, Buffer.from(stlBuffer));

      expect(fs.existsSync(outputFile)).toBe(true);
      const stats = fs.statSync(outputFile);
      expect(stats.size).toBeGreaterThan(1000);

      geo.dispose();
    });
  });

  // ─── Phase 5: Editor Integration ───────────────────────────────────────

  describe('Editor Integration', () => {
    it('loads CaliCat parts as editor entities', () => {
      store().setDocumentName('CaliCat Calibration');
      store().setCameraProjection('perspective');

      const parts = buildCaliCatParts();
      for (const part of parts) {
        part.geometry.computeBoundingBox();
        const bb = part.geometry.boundingBox!;
        const entity: Entity = {
          id: `calicat_${part.name.replace(/\s+/g, '_').toLowerCase()}`,
          name: part.name,
          visible: true,
          locked: false,
          suppressed: false,
          faceCount: 6,
          edgeCount: 12,
          vertexCount: 8,
          transform: {
            position: [
              (bb.min.x + bb.max.x) / 2,
              (bb.min.y + bb.max.y) / 2,
              (bb.min.z + bb.max.z) / 2,
            ],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          type: 'box',
        };
        store().addEntity(entity);
        part.geometry.dispose();
      }

      expect(state().entities).toHaveLength(5);
      expect(state().entities.map(e => e.name)).toEqual([
        'CaliCat Body',
        'CaliCat Head',
        'CaliCat Left Ear',
        'CaliCat Right Ear',
        'CaliCat Tail',
      ]);
      expect(state().documentName).toBe('CaliCat Calibration');
    });

    it('serializes CaliCat project to JSON', () => {
      store().setDocumentName('CaliCat Calibration');
      const parts = buildCaliCatParts();
      for (const part of parts) {
        store().addEntity({
          id: `cc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          name: part.name,
          visible: true,
          locked: false,
          suppressed: false,
          faceCount: 6,
          edgeCount: 12,
          vertexCount: 8,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          type: 'box',
        });
        part.geometry.dispose();
      }

      const project = serializeProject();
      const json = projectToJSON(project);

      expect(json).toContain('CaliCat Calibration');
      expect(json).toContain('CaliCat Body');
      expect(json).toContain('CaliCat Head');
      expect(json).toContain('CaliCat Left Ear');
      expect(json).toContain('CaliCat Right Ear');
      expect(json).toContain('CaliCat Tail');

      // Round-trip
      const restored = projectFromJSON(json);
      expect(restored.entities).toHaveLength(5);
      expect(restored.document.name).toBe('CaliCat Calibration');
    });

    it('round-trips CaliCat through save/load', () => {
      store().setDocumentName('CaliCat Calibration');
      const parts = buildCaliCatParts();
      for (const part of parts) {
        store().addEntity({
          id: `cc_${part.name.replace(/\s+/g, '_').toLowerCase()}`,
          name: part.name,
          visible: true,
          locked: false,
          suppressed: false,
          faceCount: 6,
          edgeCount: 12,
          vertexCount: 8,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          type: 'box',
        });
        part.geometry.dispose();
      }

      // Add timeline entries
      store().setTimeline([
        { id: 'body_ext', name: 'Body Extrude', type: 'extrude', suppressed: false, hasError: false },
        { id: 'head_ext', name: 'Head Extrude', type: 'extrude', suppressed: false, hasError: false },
        { id: 'ear_l_ext', name: 'Left Ear Extrude', type: 'extrude', suppressed: false, hasError: false },
        { id: 'ear_r_ext', name: 'Right Ear Extrude', type: 'extrude', suppressed: false, hasError: false },
        { id: 'tail_sweep', name: 'Tail Sweep', type: 'sweep', suppressed: false, hasError: false },
      ]);

      const project = serializeProject();
      const json = projectToJSON(project);

      // Reset and reload
      resetApp();
      expect(state().entities).toHaveLength(0);

      loadProjectIntoStore(projectFromJSON(json));
      expect(state().documentName).toBe('CaliCat Calibration');
      expect(state().entities).toHaveLength(5);
      expect(state().timeline).toHaveLength(5);
      expect(state().statusMessage).toContain('Loaded project');
    });
  });

  // ─── Phase 6: Write Final Output ──────────────────────────────────────

  describe('Write CaliCat Model Files', () => {
    const OUTPUT_DIR = path.resolve(__dirname, '../../..', 'models');

    it('writes calicat-calibration.r3d.json project file', () => {
      store().setDocumentName('CaliCat Calibration');
      store().setCameraProjection('perspective');
      store().setViewStyle('shadedEdges');

      // Build CaliCat sketch data (for the project file)
      const sketches: SketchSnapshot[] = [];
      const features: FeatureSnapshot[] = [];

      // Create body sketch
      store().beginPlaneSelection();
      store().selectSketchPlane({
        type: 'XY', origin: [0, 0, 0], normal: [0, 0, 1], uAxis: [1, 0, 0], vAxis: [0, 1, 0],
      });
      store().setSketchTool('rectangle');
      store().addSketchPoint({ id: 'body_p0', x: -10, y: 0, isConstruction: false });
      store().addSketchPoint({ id: 'body_p1', x: 10, y: 0, isConstruction: false });
      store().addSketchPoint({ id: 'body_p2', x: 10, y: 14, isConstruction: false });
      store().addSketchPoint({ id: 'body_p3', x: -10, y: 14, isConstruction: false });
      store().addSketchSegment({ id: 'body_rect', type: 'rectangle', points: ['body_p0', 'body_p1', 'body_p2', 'body_p3'], isConstruction: false });
      store().addSketchDimension({ id: 'd_bw', type: 'distance', entityIds: ['body_p0', 'body_p1'], value: 20, driving: true });
      store().addSketchDimension({ id: 'd_bh', type: 'distance', entityIds: ['body_p1', 'body_p2'], value: 14, driving: true });
      sketches.push({
        id: 'sketch_body', name: 'Sketch 1 — Body Profile',
        plane: 'XY', planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      store().finishSketch();

      // Create head sketch
      store().beginPlaneSelection();
      store().selectSketchPlane({
        type: 'XY', origin: [0, 14, 0], normal: [0, 0, 1], uAxis: [1, 0, 0], vAxis: [0, 1, 0],
      });
      store().addSketchPoint({ id: 'head_p0', x: -10, y: 14, isConstruction: false });
      store().addSketchPoint({ id: 'head_p1', x: 10, y: 14, isConstruction: false });
      store().addSketchPoint({ id: 'head_p2', x: 10, y: 27, isConstruction: false });
      store().addSketchPoint({ id: 'head_p3', x: -10, y: 27, isConstruction: false });
      store().addSketchSegment({ id: 'head_rect', type: 'rectangle', points: ['head_p0', 'head_p1', 'head_p2', 'head_p3'], isConstruction: false });
      store().addSketchDimension({ id: 'd_hw', type: 'distance', entityIds: ['head_p0', 'head_p1'], value: 20, driving: true });
      store().addSketchDimension({ id: 'd_hh', type: 'distance', entityIds: ['head_p1', 'head_p2'], value: 13, driving: true });
      sketches.push({
        id: 'sketch_head', name: 'Sketch 2 — Head Profile',
        plane: 'XY', planeInfo: state().sketchPlaneInfo ? { ...state().sketchPlaneInfo! } : null,
        points: [...state().sketchPoints], segments: [...state().sketchSegments],
        constraints: [...state().sketchConstraints], dimensions: [...state().sketchDimensions],
        dof: state().sketchDof,
      });
      store().finishSketch();

      // Add entities
      const parts = buildCaliCatParts();
      for (const part of parts) {
        part.geometry.computeBoundingBox();
        const bb = part.geometry.boundingBox!;
        store().addEntity({
          id: `calicat_${part.name.replace(/\s+/g, '_').toLowerCase()}`,
          name: part.name,
          visible: true, locked: false, suppressed: false,
          faceCount: 6, edgeCount: 12, vertexCount: 8,
          transform: {
            position: [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2],
            rotation: [0, 0, 0], scale: [1, 1, 1],
          },
          type: 'box',
        });
        part.geometry.dispose();
      }

      // Build timeline
      store().setTimeline([
        { id: 'sk1', name: 'Sketch 1', type: 'sketch', suppressed: false, hasError: false },
        { id: 'sk2', name: 'Sketch 2', type: 'sketch', suppressed: false, hasError: false },
        { id: 'ext_body', name: 'Extrude Body (20mm)', type: 'extrude', suppressed: false, hasError: false },
        { id: 'ext_head', name: 'Extrude Head (20mm)', type: 'extrude', suppressed: false, hasError: false },
        { id: 'ext_ear_l', name: 'Extrude Left Ear', type: 'extrude', suppressed: false, hasError: false },
        { id: 'ext_ear_r', name: 'Extrude Right Ear', type: 'extrude', suppressed: false, hasError: false },
        { id: 'sweep_tail', name: 'Sweep Tail', type: 'sweep', suppressed: false, hasError: false },
      ]);

      features.push(
        { id: 'ext_body', name: 'Extrude Body', type: 'extrude', params: { distance: 20, symmetric: true }, sketchRef: 'sketch_body' },
        { id: 'ext_head', name: 'Extrude Head', type: 'extrude', params: { distance: 20, symmetric: true }, sketchRef: 'sketch_head' },
        { id: 'ext_ear_l', name: 'Extrude Left Ear', type: 'extrude', params: { distance: 3, symmetric: false } },
        { id: 'ext_ear_r', name: 'Extrude Right Ear', type: 'extrude', params: { distance: 3, symmetric: false } },
        { id: 'sweep_tail', name: 'Sweep Tail', type: 'sweep', params: { orientation: 'perpendicular' } },
      );

      // Serialize
      const project = serializeProject(sketches, features);
      const json = projectToJSON(project);

      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }
      const outputFile = path.join(OUTPUT_DIR, 'calicat-calibration.r3d.json');
      fs.writeFileSync(outputFile, json, 'utf-8');

      expect(fs.existsSync(outputFile)).toBe(true);
      const content = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      expect(content.document.name).toBe('CaliCat Calibration');
      expect(content.entities).toHaveLength(5);
      expect(content.sketches).toHaveLength(2);
      expect(content.features).toHaveLength(5);
    });
  });
});
