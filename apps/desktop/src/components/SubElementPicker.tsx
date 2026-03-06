import { useEditorStore } from '../store/editorStore';
import { useThree } from '@react-three/fiber';
import { useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';

/**
 * SubElementPicker — Face/edge/vertex sub-element picking.
 *
 * From CAD-PLATFORM-UX-RESEARCH.md:
 * - Fusion 360: click face/edge/vertex based on selection filter
 * - Onshape: same click-to-select with sub-element filtering
 * - FreeCAD: hover-highlight on faces/edges/vertices
 *
 * This component intercepts pointer events and performs raycasting
 * to identify which face/edge/vertex is under the cursor, then
 * highlights it with a visual overlay.
 *
 * Uses Three.js face intersection data (face index from raycaster).
 */

export interface SubElementSelection {
  entityId: string;
  type: 'face' | 'edge' | 'vertex';
  index: number;
}

export function SubElementPicker() {
  const selectionFilter = useEditorStore((s) => s.selectionFilter);
  const entities = useEditorStore((s) => s.entities);
  const isSketchActive = useEditorStore((s) => s.isSketchActive);
  const { raycaster, camera, scene, gl } = useThree();
  const hoveredRef = useRef<SubElementSelection | null>(null);
  const highlightRef = useRef<THREE.Mesh | null>(null);

  // Only activate sub-element picking for face/edge/vertex filters
  const isSubElementMode = selectionFilter === 'face' || selectionFilter === 'edge' || selectionFilter === 'vertex';

  const performPick = useCallback(
    (e: PointerEvent): SubElementSelection | null => {
      if (!isSubElementMode || isSketchActive) return null;

      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);

      // Get all mesh objects in the scene
      const meshes = scene.children.filter(
        (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.userData?.entityId,
      );

      const intersections = raycaster.intersectObjects(meshes, true);
      if (intersections.length === 0) return null;

      const hit = intersections[0];
      const entityId = hit.object.userData?.entityId as string | undefined;
      if (!entityId) return null;

      if (selectionFilter === 'face' && hit.faceIndex != null) {
        return { entityId, type: 'face', index: hit.faceIndex };
      }

      if (selectionFilter === 'vertex' && hit.faceIndex != null) {
        // Use nearest vertex from the intersected face
        const face = hit.face;
        if (face) {
          const positions = (hit.object as THREE.Mesh).geometry?.getAttribute('position');
          if (positions) {
            let nearestIdx = face.a;
            let nearestDist = Infinity;
            for (const idx of [face.a, face.b, face.c]) {
              const vx = positions.getX(idx);
              const vy = positions.getY(idx);
              const vz = positions.getZ(idx);
              const v = new THREE.Vector3(vx, vy, vz);
              v.applyMatrix4(hit.object.matrixWorld);
              const d = v.distanceTo(hit.point);
              if (d < nearestDist) {
                nearestDist = d;
                nearestIdx = idx;
              }
            }
            return { entityId, type: 'vertex', index: nearestIdx };
          }
        }
      }

      if (selectionFilter === 'edge' && hit.faceIndex != null) {
        // Approximate edge picking by using face edges
        return { entityId, type: 'edge', index: hit.faceIndex };
      }

      return null;
    },
    [isSubElementMode, isSketchActive, raycaster, camera, scene, gl, selectionFilter],
  );

  useEffect(() => {
    if (!isSubElementMode || isSketchActive) return;

    const canvas = gl.domElement;

    const onPointerMove = (e: PointerEvent) => {
      const sel = performPick(e);
      hoveredRef.current = sel;

      // Update cursor
      if (sel) {
        document.body.style.cursor = 'crosshair';
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const sel = performPick(e);
      if (sel) {
        const store = useEditorStore.getState();
        store.select(sel.entityId);
        store.setStatusMessage(
          `Selected ${sel.type} #${sel.index} on ${entities.find((e2) => e2.id === sel.entityId)?.name ?? sel.entityId}`,
        );
      }
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isSubElementMode, isSketchActive, gl, performPick, entities]);

  // Cleanup highlight on unmount
  useEffect(() => {
    return () => {
      if (highlightRef.current) {
        highlightRef.current.parent?.remove(highlightRef.current);
        highlightRef.current = null;
      }
    };
  }, []);

  return null; // This component only adds event listeners, no JSX output
}
