/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  STL Exporter — Frontend Three.js Scene → Binary STL     ║
 * ║                                                           ║
 * ║  Traverses the Three.js scene graph and writes all        ║
 * ║  visible mesh geometry as a binary STL file.              ║
 * ║  Used as a fallback when backend mesh data is absent.     ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

import * as THREE from 'three';

/**
 * Export a Three.js scene (or group) to a binary STL ArrayBuffer.
 *
 * Binary STL format:
 * - 80 bytes: header
 * - 4 bytes:  u32 triangle count
 * - N × 50 bytes: triangles (normal + 3 vertices + 2 attribute bytes)
 */
export function exportSceneToBinarySTL(scene: THREE.Object3D): ArrayBuffer {
  const triangles: { normal: THREE.Vector3; vertices: [THREE.Vector3, THREE.Vector3, THREE.Vector3] }[] = [];

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.visible) return;

    const geometry = obj.geometry as THREE.BufferGeometry;
    if (!geometry) return;

    // Apply world transform
    const matrixWorld = obj.matrixWorld;

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr) return;

    const index = geometry.getIndex();
    const triCount = index ? index.count / 3 : posAttr.count / 3;

    for (let i = 0; i < triCount; i++) {
      const i0 = index ? index.getX(i * 3) : i * 3;
      const i1 = index ? index.getX(i * 3 + 1) : i * 3 + 1;
      const i2 = index ? index.getX(i * 3 + 2) : i * 3 + 2;

      const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i0).applyMatrix4(matrixWorld);
      const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i1).applyMatrix4(matrixWorld);
      const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i2).applyMatrix4(matrixWorld);

      // Face normal
      const e1 = new THREE.Vector3().subVectors(v1, v0);
      const e2 = new THREE.Vector3().subVectors(v2, v0);
      const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();

      triangles.push({ normal, vertices: [v0, v1, v2] });
    }
  });

  // Build binary buffer
  const headerSize = 80;
  const countSize = 4;
  const triSize = 50; // 4×3×4 + 2 = 50 bytes per triangle
  const bufferSize = headerSize + countSize + triangles.length * triSize;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();

  // Header (80 bytes)
  const headerText = encoder.encode('r3ditor Three.js STL export');
  new Uint8Array(buffer, 0, headerText.length).set(headerText);

  // Triangle count
  view.setUint32(80, triangles.length, true);

  // Triangles
  let offset = 84;
  for (const tri of triangles) {
    // Normal
    view.setFloat32(offset, tri.normal.x, true); offset += 4;
    view.setFloat32(offset, tri.normal.y, true); offset += 4;
    view.setFloat32(offset, tri.normal.z, true); offset += 4;

    // Vertices
    for (const v of tri.vertices) {
      view.setFloat32(offset, v.x, true); offset += 4;
      view.setFloat32(offset, v.y, true); offset += 4;
      view.setFloat32(offset, v.z, true); offset += 4;
    }

    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}

/**
 * Convert an ArrayBuffer to a downloadable Blob URL.
 */
export function stlBufferToBlob(buffer: ArrayBuffer): Blob {
  return new Blob([buffer], { type: 'application/sla' });
}

/**
 * Trigger a browser download of an STL buffer.
 */
export function downloadSTL(buffer: ArrayBuffer, filename: string): void {
  const blob = stlBufferToBlob(buffer);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
