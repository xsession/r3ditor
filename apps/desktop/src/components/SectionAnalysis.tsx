import { useEditorStore } from '../store/editorStore';
import { useThree, useFrame } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';

/**
 * Section Analysis — real-time clipping plane through the 3D model.
 *
 * Uses Three.js clipping planes attached to the WebGL renderer.
 * The plane normal and origin come from `sectionPlane` store state.
 * A translucent plane mesh shows where the cut occurs.
 *
 * Toggle via Ctrl+Shift+X or Inspect menu → Section Analysis.
 */
export function SectionPlane() {
  const sectionPlane = useEditorStore((s) => s.sectionPlane);
  const { gl } = useThree();
  const planeRef = useRef(new THREE.Plane());
  const meshRef = useRef<THREE.Mesh>(null);

  // Update clipping plane
  useEffect(() => {
    if (sectionPlane.enabled) {
      const normal = new THREE.Vector3(...sectionPlane.normal).normalize();
      const origin = new THREE.Vector3(...sectionPlane.origin);
      planeRef.current.setFromNormalAndCoplanarPoint(normal, origin);

      gl.clippingPlanes = [planeRef.current];
      gl.localClippingEnabled = true;
    } else {
      gl.clippingPlanes = [];
      gl.localClippingEnabled = false;
    }

    return () => {
      gl.clippingPlanes = [];
      gl.localClippingEnabled = false;
    };
  }, [sectionPlane.enabled, sectionPlane.origin, sectionPlane.normal, gl]);

  // Animate the visible plane mesh
  useFrame(() => {
    if (!meshRef.current || !sectionPlane.enabled) return;
    const n = new THREE.Vector3(...sectionPlane.normal).normalize();
    const o = new THREE.Vector3(...sectionPlane.origin);
    meshRef.current.position.copy(o);
    meshRef.current.lookAt(o.clone().add(n));
  });

  if (!sectionPlane.enabled) return null;

  return (
    <>
      {/* Visual plane indicator */}
      <mesh ref={meshRef}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial
          color="#ff6b00"
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Section outline ring */}
      <mesh ref={meshRef} position={sectionPlane.origin}>
        <ringGeometry args={[98, 100, 64]} />
        <meshBasicMaterial
          color="#ff6b00"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

/**
 * Section Controls — UI panel for adjusting the section plane.
 * Shows when section analysis is active.
 */
export function SectionControls() {
  const sectionPlane = useEditorStore((s) => s.sectionPlane);
  const setSectionPlane = useEditorStore((s) => s.setSectionPlane);
  const toggleSectionPlane = useEditorStore((s) => s.toggleSectionPlane);

  if (!sectionPlane.enabled) return null;

  const normals: { label: string; normal: [number, number, number] }[] = [
    { label: 'XY (Front)', normal: [0, 0, 1] },
    { label: 'XZ (Top)', normal: [0, 1, 0] },
    { label: 'YZ (Right)', normal: [1, 0, 0] },
  ];

  return (
    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 bg-fusion-surface/95 border border-fusion-border-light rounded-lg shadow-xl backdrop-blur-sm">
      <span className="text-[10px] text-fusion-orange font-medium">Section:</span>

      {/* Normal direction buttons */}
      {normals.map((n) => {
        const isActive =
          sectionPlane.normal[0] === n.normal[0] &&
          sectionPlane.normal[1] === n.normal[1] &&
          sectionPlane.normal[2] === n.normal[2];
        return (
          <button
            key={n.label}
            className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${
              isActive
                ? 'bg-fusion-orange/15 text-fusion-orange border-fusion-orange/40'
                : 'bg-fusion-surface text-fusion-text-secondary border-fusion-border-light hover:bg-fusion-hover'
            }`}
            onClick={() => setSectionPlane({ normal: n.normal })}
          >
            {n.label}
          </button>
        );
      })}

      {/* Offset slider */}
      <div className="flex items-center gap-1 ml-2">
        <span className="text-[9px] text-fusion-text-disabled">Offset:</span>
        <input
          type="range"
          min={-100}
          max={100}
          step={0.5}
          value={sectionPlane.origin[
            sectionPlane.normal[0] === 1 ? 0 : sectionPlane.normal[1] === 1 ? 1 : 2
          ]}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            const idx = sectionPlane.normal[0] === 1 ? 0 : sectionPlane.normal[1] === 1 ? 1 : 2;
            const origin: [number, number, number] = [...sectionPlane.origin];
            origin[idx] = val;
            setSectionPlane({ origin });
          }}
          className="w-24 h-1 accent-fusion-orange"
        />
        <span className="text-[9px] text-fusion-text-secondary font-mono w-10 text-right">
          {sectionPlane.origin[
            sectionPlane.normal[0] === 1 ? 0 : sectionPlane.normal[1] === 1 ? 1 : 2
          ].toFixed(1)}
        </span>
      </div>

      {/* Close */}
      <button
        className="ml-2 px-2 py-0.5 text-[9px] text-fusion-text-disabled hover:text-fusion-error border border-fusion-border-light rounded transition-colors"
        onClick={toggleSectionPlane}
      >
        Close
      </button>
    </div>
  );
}
