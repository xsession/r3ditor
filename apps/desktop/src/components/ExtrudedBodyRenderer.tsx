import { useEditorStore, type ExtrudedBody } from '../store/editorStore';
import { Html } from '@react-three/drei';
import { useMemo, useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';

/**
 * ExtrudedBodyRenderer — Renders extruded 3D bodies with real mesh geometry.
 *
 * FreeCAD / Fusion 360 behavior:
 * - Extruded bodies are rendered as solid 3D meshes with proper shading
 * - Faces can be highlighted on hover (for face selection → sketch-on-face)
 * - When selection filter is 'face', clicking a face starts a new sketch on it
 * - Selected bodies show blue highlight; hovered faces show cyan overlay
 */

function ExtrudedBodyMesh({ body }: { body: ExtrudedBody }) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const selectionFilter = useEditorStore((s) => s.selectionFilter);
  const viewStyle = useEditorStore((s) => s.viewStyle);
  const isSelected = selectedIds.includes(body.id);
  const meshRef = useRef<THREE.Mesh>(null!);

  // Build Three.js BufferGeometry from mesh data
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices = new Float32Array(body.meshVertices);
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(body.meshIndices);
    geo.computeVertexNormals();
    return geo;
  }, [body.meshVertices, body.meshIndices]);

  // Edge geometry for wireframe overlay
  const edgesGeo = useMemo(() => {
    return new THREE.EdgesGeometry(geometry, 15); // 15° threshold for edge detection
  }, [geometry]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();

      if (selectionFilter === 'face' && e.faceIndex != null) {
        // Find which ExtrudedFace this triangle belongs to
        const triIndex = e.faceIndex;
        const faceIdx = body.faces.findIndex((f) =>
          triIndex >= f.startTriangle && triIndex < f.startTriangle + f.triangleCount
        );

        if (faceIdx >= 0) {
          // Start sketching on this face
          useEditorStore.getState().beginSketchOnFace(body.id, faceIdx);
          return;
        }
      }

      useEditorStore.getState().select(body.id);
    },
    [body.id, body.faces, selectionFilter],
  );

  if (!body.visible) return null;

  const showSolid = viewStyle !== 'wireframe';
  const showEdges = viewStyle === 'shadedEdges' || viewStyle === 'wireframe' || viewStyle === 'hidden' || isSelected;
  const solidColor = isSelected ? '#40b4ff' : '#808090';
  const edgeColor = isSelected ? '#40b4ff' : viewStyle === 'wireframe' ? '#a0a0b0' : '#555566';

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={geometry}
        position={body.transform.position}
        rotation={body.transform.rotation as unknown as THREE.Euler}
        scale={body.transform.scale}
        onClick={handleClick}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
        userData={{ entityId: body.id, isExtrudedBody: true }}
      >
        {showSolid ? (
          <meshStandardMaterial
            color={solidColor}
            metalness={0.15}
            roughness={0.55}
            transparent={viewStyle === 'hidden'}
            opacity={viewStyle === 'hidden' ? 0.05 : 1}
            side={THREE.DoubleSide}
          />
        ) : (
          <meshBasicMaterial visible={false} />
        )}
      </mesh>

      {/* Edge overlay */}
      {showEdges && (
        <lineSegments
          geometry={edgesGeo}
          position={body.transform.position}
          rotation={body.transform.rotation as unknown as THREE.Euler}
          scale={body.transform.scale}
        >
          <lineBasicMaterial
            color={edgeColor}
            transparent
            opacity={viewStyle === 'hidden' ? 0.4 : 1}
          />
        </lineSegments>
      )}

      {/* Name label when selected */}
      {isSelected && (
        <Html position={body.transform.position} center>
          <div className="bg-fusion-surface/90 text-fusion-blue text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap border border-fusion-border-light pointer-events-none"
               style={{ transform: 'translateY(-40px)' }}>
            {body.name}
            {selectionFilter === 'face' && (
              <span className="text-cyan-400 ml-1">• Click a face to sketch on it</span>
            )}
          </div>
        </Html>
      )}
    </>
  );
}

export function ExtrudedBodyRenderer() {
  const extrudedBodies = useEditorStore((s) => s.extrudedBodies);

  return (
    <>
      {extrudedBodies.map((body) => (
        <ExtrudedBodyMesh key={body.id} body={body} />
      ))}
    </>
  );
}
