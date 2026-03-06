/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  Callicat STL Generator                                   ║
 * ║                                                           ║
 * ║  Builds the callicat 3D model, constructs a Three.js      ║
 * ║  scene with proper geometry per entity, and exports       ║
 * ║  binary STL files into generated_test_models/             ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useEditorStore } from '../../store/editorStore';
import { buildCallicat } from '../../utils/callicatBuilder';
import {
  serializeProject,
  projectToJSON,
} from '../../store/modelSerializer';
import { exportSceneToBinarySTL } from '../../utils/stlExporter';
import { buildCallicatScene, buildEntityScene } from '../../utils/callicatSceneBuilder';
import * as fs from 'fs';
import * as path from 'path';

// ── Output directory ─────────────────────────────────────────────────────

const generatedDir = path.resolve(__dirname, '..', '..', '..', 'generated_test_models');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Validate STL buffer ──────────────────────────────────────────────────

function validateSTL(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  expect(buffer.byteLength).toBeGreaterThan(84);

  const triCount = view.getUint32(80, true);
  expect(triCount).toBeGreaterThan(0);

  const expectedSize = 80 + 4 + triCount * 50;
  expect(buffer.byteLength).toBe(expectedSize);

  return { triCount, byteLength: buffer.byteLength };
}

// ── Test Suite ───────────────────────────────────────────────────────────

describe('Callicat STL Generation → generated_test_models/', () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  it('builds callicat and saves STL to generated_test_models/', () => {
    // Step 1: Build callicat model
    const result = buildCallicat();
    expect(result).toBeDefined();

    const state = useEditorStore.getState();
    expect(state.entities.length).toBe(5);
    expect(state.documentName).toBe('Callicat v1.0');

    // Verify entities have distinct types and positions
    const types = state.entities.map((e) => e.type);
    expect(types).toContain('box');
    expect(types).toContain('sphere');
    expect(types).toContain('cylinder');

    // Verify not all at origin — at least some entities have non-zero positions
    const positions = state.entities.map((e) => e.transform.position);
    const nonOrigin = positions.filter(
      (p) => p[0] !== 0 || p[1] !== 0 || p[2] !== 0,
    );
    expect(nonOrigin.length).toBeGreaterThanOrEqual(3);

    // Step 2: Build Three.js scene
    const scene = buildCallicatScene();
    expect(scene.children.length).toBe(5);

    // Step 3: Export to binary STL
    const stlBuffer = exportSceneToBinarySTL(scene);
    const info = validateSTL(stlBuffer);
    // box(body)=12, sphere(head,32x16)=960, box(earL)=12, box(earR)=12, cylinder(tail,32)=128
    // Total: 12 + 960 + 12 + 12 + 128 = 1124 triangles
    expect(info.triCount).toBeGreaterThan(1000);

    // Step 4: Write to generated_test_models/
    ensureDir(generatedDir);
    const stlPath = path.join(generatedDir, 'callicat.stl');
    fs.writeFileSync(stlPath, Buffer.from(stlBuffer));

    expect(fs.existsSync(stlPath)).toBe(true);
    const fileSize = fs.statSync(stlPath).size;
    expect(fileSize).toBe(info.byteLength);

    console.log(`\n✅ STL saved: ${stlPath}`);
    console.log(`   Triangles: ${info.triCount}`);
    console.log(`   File size: ${fileSize} bytes`);
  });

  it('also saves the .r3d.json project alongside the STL', () => {
    buildCallicat();

    const project = serializeProject();
    const json = projectToJSON(project);

    ensureDir(generatedDir);
    const jsonPath = path.join(generatedDir, 'callicat.r3d.json');
    fs.writeFileSync(jsonPath, json, 'utf-8');

    expect(fs.existsSync(jsonPath)).toBe(true);
    const content = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.entities).toHaveLength(5);

    console.log(`\n✅ Project saved: ${jsonPath}`);
    console.log(`   Entities:  ${parsed.entities.length}`);
    console.log(`   JSON size: ${content.length} bytes`);
  });

  it('generates individual entity STLs with distinct geometry', () => {
    buildCallicat();
    ensureDir(generatedDir);

    const entities = useEditorStore.getState().entities;
    const savedFiles: { path: string; name: string; tris: number; size: number }[] = [];

    for (const entity of entities) {
      if (!entity.visible) continue;

      const scene = buildEntityScene(entity);
      const buffer = exportSceneToBinarySTL(scene);
      const safeName = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const filePath = path.join(generatedDir, `callicat_${safeName}.stl`);
      fs.writeFileSync(filePath, Buffer.from(buffer));

      const triCount = new DataView(buffer).getUint32(80, true);
      savedFiles.push({ path: filePath, name: entity.name, tris: triCount, size: buffer.byteLength });
    }

    expect(savedFiles.length).toBe(5);

    // Verify we have different geometry sizes (not all identical cubes)
    const triCounts = savedFiles.map((f) => f.tris);
    const uniqueTris = new Set(triCounts);
    expect(uniqueTris.size).toBeGreaterThan(1); // At least 2 different triangle counts

    console.log(`\n✅ Individual entity STLs saved to ${generatedDir}/`);
    for (const f of savedFiles) {
      console.log(`   ${path.basename(f.path)} — ${f.size} bytes, ${f.tris} tris (${f.name})`);
    }
  });

  it('callicat bounding box spans a reasonable cat shape', () => {
    buildCallicat();

    const scene = buildCallicatScene();
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());

    // Cat should be wider than tall (body is 60 units wide + head at 45)
    // and have some depth from extrusion
    expect(size.x).toBeGreaterThan(50);  // body + head + tail span
    expect(size.y).toBeGreaterThan(20);  // ears stick up
    expect(size.z).toBeGreaterThan(5);   // extrusion depth

    console.log(`\n✅ Callicat bounding box: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)}`);
  });

  it('generates a summary manifest', () => {
    buildCallicat();

    const state = useEditorStore.getState();
    const scene = buildCallicatScene();
    const stlBuffer = exportSceneToBinarySTL(scene);
    const triCount = new DataView(stlBuffer).getUint32(80, true);

    const manifest = {
      generatedAt: new Date().toISOString(),
      model: 'Callicat v1.0',
      entities: state.entities.map((e) => ({
        name: e.name,
        type: e.type,
        visible: e.visible,
        position: e.transform?.position ?? [0, 0, 0],
        scale: e.transform?.scale ?? [1, 1, 1],
        rotation: e.transform?.rotation ?? [0, 0, 0],
      })),
      timeline: {
        entries: state.timeline.length,
        features: state.timeline.map((t) => `${t.name} (${t.type})`),
      },
      stl: {
        file: 'callicat.stl',
        triangles: triCount,
        bytes: stlBuffer.byteLength,
      },
      files: [
        'callicat.stl',
        'callicat.r3d.json',
        ...state.entities
          .filter((e) => e.visible)
          .map((e) => `callicat_${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.stl`),
        'manifest.json',
      ],
    };

    ensureDir(generatedDir);
    const manifestPath = path.join(generatedDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    expect(fs.existsSync(manifestPath)).toBe(true);

    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║  Generated Test Models — Manifest                ║`);
    console.log(`╠══════════════════════════════════════════════════╣`);
    console.log(`║  Model:      ${manifest.model}`);
    console.log(`║  Entities:   ${manifest.entities.length}`);
    manifest.entities.forEach((e) => {
      console.log(`║    ${e.name}: ${e.type} @ [${e.position.map((v: number) => v.toFixed(1))}] scale [${e.scale.map((v: number) => v.toFixed(2))}]`);
    });
    console.log(`║  Timeline:   ${manifest.timeline.entries} entries`);
    console.log(`║  STL tris:   ${manifest.stl.triangles}`);
    console.log(`║  STL bytes:  ${manifest.stl.bytes}`);
    console.log(`║  Files:      ${manifest.files.length}`);
    console.log(`║  Output:     ${generatedDir}`);
    console.log(`╚══════════════════════════════════════════════════╝`);
  });
});
