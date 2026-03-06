/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  Callicat Scene Builder                                   ║
 * ║                                                           ║
 * ║  Constructs a Three.js scene from the editor store's      ║
 * ║  entity list. Each entity's type, position, rotation,     ║
 * ║  and scale are faithfully reproduced so the STL export    ║
 * ║  produces an actual cat shape — not 5 overlapping cubes.  ║
 * ║                                                           ║
 * ║  Shared by: Viewport3D, STL exporter, integration tests  ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';
import type { Entity } from '../store/editorStore';

/**
 * Map an entity type to a Three.js BufferGeometry.
 *
 * These are the *base* geometries before the entity's transform.scale
 * is applied, matching what Viewport3D renders:
 *   - box       → BoxGeometry(20, 20, 20)
 *   - sphere    → SphereGeometry(10, 32, 16)
 *   - cylinder  → CylinderGeometry(10, 10, 30, 32)
 *   - brep/imported → BoxGeometry(20, 20, 20) (fallback)
 */
function geometryForEntity(entity: Entity): THREE.BufferGeometry {
  switch (entity.type) {
    case 'box':
      return new THREE.BoxGeometry(20, 20, 20);
    case 'sphere':
      return new THREE.SphereGeometry(10, 32, 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(10, 10, 30, 32);
    default:
      // brep / imported fallback
      return new THREE.BoxGeometry(20, 20, 20);
  }
}

/**
 * Build a Three.js scene that mirrors the entities currently
 * in the editor store.  Position, rotation, and scale are taken
 * directly from each entity's transform so the combined STL
 * is geometrically correct.
 */
export function buildCallicatScene(): THREE.Scene {
  const scene = new THREE.Scene();
  const entities = useEditorStore.getState().entities;

  for (const entity of entities) {
    if (!entity.visible) continue;

    const geometry = geometryForEntity(entity);
    const material = new THREE.MeshStandardMaterial({ color: 0x2196f3 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = entity.name;

    if (entity.transform) {
      const t = entity.transform;
      mesh.position.set(
        t.position?.[0] ?? 0,
        t.position?.[1] ?? 0,
        t.position?.[2] ?? 0,
      );
      mesh.rotation.set(
        t.rotation?.[0] ?? 0,
        t.rotation?.[1] ?? 0,
        t.rotation?.[2] ?? 0,
      );
      mesh.scale.set(
        t.scale?.[0] ?? 1,
        t.scale?.[1] ?? 1,
        t.scale?.[2] ?? 1,
      );
    }

    scene.add(mesh);
  }

  scene.updateMatrixWorld(true);
  return scene;
}

/**
 * Build a Three.js scene for a single entity (useful for
 * per-part STL export).
 */
export function buildEntityScene(entity: Entity): THREE.Scene {
  const scene = new THREE.Scene();
  if (!entity.visible) return scene;

  const geometry = geometryForEntity(entity);
  const material = new THREE.MeshStandardMaterial({ color: 0x2196f3 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = entity.name;

  if (entity.transform) {
    const t = entity.transform;
    mesh.position.set(
      t.position?.[0] ?? 0,
      t.position?.[1] ?? 0,
      t.position?.[2] ?? 0,
    );
    mesh.rotation.set(
      t.rotation?.[0] ?? 0,
      t.rotation?.[1] ?? 0,
      t.rotation?.[2] ?? 0,
    );
    mesh.scale.set(
      t.scale?.[0] ?? 1,
      t.scale?.[1] ?? 1,
      t.scale?.[2] ?? 1,
    );
  }

  scene.add(mesh);
  scene.updateMatrixWorld(true);
  return scene;
}
