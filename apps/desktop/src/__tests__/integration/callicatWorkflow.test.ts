/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  Callicat Full Workflow Integration Test                  ║
 * ║                                                           ║
 * ║  1. Build callicat model in the editor store              ║
 * ║  2. Serialize → save as .r3d.json                         ║
 * ║  3. Export Three.js scene as binary STL                   ║
 * ║  4. Validate STL file structure                           ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../store/editorStore';
import { buildCallicat } from '../../utils/callicatBuilder';
import {
  serializeProject,
  projectToJSON,
  projectFromJSON,
  loadProjectIntoStore,
} from '../../store/modelSerializer';
import { exportSceneToBinarySTL, stlBufferToBlob } from '../../utils/stlExporter';
import { buildCallicatScene } from '../../utils/callicatSceneBuilder';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ──────────────────────────────────────────────────────────────

const outputDir = path.resolve(__dirname, '..', '..', '..', 'output');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Scene building is handled by the shared callicatSceneBuilder utility
// which applies proper geometry types, positions, rotations, and scales
// from each entity's transform — producing a proper cat shape.

/**
 * Validate binary STL buffer structure.
 */
function validateSTL(buffer: ArrayBuffer) {
  const view = new DataView(buffer);

  // Header: 80 bytes
  expect(buffer.byteLength).toBeGreaterThan(84);

  // Triangle count at offset 80
  const triCount = view.getUint32(80, true);
  expect(triCount).toBeGreaterThan(0);

  // Expected size: 80 header + 4 count + triCount * 50
  const expectedSize = 80 + 4 + triCount * 50;
  expect(buffer.byteLength).toBe(expectedSize);

  // Spot-check first triangle normal (should be a unit vector or zero)
  const nx = view.getFloat32(84, true);
  const ny = view.getFloat32(88, true);
  const nz = view.getFloat32(92, true);
  const normalLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
  expect(normalLen).toBeCloseTo(1.0, 1);

  return { triCount, byteLength: buffer.byteLength };
}

// ─── Test Suite ──────────────────────────────────────────────────────────

describe('Callicat Full Workflow', () => {
  beforeEach(() => {
    // Reset store to initial state
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  // ── Phase 1: Build Callicat ──

  it('builds the callicat model in the store', () => {
    const result = buildCallicat();

    expect(result).toBeDefined();
    expect(result.sketches).toBeDefined();
    expect(result.features).toBeDefined();

    const state = useEditorStore.getState();
    expect(state.entities.length).toBe(5); // body, head, 2 ears, tail
    expect(state.timeline.length).toBeGreaterThanOrEqual(15);
    expect(state.documentName).toBe('Callicat v1.0');
  });

  // ── Phase 2: Serialize & Save ──

  it('serializes the callicat project to JSON', () => {
    buildCallicat();

    const project = serializeProject();
    expect(project).toBeDefined();
    expect(project.document.name).toBe('Callicat v1.0');
    expect(project.entities.length).toBe(5);
    expect(project.timeline.length).toBeGreaterThanOrEqual(15);

    const json = projectToJSON(project);
    expect(json).toBeTruthy();
    expect(json.length).toBeGreaterThan(1000);

    // Parse back to verify roundtrip
    const parsed = JSON.parse(json);
    expect(parsed.format.version).toBe('1.0.0');
    expect(parsed.entities).toHaveLength(5);
  });

  it('saves project to .r3d.json file', () => {
    buildCallicat();

    const project = serializeProject();
    const json = projectToJSON(project);

    ensureDir(outputDir);
    const filePath = path.join(outputDir, 'callicat.r3d.json');
    fs.writeFileSync(filePath, json, 'utf-8');

    // Verify file exists and is valid JSON
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.entities).toHaveLength(5);
    expect(parsed.document.name).toBe('Callicat v1.0');

    console.log(`✅ Saved: ${filePath} (${content.length} bytes)`);
  });

  // ── Phase 3: Roundtrip ──

  it('loads saved project back into store', () => {
    buildCallicat();

    const project = serializeProject();
    const json = projectToJSON(project);

    // Reset store
    useEditorStore.setState(useEditorStore.getInitialState());
    expect(useEditorStore.getState().entities.length).toBe(0);

    // Load back
    const loadedProject = projectFromJSON(json);
    loadProjectIntoStore(loadedProject);

    const state = useEditorStore.getState();
    expect(state.entities.length).toBe(5);
    expect(state.timeline.length).toBeGreaterThanOrEqual(15);
    expect(state.documentName).toBe('Callicat v1.0');
  });

  // ── Phase 4: Export STL ──

  it('exports callicat scene to binary STL buffer', () => {
    buildCallicat();

    const scene = buildCallicatScene();
    expect(scene.children.length).toBe(5);

    const buffer = exportSceneToBinarySTL(scene);
    const info = validateSTL(buffer);

    // With proper geometry: boxes(12 each) + sphere(960) + cylinder(128) > 1000 tris
    expect(info.triCount).toBeGreaterThan(1000);
    expect(info.byteLength).toBeGreaterThan(50000);

    console.log(`✅ STL: ${info.triCount} triangles, ${info.byteLength} bytes`);
  });

  it('saves STL file to disk', () => {
    buildCallicat();

    const scene = buildCallicatScene();
    const buffer = exportSceneToBinarySTL(scene);

    ensureDir(outputDir);
    const filePath = path.join(outputDir, 'callicat.stl');
    fs.writeFileSync(filePath, Buffer.from(buffer));

    expect(fs.existsSync(filePath)).toBe(true);
    const fileSize = fs.statSync(filePath).size;
    expect(fileSize).toBeGreaterThan(500);

    // Verify STL structure in saved file
    const readBuffer = fs.readFileSync(filePath);
    const view = new DataView(readBuffer.buffer, readBuffer.byteOffset, readBuffer.byteLength);
    const triCount = view.getUint32(80, true);
    expect(triCount).toBeGreaterThan(10);

    console.log(`✅ Saved: ${filePath} (${fileSize} bytes, ${triCount} triangles)`);
  });

  it('creates valid STL blob for download', () => {
    buildCallicat();

    const scene = buildCallicatScene();
    const buffer = exportSceneToBinarySTL(scene);
    const blob = stlBufferToBlob(buffer);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(500);
    expect(blob.type).toBe('application/sla');
  });

  // ── Phase 5: Complete Pipeline ──

  it('runs the complete pipeline: build → save → load → export', () => {
    // Step 1: Build callicat
    buildCallicat();
    const state1 = useEditorStore.getState();
    expect(state1.entities.length).toBe(5);

    // Step 2: Serialize & save
    const project = serializeProject();
    const json = projectToJSON(project);
    ensureDir(outputDir);
    fs.writeFileSync(path.join(outputDir, 'callicat-pipeline.r3d.json'), json);

    // Step 3: Load back into fresh store
    useEditorStore.setState(useEditorStore.getInitialState());
    loadProjectIntoStore(projectFromJSON(json));
    const state2 = useEditorStore.getState();
    expect(state2.entities.length).toBe(5);
    expect(state2.documentName).toBe('Callicat v1.0');

    // Step 4: Build Three.js scene & export STL
    const scene = buildCallicatScene();
    const stlBuffer = exportSceneToBinarySTL(scene);
    fs.writeFileSync(path.join(outputDir, 'callicat-pipeline.stl'), Buffer.from(stlBuffer));

    // Step 5: Validate outputs
    const jsonFile = fs.readFileSync(path.join(outputDir, 'callicat-pipeline.r3d.json'), 'utf-8');
    const stlFile = fs.readFileSync(path.join(outputDir, 'callicat-pipeline.stl'));
    const triCount = new DataView(stlFile.buffer, stlFile.byteOffset, stlFile.byteLength).getUint32(80, true);

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║  Callicat Pipeline Complete!                 ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Entities:   ${state2.entities.length}`);
    console.log(`║  Timeline:   ${state2.timeline.length} entries`);
    console.log(`║  JSON size:  ${jsonFile.length} bytes`);
    console.log(`║  STL size:   ${stlFile.length} bytes`);
    console.log(`║  Triangles:  ${triCount}`);
    console.log(`║  Output dir: ${outputDir}`);
    console.log('╚══════════════════════════════════════════════╝');

    expect(jsonFile.length).toBeGreaterThan(1000);
    expect(stlFile.length).toBeGreaterThan(50000);
    expect(triCount).toBeGreaterThan(1000);
  });
});
