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
        <div className="flex items-center justify-center w-full h-full bg-editor-bg text-editor-error text-sm p-4">
          <div className="text-center">
            <p className="font-bold mb-2">3D Viewport Error</p>
            <p className="text-editor-muted text-xs">{this.state.error}</p>
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
    case 'move':
      return 'translate';
    case 'rotate':
      return 'rotate';
    case 'scale':
      return 'scale';
    default:
      return null;
  }
}

// ────────────────────────────────────────────
// Single interactive entity mesh
// ────────────────────────────────────────────
function EntityMesh({
  id,
  name,
  isSelected,
  position,
  rotation,
  scale,
}: {
  id: string;
  name: string;
  isSelected: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const activeTool = useEditorStore((s) => s.activeTool);
  const transformMode = toolToTransformMode(activeTool);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      useEditorStore.getState().select(id);
    },
    [id]
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

  return (
    <>
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={handleClick}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <boxGeometry args={[20, 20, 20]} />
        <meshStandardMaterial
          color={isSelected ? '#40b4ff' : '#808090'}
          metalness={0.15}
          roughness={0.55}
        />
        {isSelected && (
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(20.1, 20.1, 20.1)]} />
            <lineBasicMaterial color="#40b4ff" />
          </lineSegments>
        )}
      </mesh>

      {/* Entity label */}
      {isSelected && meshRef.current && (
        <Html position={[position[0], position[1] + 13, position[2]]} center>
          <div className="bg-editor-surface/90 text-editor-accent text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap border border-editor-border">
            {name}
          </div>
        </Html>
      )}

      {/* Transform gizmo when tool matches */}
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
// Sketch overlay (2D line drawing on the ground plane)
// ────────────────────────────────────────────
function SketchOverlay() {
  const sketchPoints = useEditorStore((s) => s.sketchPoints);
  const { camera, raycaster, gl } = useThree();
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  useEffect(() => {
    const canvas = gl.domElement;

    const handlePointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane.current, hit)) {
        // Snap to 1-unit grid
        const snapped = {
          x: Math.round(hit.x),
          y: Math.round(hit.z),
        };
        useEditorStore.getState().addSketchPoint(snapped);
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    return () => canvas.removeEventListener('pointerdown', handlePointerDown);
  }, [camera, raycaster, gl]);

  if (sketchPoints.length < 2) {
    return (
      <>
        {/* Draw dots for individual points */}
        {sketchPoints.map((pt, i) => (
          <mesh key={i} position={[pt.x, 0.05, pt.y]}>
            <sphereGeometry args={[0.4, 8, 8]} />
            <meshBasicMaterial color="#40b4ff" />
          </mesh>
        ))}
        {/* Sketch plane indicator */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial
            color="#40b4ff"
            transparent
            opacity={0.03}
            side={THREE.DoubleSide}
          />
        </mesh>
      </>
    );
  }

  const linePoints: [number, number, number][] = sketchPoints.map((p) => [
    p.x,
    0.05,
    p.y,
  ]);

  return (
    <>
      {/* Sketch plane indicator */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial
          color="#40b4ff"
          transparent
          opacity={0.03}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Sketch lines */}
      <Line
        points={linePoints}
        color="#40b4ff"
        lineWidth={2}
      />

      {/* Sketch vertices */}
      {sketchPoints.map((pt, i) => (
        <mesh key={i} position={[pt.x, 0.05, pt.y]}>
          <sphereGeometry args={[0.4, 8, 8]} />
          <meshBasicMaterial color="#60c8ff" />
        </mesh>
      ))}

      {/* Show coordinates on last point */}
      {sketchPoints.length > 0 && (
        <Html
          position={[
            sketchPoints[sketchPoints.length - 1].x,
            1,
            sketchPoints[sketchPoints.length - 1].y,
          ]}
          center
        >
          <div className="bg-editor-surface/90 text-editor-accent text-[9px] px-1 py-0.5 rounded border border-editor-border font-mono">
            ({sketchPoints[sketchPoints.length - 1].x},{' '}
            {sketchPoints[sketchPoints.length - 1].y})
          </div>
        </Html>
      )}
    </>
  );
}

// ────────────────────────────────────────────
// Measure tool (distance between two clicked points)
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
        -((e.clientY - rect.top) / rect.height) * 2 + 1
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
        <div className="bg-editor-surface/90 text-yellow-400 text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/30 font-mono">
          {dist.toFixed(2)} mm
        </div>
      </Html>
    </>
  );
}

// ────────────────────────────────────────────
// Keyboard shortcuts hook
// ────────────────────────────────────────────
function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const store = useEditorStore.getState();
      switch (e.key.toLowerCase()) {
        case 'v':
          store.setTool('select');
          break;
        case 'g':
          store.setTool('move');
          break;
        case 'r':
          store.setTool('rotate');
          break;
        case 's':
          if (!e.ctrlKey && !e.metaKey) store.setTool('scale');
          break;
        case 'k':
          store.setTool('sketch');
          break;
        case 'e':
          store.setTool('extrude');
          break;
        case 'f':
          store.setTool('fillet');
          break;
        case 'b':
          store.setTool('boolean');
          break;
        case 'm':
          store.setTool('measure');
          break;
        case 'escape':
          store.clearSelection();
          store.setTool('select');
          store.clearSketch();
          break;
        case 'delete':
        case 'backspace':
          // Delete selected entities
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
// Main viewport canvas
// ────────────────────────────────────────────
function ViewportCanvas() {
  const entities = useEditorStore((s) => s.entities);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const showGrid = useEditorStore((s) => s.showGrid);
  const showAxes = useEditorStore((s) => s.showAxes);
  const activeTool = useEditorStore((s) => s.activeTool);

  useKeyboardShortcuts();

  const isSketchMode = activeTool === 'sketch';
  const isMeasureMode = activeTool === 'measure';

  return (
    <Canvas
      camera={{ position: [30, 25, 30], fov: 50, near: 0.1, far: 10000 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor('#1e1e2e');
      }}
      onPointerMissed={() => {
        // Click on empty space → deselect
        if (!isSketchMode && !isMeasureMode) {
          useEditorStore.getState().clearSelection();
        }
      }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#b0c4ff', '#3a3a5a', 0.6]} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      {/* Camera controls — disabled during transforms */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.5}
        panSpeed={0.5}
        zoomSpeed={1.2}
        enabled={!isSketchMode}
      />

      {/* Grid */}
      {showGrid && (
        <Grid
          args={[200, 200]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#3a3a5a"
          sectionSize={10}
          sectionThickness={1}
          sectionColor="#4a4a6a"
          fadeDistance={100}
          fadeStrength={1}
          followCamera={false}
        />
      )}

      {/* Axis gizmo */}
      {showAxes && (
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={['#f87171', '#4ade80', '#60a5fa']}
            labelColor="white"
          />
        </GizmoHelper>
      )}

      {/* Ground reference axes */}
      <Line points={[[-100, 0, 0], [100, 0, 0]]} color="#f87171" lineWidth={1} transparent opacity={0.3} />
      <Line points={[[0, 0, -100], [0, 0, 100]]} color="#60a5fa" lineWidth={1} transparent opacity={0.3} />
      <Line points={[[0, -100, 0], [0, 100, 0]]} color="#4ade80" lineWidth={1} transparent opacity={0.15} />

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
        />
      ))}

      {/* Sketch mode overlay */}
      {isSketchMode && <SketchOverlay />}

      {/* Measure mode overlay */}
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
