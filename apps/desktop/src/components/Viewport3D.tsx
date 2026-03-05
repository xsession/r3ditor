import { Canvas, useThree, ThreeEvent } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  TransformControls,
  Line,
  Html,
} from '@react-three/drei';
import { useEditorStore, type Tool } from '../store/editorStore';
import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

// ────────────────────────────────────────────
// Error Boundary
// ────────────────────────────────────────────
class ViewportErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center w-full h-full bg-fusion-panel text-red-400 text-sm p-4">
          <div className="text-center">
            <p className="font-bold mb-2">3D Viewport Error</p>
            <p className="text-fusion-text-disabled text-xs">{this.state.error}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ────────────────────────────────────────────
// Transform mode mapping
// ────────────────────────────────────────────
function toolToTransformMode(tool: Tool): 'translate' | 'rotate' | 'scale' | null {
  switch (tool) {
    case 'move': return 'translate';
    case 'rotate': return 'rotate';
    case 'scale': return 'scale';
    default: return null;
  }
}

// ────────────────────────────────────────────
// Single interactive entity mesh
// ────────────────────────────────────────────
function EntityMesh({
  id, name, isSelected, position, rotation, scale, entityType, suppressed,
}: {
  id: string;
  name: string;
  isSelected: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  entityType: string;
  suppressed: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const activeTool = useEditorStore((s) => s.activeTool);
  const transformMode = toolToTransformMode(activeTool);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      useEditorStore.getState().select(id);
    },
    [id],
  );

  const handleTransformChange = useCallback(() => {
    if (!meshRef.current) return;
    const pos = meshRef.current.position;
    const rot = meshRef.current.rotation;
    const scl = meshRef.current.scale;
    useEditorStore.getState().updateEntityTransform(id, {
      position: [pos.x, pos.y, pos.z],
      rotation: [rot.x, rot.y, rot.z],
      scale: [scl.x, scl.y, scl.z],
    });
  }, [id]);

  if (suppressed) return null;

  // Choose geometry based on type
  const geometry = entityType === 'cylinder'
    ? <cylinderGeometry args={[10, 10, 30, 32]} />
    : entityType === 'sphere'
      ? <sphereGeometry args={[10, 32, 16]} />
      : <boxGeometry args={[20, 20, 20]} />;

  const edgesGeo = entityType === 'cylinder'
    ? new THREE.CylinderGeometry(10.05, 10.05, 30.1, 32)
    : entityType === 'sphere'
      ? new THREE.SphereGeometry(10.05, 32, 16)
      : new THREE.BoxGeometry(20.1, 20.1, 20.1);

  return (
    <>
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={handleClick}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        {geometry}
        <meshStandardMaterial
          color={isSelected ? '#40b4ff' : '#808090'}
          metalness={0.15}
          roughness={0.55}
        />
        {isSelected && (
          <lineSegments>
            <edgesGeometry args={[edgesGeo]} />
            <lineBasicMaterial color="#40b4ff" />
          </lineSegments>
        )}
      </mesh>

      {/* Entity label */}
      {isSelected && meshRef.current && (
        <Html position={[position[0], position[1] + 13, position[2]]} center>
          <div className="bg-fusion-surface/90 text-fusion-blue text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap border border-fusion-border-light">
            {name}
          </div>
        </Html>
      )}

      {/* Transform gizmo */}
      {isSelected && transformMode && meshRef.current && (
        <TransformControls
          object={meshRef.current}
          mode={transformMode}
          size={0.8}
          onObjectChange={handleTransformChange}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────
// Sketch overlay (2D line drawing on a plane)
// ────────────────────────────────────────────
function SketchOverlay() {
  const sketchPoints = useEditorStore((s) => s.sketchPoints);
  const sketchPlane = useEditorStore((s) => s.sketchPlane);
  const { camera, raycaster, gl } = useThree();

  // Determine plane normal/position based on sketchPlane
  const planeNormal = sketchPlane === 'XZ' ? new THREE.Vector3(0, 1, 0)
    : sketchPlane === 'YZ' ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 0, 1); // XY default
  const groundPlane = useRef(new THREE.Plane(planeNormal, 0));

  useEffect(() => {
    groundPlane.current = new THREE.Plane(planeNormal, 0);
  }, [sketchPlane]);

  useEffect(() => {
    const canvas = gl.domElement;
    const handlePointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane.current, hit)) {
        useEditorStore.getState().addSketchPoint({
          x: Math.round(hit.x),
          y: Math.round(hit.y || hit.z),
          id: '',
          isConstruction: false,
        });
      }
    };
    canvas.addEventListener('pointerdown', handlePointerDown);
    return () => canvas.removeEventListener('pointerdown', handlePointerDown);
  }, [camera, raycaster, gl, sketchPlane]);

  // Convert sketch points to 3D positions based on plane
  const to3D = (pt: { x: number; y: number }): [number, number, number] => {
    if (sketchPlane === 'XZ') return [pt.x, 0.05, pt.y];
    if (sketchPlane === 'YZ') return [0.05, pt.x, pt.y];
    return [pt.x, pt.y, 0.05]; // XY
  };

  const planeRotation: [number, number, number] = sketchPlane === 'XZ'
    ? [-Math.PI / 2, 0, 0]
    : sketchPlane === 'YZ'
    ? [0, Math.PI / 2, 0]
    : [0, 0, 0];

  return (
    <>
      {/* Sketch plane indicator */}
      <mesh rotation={planeRotation} position={[0, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color="#40b4ff" transparent opacity={0.03} side={THREE.DoubleSide} />
      </mesh>

      {/* Lines */}
      {sketchPoints.length >= 2 && (
        <Line
          points={sketchPoints.map((p) => to3D(p))}
          color="#40b4ff"
          lineWidth={2}
        />
      )}

      {/* Vertices */}
      {sketchPoints.map((pt, i) => (
        <mesh key={i} position={to3D(pt)}>
          <sphereGeometry args={[0.4, 8, 8]} />
          <meshBasicMaterial color="#60c8ff" />
        </mesh>
      ))}

      {/* Coordinates on last point */}
      {sketchPoints.length > 0 && (
        <Html position={to3D(sketchPoints[sketchPoints.length - 1])} center>
          <div className="bg-fusion-surface/90 text-fusion-blue text-[9px] px-1 py-0.5 rounded border border-fusion-border-light font-mono">
            ({sketchPoints[sketchPoints.length - 1].x}, {sketchPoints[sketchPoints.length - 1].y})
          </div>
        </Html>
      )}
    </>
  );
}

// ────────────────────────────────────────────
// Measure overlay
// ────────────────────────────────────────────
function MeasureOverlay() {
  const [points, setPoints] = React.useState<THREE.Vector3[]>([]);
  const { camera, raycaster, gl } = useThree();
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  useEffect(() => {
    const canvas = gl.domElement;
    const handlePointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane.current, hit)) {
        setPoints((prev) => (prev.length >= 2 ? [hit.clone()] : [...prev, hit.clone()]));
      }
    };
    canvas.addEventListener('pointerdown', handlePointerDown);
    return () => canvas.removeEventListener('pointerdown', handlePointerDown);
  }, [camera, raycaster, gl]);

  if (points.length < 2) {
    return (
      <>
        {points.map((pt, i) => (
          <mesh key={i} position={pt}>
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
        ))}
      </>
    );
  }

  const dist = points[0].distanceTo(points[1]);
  const mid = new THREE.Vector3().lerpVectors(points[0], points[1], 0.5);

  return (
    <>
      <Line
        points={[points[0].toArray(), points[1].toArray()]}
        color="#fbbf24"
        lineWidth={2}
        dashed
        dashSize={1}
        gapSize={0.5}
      />
      {points.map((pt, i) => (
        <mesh key={i} position={pt}>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      ))}
      <Html position={[mid.x, mid.y + 2, mid.z]} center>
        <div className="bg-fusion-surface/90 text-yellow-400 text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/30 font-mono">
          {dist.toFixed(2)} mm
        </div>
      </Html>
    </>
  );
}

// ────────────────────────────────────────────
// Keyboard shortcuts
// ────────────────────────────────────────────
function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const store = useEditorStore.getState();

      // If sketch is active, route sketch-specific shortcuts
      if (store.isSketchActive) {
        switch (e.key.toLowerCase()) {
          case 'l': store.setSketchTool('line'); return;
          case 'r': store.setSketchTool('rectangle'); return;
          case 'c': store.setSketchTool('circle'); return;
          case 'a': store.setSketchTool('arc3point'); return;
          case 'escape': store.cancelSketch(); return;
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v': store.setTool('select'); break;
        case 'g': store.setTool('move'); break;
        case 'r': store.setTool('rotate'); break;
        case 's':
          if (!e.ctrlKey && !e.metaKey) store.setTool('scale');
          break;
        case 'e': store.openFeatureDialog('extrude'); break;
        case 'f': store.openFeatureDialog('fillet'); break;
        case 'b': store.openFeatureDialog('boolean'); break;
        case 'm': store.setTool('measure'); break;
        case 'escape':
          store.clearSelection();
          store.setTool('select');
          store.closeFeatureDialog();
          break;
        case 'delete':
        case 'backspace':
          if (store.selectedIds.length > 0) {
            store.selectedIds.forEach((id) => store.removeEntity(id));
            store.clearSelection();
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

// ────────────────────────────────────────────
// Reference planes (shown when toggled)
// ────────────────────────────────────────────
function ReferencePlanes() {
  const showPlanes = useEditorStore((s) => s.showPlanes);
  if (!showPlanes) return null;

  return (
    <>
      {/* XY – blue */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>
      {/* XZ – green */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>
      {/* YZ – red */}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial color="#f87171" transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

// ────────────────────────────────────────────
// Main viewport canvas
// ────────────────────────────────────────────
function ViewportCanvas() {
  const entities = useEditorStore((s) => s.entities);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const showGrid = useEditorStore((s) => s.showGrid);
  const showAxes = useEditorStore((s) => s.showAxes);
  const isSketchActive = useEditorStore((s) => s.isSketchActive);
  const activeTool = useEditorStore((s) => s.activeTool);

  useKeyboardShortcuts();

  const isMeasureMode = activeTool === 'measure';

  return (
    <Canvas
      camera={{ position: [30, 25, 30], fov: 50, near: 0.1, far: 10000 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => { gl.setClearColor('#444444'); }}
      onPointerMissed={() => {
        if (!isSketchActive && !isMeasureMode) {
          useEditorStore.getState().clearSelection();
        }
      }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#c0c8d8', '#4a4a4a', 0.6]} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.5}
        panSpeed={0.5}
        zoomSpeed={1.2}
        enabled={!isSketchActive}
      />

      {/* Grid */}
      {showGrid && (
        <Grid
          args={[200, 200]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#505050"
          sectionSize={10}
          sectionThickness={1}
          sectionColor="#606060"
          fadeDistance={100}
          fadeStrength={1}
          followCamera={false}
        />
      )}

      {/* Axis gizmo (Onshape-style ViewCube position) */}
      {showAxes && (
        <GizmoHelper alignment="top-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={['#f87171', '#4ade80', '#60a5fa']}
            labelColor="white"
          />
        </GizmoHelper>
      )}

      {/* Reference axes */}
      <Line points={[[-100, 0, 0], [100, 0, 0]]} color="#f87171" lineWidth={1} transparent opacity={0.3} />
      <Line points={[[0, 0, -100], [0, 0, 100]]} color="#60a5fa" lineWidth={1} transparent opacity={0.3} />
      <Line points={[[0, -100, 0], [0, 100, 0]]} color="#4ade80" lineWidth={1} transparent opacity={0.15} />

      {/* Reference planes */}
      <ReferencePlanes />

      {/* Entities */}
      {entities.map((entity, idx) => (
        <EntityMesh
          key={entity.id}
          id={entity.id}
          name={entity.name}
          isSelected={selectedIds.includes(entity.id)}
          position={entity.transform?.position ?? [idx * 25, 10, 0]}
          rotation={entity.transform?.rotation ?? [0, 0, 0]}
          scale={entity.transform?.scale ?? [1, 1, 1]}
          entityType={entity.type}
          suppressed={entity.suppressed}
        />
      ))}

      {/* Sketch overlay */}
      {isSketchActive && <SketchOverlay />}

      {/* Measure overlay */}
      {isMeasureMode && <MeasureOverlay />}
    </Canvas>
  );
}

// ────────────────────────────────────────────
// Export
// ────────────────────────────────────────────
export function Viewport3D() {
  return (
    <ViewportErrorBoundary>
      <ViewportCanvas />
    </ViewportErrorBoundary>
  );
}
