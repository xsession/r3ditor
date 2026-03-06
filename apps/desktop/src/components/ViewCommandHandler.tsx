import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';

/**
 * Standard view positions for 1-6 + 0 keys.
 * Camera distance ~80 from origin, looking at center.
 */
const VIEW_DISTANCE = 80;

const viewPositions: Record<string, THREE.Vector3> = {
  front:  new THREE.Vector3(0, 0, VIEW_DISTANCE),
  back:   new THREE.Vector3(0, 0, -VIEW_DISTANCE),
  top:    new THREE.Vector3(0, VIEW_DISTANCE, 0),
  bottom: new THREE.Vector3(0, -VIEW_DISTANCE, 0),
  left:   new THREE.Vector3(-VIEW_DISTANCE, 0, 0),
  right:  new THREE.Vector3(VIEW_DISTANCE, 0, 0),
  iso:    new THREE.Vector3(VIEW_DISTANCE * 0.6, VIEW_DISTANCE * 0.5, VIEW_DISTANCE * 0.6),
};

/**
 * Handles viewCommand state changes and smoothly animates the camera
 * to the target standard view position.
 *
 * Mount this inside a <Canvas> context.
 */
export function ViewCommandHandler() {
  const viewCommand = useEditorStore((s) => s.viewCommand);
  const clearViewCommand = useEditorStore((s) => s.clearViewCommand);
  const { camera } = useThree();

  const animating = useRef(false);
  const startPos = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());
  const startLookAt = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const progress = useRef(0);

  useEffect(() => {
    if (!viewCommand) return;

    if (viewCommand === 'zoomFit') {
      // For zoom to fit, we just reset to iso view
      targetPos.current.copy(viewPositions.iso);
    } else {
      const pos = viewPositions[viewCommand];
      if (!pos) {
        clearViewCommand();
        return;
      }
      targetPos.current.copy(pos);
    }

    targetLookAt.current.set(0, 0, 0);
    startPos.current.copy(camera.position);

    // Calculate current look-at
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    startLookAt.current.copy(camera.position).add(dir.multiplyScalar(50));

    progress.current = 0;
    animating.current = true;
    clearViewCommand();
  }, [viewCommand, camera, clearViewCommand]);

  useFrame((_, delta) => {
    if (!animating.current) return;
    progress.current = Math.min(1, progress.current + delta * 3); // ~0.33s
    const ease = 1 - Math.pow(1 - progress.current, 3); // cubic ease-out

    camera.position.lerpVectors(startPos.current, targetPos.current, ease);
    const lookAt = new THREE.Vector3().lerpVectors(startLookAt.current, targetLookAt.current, ease);
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();

    if (progress.current >= 1) {
      animating.current = false;
    }
  });

  return null;
}
