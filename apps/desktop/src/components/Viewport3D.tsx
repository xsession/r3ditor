import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  TransformControls,
  Line,
  Html,
} from '@react-three/drei';
import { useEditorStore, type Tool, type SketchPlaneInfo } from '../store/editorStore';
import { ViewCommandHandler } from './ViewCommandHandler';
import { SectionPlane } from './SectionAnalysis';
import { SketchConstraintGlyphs } from './SketchConstraintGlyphs';
import { SketchDimensionAnnotations } from './SketchDimensionAnnotations';
import { SnapIndicators } from './SnapIndicators';
import { SubElementPicker } from './SubElementPicker';
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
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
// Utility: 2D sketch coords → 3D world position
// ────────────────────────────────────────────
function sketchTo3D(
  pt: { x: number; y: number },
  info: SketchPlaneInfo,
): [number, number, number] {
  const o = info.origin;
  const u = info.uAxis;
  const v = info.vAxis;
  return [
    o[0] + pt.x * u[0] + pt.y * v[0],
    o[1] + pt.x * u[1] + pt.y * v[1],
    o[2] + pt.x * u[2] + pt.y * v[2],
  ];
}

/** Project a world-space intersection point onto sketch-local 2D coords */
function worldToSketch2D(
  worldPt: THREE.Vector3,
  info: SketchPlaneInfo,
): { x: number; y: number } {
  const dx = worldPt.x - info.origin[0];
  const dy = worldPt.y - info.origin[1];
  const dz = worldPt.z - info.origin[2];
  const u = new THREE.Vector3(...info.uAxis);
  const v = new THREE.Vector3(...info.vAxis);
  const d = new THREE.Vector3(dx, dy, dz);
  return { x: d.dot(u), y: d.dot(v) };
}

/** Snap value to grid (round to nearest unit) */
function snap(val: number, gridSize = 1): number {
  return Math.round(val / gridSize) * gridSize;
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
  const viewStyle = useEditorStore((s) => s.viewStyle);
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

  const geometry = entityType === 'cylinder'
    ? <cylinderGeometry args={[10, 10, 30, 32]} />
    : entityType === 'sphere'
      ? <sphereGeometry args={[10, 32, 16]} />
      : <boxGeometry args={[20, 20, 20]} />;

  const edgesGeo = useMemo(() => {
    return entityType === 'cylinder'
      ? new THREE.CylinderGeometry(10.05, 10.05, 30.1, 32)
      : entityType === 'sphere'
        ? new THREE.SphereGeometry(10.05, 32, 16)
        : new THREE.BoxGeometry(20.1, 20.1, 20.1);
  }, [entityType]);

  // View style determines material and edge rendering
  const showSolid = viewStyle !== 'wireframe';
  const showEdges = viewStyle === 'shadedEdges' || viewStyle === 'wireframe' || viewStyle === 'hidden' || isSelected;
  const solidColor = isSelected ? '#40b4ff' : '#808090';
  const edgeColor = isSelected ? '#40b4ff' : viewStyle === 'wireframe' ? '#a0a0b0' : '#555566';

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
        {showSolid ? (
          <meshStandardMaterial
            color={solidColor}
            metalness={0.15}
            roughness={0.55}
            transparent={viewStyle === 'hidden'}
            opacity={viewStyle === 'hidden' ? 0.05 : 1}
          />
        ) : (
          <meshBasicMaterial
            visible={false}
          />
        )}
        {showEdges && (
          <lineSegments>
            <edgesGeometry args={[edgesGeo]} />
            <lineBasicMaterial color={edgeColor} transparent opacity={viewStyle === 'hidden' ? 0.4 : 1} />
          </lineSegments>
        )}
      </mesh>

      {isSelected && meshRef.current && (
        <Html position={[position[0], position[1] + 13, position[2]]} center>
          <div className="bg-fusion-surface/90 text-fusion-blue text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap border border-fusion-border-light">
            {name}
          </div>
        </Html>
      )}

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
// Plane Selection Overlay
// Shown during sketchPhase === 'selectPlane'
// Renders 3 clickable reference planes with hover highlight
// ────────────────────────────────────────────
function SelectablePlane({
  color,
  hoverColor,
  rotation,
  labelPosition,
  label,
  planeInfo,
}: {
  color: string;
  hoverColor: string;
  rotation: [number, number, number];
  labelPosition: [number, number, number];
  label: string;
  planeInfo: SketchPlaneInfo;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group>
      <mesh
        rotation={rotation}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
        onClick={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'default';
          useEditorStore.getState().selectSketchPlane(planeInfo);
        }}
      >
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial
          color={hovered ? hoverColor : color}
          transparent
          opacity={hovered ? 0.25 : 0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Plane label */}
      <Html position={labelPosition} center>
        <div
          className={`text-[11px] font-bold px-2 py-0.5 rounded ${hovered ? 'bg-white/20' : 'bg-black/30'} backdrop-blur-sm border transition-all cursor-pointer select-none`}
          style={{
            color: hovered ? hoverColor : color,
            borderColor: hovered ? hoverColor : 'transparent',
          }}
          onClick={() => {
            document.body.style.cursor = 'default';
            useEditorStore.getState().selectSketchPlane(planeInfo);
          }}
        >
          {label}
        </div>
      </Html>
      {/* Border outline */}
      <lineLoop rotation={rotation}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={new Float32Array([
              -40, -40, 0, 40, -40, 0, 40, 40, 0, -40, 40, 0,
            ])}
            count={4}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={hovered ? hoverColor : color} transparent opacity={hovered ? 0.8 : 0.3} />
      </lineLoop>
    </group>
  );
}

function PlaneSelectionOverlay() {
  const xyInfo: SketchPlaneInfo = { type: 'XY', origin: [0, 0, 0], normal: [0, 0, 1], uAxis: [1, 0, 0], vAxis: [0, 1, 0] };
  const xzInfo: SketchPlaneInfo = { type: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1] };
  const yzInfo: SketchPlaneInfo = { type: 'YZ', origin: [0, 0, 0], normal: [1, 0, 0], uAxis: [0, 1, 0], vAxis: [0, 0, 1] };

  return (
    <>
      {/* XY plane – blue */}
      <SelectablePlane
        color="#60a5fa"
        hoverColor="#93c5fd"
        rotation={[0, 0, 0]}
        labelPosition={[42, 0, 0]}
        label="XY Plane"
        planeInfo={xyInfo}
      />
      {/* XZ plane – green */}
      <SelectablePlane
        color="#4ade80"
        hoverColor="#86efac"
        rotation={[-Math.PI / 2, 0, 0]}
        labelPosition={[42, 0, 0]}
        label="XZ Plane"
        planeInfo={xzInfo}
      />
      {/* YZ plane – red */}
      <SelectablePlane
        color="#f87171"
        hoverColor="#fca5a5"
        rotation={[0, Math.PI / 2, 0]}
        labelPosition={[0, 0, 42]}
        label="YZ Plane"
        planeInfo={yzInfo}
      />
    </>
  );
}

// ────────────────────────────────────────────
// Camera Projection Handler
// Switches between perspective and orthographic when store changes
// ────────────────────────────────────────────
function CameraProjectionHandler() {
  const cameraProjection = useEditorStore((s) => s.cameraProjection);
  const { camera, size } = useThree();
  const prevProjection = useRef(cameraProjection);

  useEffect(() => {
    if (cameraProjection === prevProjection.current) return;
    prevProjection.current = cameraProjection;

    if (cameraProjection === 'orthographic' && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const perspCam = camera as THREE.PerspectiveCamera;
      const dist = camera.position.length();
      const halfH = dist * Math.tan(THREE.MathUtils.degToRad(perspCam.fov / 2));

      // Morph into orthographic-like by using very narrow FOV trick
      // R3F manages the camera type from Canvas props, so we adjust frustum
      perspCam.fov = 1; // near-orthographic
      perspCam.near = 0.1;
      perspCam.far = 100000;
      perspCam.updateProjectionMatrix();
      // Move camera much further back to compensate for narrow FOV
      const newDist = halfH / Math.tan(THREE.MathUtils.degToRad(0.5));
      camera.position.normalize().multiplyScalar(Math.min(newDist, 50000));
    } else if (cameraProjection === 'perspective' && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const perspCam = camera as THREE.PerspectiveCamera;
      perspCam.fov = 50;
      perspCam.near = 0.1;
      perspCam.far = 10000;
      perspCam.updateProjectionMatrix();
      // Move camera to reasonable distance
      const dir = camera.position.clone().normalize();
      camera.position.copy(dir.multiplyScalar(50));
    }
  }, [cameraProjection, camera, size]);

  return null;
}

// ────────────────────────────────────────────
// Camera Animator
// Smoothly moves the camera to look straight down at the sketch plane
// ────────────────────────────────────────────
function CameraAnimator() {
  const sketchPlaneInfo = useEditorStore((s) => s.sketchPlaneInfo);
  const sketchPhase = useEditorStore((s) => s.sketchPhase);
  const { camera } = useThree();
  const animating = useRef(false);
  const targetPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const startPos = useRef(new THREE.Vector3());
  const startLookAt = useRef(new THREE.Vector3());
  const progress = useRef(0);
  const prevPlane = useRef<string | null>(null);

  // Trigger animation when plane is selected (phase changes to 'drawing')
  useEffect(() => {
    if (sketchPhase !== 'drawing' || !sketchPlaneInfo) return;
    const planeKey = `${sketchPlaneInfo.type}-${sketchPlaneInfo.origin.join(',')}`;
    if (planeKey === prevPlane.current) return;
    prevPlane.current = planeKey;

    const origin = new THREE.Vector3(...sketchPlaneInfo.origin);
    const normal = new THREE.Vector3(...sketchPlaneInfo.normal);

    // Position the camera 80 units along the plane normal
    targetPos.current.copy(origin).addScaledVector(normal, 80);
    targetLookAt.current.copy(origin);
    startPos.current.copy(camera.position);

    // Get current look-at by casting forward
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    startLookAt.current.copy(camera.position).add(dir.multiplyScalar(50));

    progress.current = 0;
    animating.current = true;
  }, [sketchPhase, sketchPlaneInfo, camera]);

  useFrame((_, delta) => {
    if (!animating.current) return;
    progress.current = Math.min(1, progress.current + delta * 2.5); // ~0.4s animation
    const ease = 1 - Math.pow(1 - progress.current, 3); // cubic ease-out

    camera.position.lerpVectors(startPos.current, targetPos.current, ease);

    const currentLookAt = new THREE.Vector3().lerpVectors(startLookAt.current, targetLookAt.current, ease);
    camera.lookAt(currentLookAt);
    camera.updateProjectionMatrix();

    if (progress.current >= 1) {
      animating.current = false;
    }
  });

  return null;
}

// ────────────────────────────────────────────
// Sketch Drawing Overlay
// Handles click-drag-release for line/rectangle/circle tools
// ────────────────────────────────────────────
function SketchDrawingOverlay() {
  const sketchPlaneInfo = useEditorStore((s) => s.sketchPlaneInfo);
  const activeSketchTool = useEditorStore((s) => s.activeSketchTool);
  const sketchPoints = useEditorStore((s) => s.sketchPoints);
  const sketchSegments = useEditorStore((s) => s.sketchSegments);
  const drawState = useEditorStore((s) => s.drawState);
  const { camera, raycaster, gl } = useThree();

  // Build the THREE.Plane for raycasting
  const sketchPlane = useMemo(() => {
    if (!sketchPlaneInfo) return new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const normal = new THREE.Vector3(...sketchPlaneInfo.normal);
    const origin = new THREE.Vector3(...sketchPlaneInfo.origin);
    return new THREE.Plane(normal, -normal.dot(origin));
  }, [sketchPlaneInfo]);

  // Helper: get 2D sketch coords from mouse event
  const getSketch2D = useCallback(
    (e: PointerEvent): { x: number; y: number } | null => {
      if (!sketchPlaneInfo) return null;
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(sketchPlane, hit)) return null;
      const local = worldToSketch2D(hit, sketchPlaneInfo);
      return { x: snap(local.x), y: snap(local.y) };
    },
    [camera, raycaster, gl, sketchPlane, sketchPlaneInfo],
  );

  // Pointer event handlers for click-drag-release
  useEffect(() => {
    const canvas = gl.domElement;
    const store = useEditorStore.getState;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // left click only
      const pt = getSketch2D(e);
      if (!pt) return;
      useEditorStore.setState({
        drawState: { active: true, startPoint: pt, currentPoint: pt },
      });
    };

    const onPointerMove = (e: PointerEvent) => {
      const ds = store().drawState;
      if (!ds.active) return;
      const pt = getSketch2D(e);
      if (!pt) return;
      useEditorStore.setState({
        drawState: { ...ds, currentPoint: pt },
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const ds = store().drawState;
      if (!ds.active || !ds.startPoint || !ds.currentPoint) {
        useEditorStore.setState({
          drawState: { active: false, startPoint: null, currentPoint: null },
        });
        return;
      }

      const sx = ds.startPoint.x;
      const sy = ds.startPoint.y;
      const ex = ds.currentPoint.x;
      const ey = ds.currentPoint.y;
      const dxAbs = Math.abs(ex - sx);
      const dyAbs = Math.abs(ey - sy);
      const tool = store().activeSketchTool;

      const ptId = () => `pt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const segId = () => `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      // Only create entity if there was meaningful drag
      const minDrag = 0.5;
      if (dxAbs > minDrag || dyAbs > minDrag) {
        switch (tool) {
          case 'line': {
            const p1Id = ptId();
            const p2Id = ptId();
            store().addSketchPoint({ id: p1Id, x: sx, y: sy, isConstruction: false });
            store().addSketchPoint({ id: p2Id, x: ex, y: ey, isConstruction: false });
            store().addSketchSegment({ id: segId(), type: 'line', points: [p1Id, p2Id], isConstruction: false });
            break;
          }
          case 'rectangle':
          case 'centerRectangle': {
            const idTL = ptId(), idTR = ptId(), idBR = ptId(), idBL = ptId();
            const left = Math.min(sx, ex);
            const right = Math.max(sx, ex);
            const bottom = Math.min(sy, ey);
            const top_ = Math.max(sy, ey);
            store().addSketchPoint({ id: idTL, x: left, y: top_, isConstruction: false });
            store().addSketchPoint({ id: idTR, x: right, y: top_, isConstruction: false });
            store().addSketchPoint({ id: idBR, x: right, y: bottom, isConstruction: false });
            store().addSketchPoint({ id: idBL, x: left, y: bottom, isConstruction: false });
            store().addSketchSegment({ id: segId(), type: 'line', points: [idTL, idTR], isConstruction: false });
            store().addSketchSegment({ id: segId(), type: 'line', points: [idTR, idBR], isConstruction: false });
            store().addSketchSegment({ id: segId(), type: 'line', points: [idBR, idBL], isConstruction: false });
            store().addSketchSegment({ id: segId(), type: 'line', points: [idBL, idTL], isConstruction: false });
            break;
          }
          case 'circle':
          case 'centerCircle': {
            const cId = ptId();
            const eId = ptId();
            const r = Math.sqrt(dxAbs * dxAbs + dyAbs * dyAbs);
            store().addSketchPoint({ id: cId, x: sx, y: sy, isConstruction: false });
            store().addSketchPoint({ id: eId, x: sx + r, y: sy, isConstruction: false });
            store().addSketchSegment({ id: segId(), type: 'circle', points: [cId, eId], isConstruction: false });
            break;
          }
          case 'arc3point': {
            const p1 = ptId(), pm = ptId(), p2 = ptId();
            const mx = (sx + ex) / 2;
            const my = (sy + ey) / 2 + Math.max(dxAbs, dyAbs) * 0.4;
            store().addSketchPoint({ id: p1, x: sx, y: sy, isConstruction: false });
            store().addSketchPoint({ id: pm, x: snap(mx), y: snap(my), isConstruction: false });
            store().addSketchPoint({ id: p2, x: ex, y: ey, isConstruction: false });
            store().addSketchSegment({ id: segId(), type: 'arc', points: [p1, pm, p2], isConstruction: false });
            break;
          }
          default: {
            // Default: place a point at the release location
            store().addSketchPoint({ id: ptId(), x: ex, y: ey, isConstruction: false });
            break;
          }
        }
      } else {
        // Click without drag — place a point
        store().addSketchPoint({ id: ptId(), x: ex, y: ey, isConstruction: false });
      }

      useEditorStore.setState({
        drawState: { active: false, startPoint: null, currentPoint: null },
      });
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl, getSketch2D]);

  if (!sketchPlaneInfo) return null;

  const info = sketchPlaneInfo;

  // ── Build point lookup ──
  const pointMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const p of sketchPoints) m.set(p.id, p);
    return m;
  }, [sketchPoints]);

  // ── Convert committed segments to renderable geometry ──
  const segmentLines: [number, number, number][][] = [];
  const circleData: { center2D: { x: number; y: number }; radius: number }[] = [];

  for (const seg of sketchSegments) {
    if (seg.type === 'line') {
      const pts = seg.points.map((pid) => pointMap.get(pid)).filter(Boolean) as { x: number; y: number }[];
      if (pts.length >= 2) {
        segmentLines.push(pts.map((p) => sketchTo3D(p, info)));
      }
    } else if (seg.type === 'circle') {
      const cpt = pointMap.get(seg.points[0]);
      const ept = pointMap.get(seg.points[1]);
      if (cpt && ept) {
        const r = Math.sqrt((ept.x - cpt.x) ** 2 + (ept.y - cpt.y) ** 2);
        circleData.push({ center2D: cpt, radius: r });
      }
    } else if (seg.type === 'arc') {
      const pts = seg.points.map((pid) => pointMap.get(pid)).filter(Boolean) as { x: number; y: number }[];
      if (pts.length >= 3) {
        const arcPts: [number, number, number][] = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const x = (1 - t) * (1 - t) * pts[0].x + 2 * (1 - t) * t * pts[1].x + t * t * pts[2].x;
          const y = (1 - t) * (1 - t) * pts[0].y + 2 * (1 - t) * t * pts[1].y + t * t * pts[2].y;
          arcPts.push(sketchTo3D({ x, y }, info));
        }
        segmentLines.push(arcPts);
      }
    }
  }

  // ── Preview (rubber-band) while dragging ──
  let previewElement: React.ReactNode = null;
  if (drawState.active && drawState.startPoint && drawState.currentPoint) {
    const sp = drawState.startPoint;
    const cp = drawState.currentPoint;
    const s3d = sketchTo3D(sp, info);
    const c3d = sketchTo3D(cp, info);
    const tool = activeSketchTool;

    if (tool === 'line' || tool === 'spline') {
      previewElement = (
        <Line points={[s3d, c3d]} color="#fbbf24" lineWidth={1.5} dashed dashSize={0.5} gapSize={0.3} />
      );
    } else if (tool === 'rectangle' || tool === 'centerRectangle') {
      const left = Math.min(sp.x, cp.x);
      const right = Math.max(sp.x, cp.x);
      const top_ = Math.max(sp.y, cp.y);
      const bottom_ = Math.min(sp.y, cp.y);
      const tl = sketchTo3D({ x: left, y: top_ }, info);
      const tr = sketchTo3D({ x: right, y: top_ }, info);
      const br = sketchTo3D({ x: right, y: bottom_ }, info);
      const bl = sketchTo3D({ x: left, y: bottom_ }, info);
      previewElement = (
        <Line points={[tl, tr, br, bl, tl]} color="#fbbf24" lineWidth={1.5} dashed dashSize={0.5} gapSize={0.3} />
      );
    } else if (tool === 'circle' || tool === 'centerCircle') {
      const dx = cp.x - sp.x;
      const dy = cp.y - sp.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      const circlePts: [number, number, number][] = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        circlePts.push(sketchTo3D({ x: sp.x + r * Math.cos(angle), y: sp.y + r * Math.sin(angle) }, info));
      }
      previewElement = (
        <Line points={circlePts} color="#fbbf24" lineWidth={1.5} dashed dashSize={0.5} gapSize={0.3} />
      );
    } else if (tool === 'arc3point') {
      const mx = (sp.x + cp.x) / 2;
      const my = (sp.y + cp.y) / 2 + Math.max(Math.abs(cp.x - sp.x), Math.abs(cp.y - sp.y)) * 0.4;
      const arcPts: [number, number, number][] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const x = (1 - t) * (1 - t) * sp.x + 2 * (1 - t) * t * mx + t * t * cp.x;
        const y = (1 - t) * (1 - t) * sp.y + 2 * (1 - t) * t * my + t * t * cp.y;
        arcPts.push(sketchTo3D({ x, y }, info));
      }
      previewElement = (
        <Line points={arcPts} color="#fbbf24" lineWidth={1.5} dashed dashSize={0.5} gapSize={0.3} />
      );
    }
  }

  // ── Sketch plane indicator ──
  const planeRotation: [number, number, number] = info.type === 'XZ'
    ? [-Math.PI / 2, 0, 0]
    : info.type === 'YZ'
    ? [0, Math.PI / 2, 0]
    : [0, 0, 0];
  const planeColor = info.type === 'XZ' ? '#4ade80' : info.type === 'YZ' ? '#f87171' : '#60a5fa';

  return (
    <>
      {/* Sketch plane highlight */}
      <mesh rotation={planeRotation} position={info.origin}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color={planeColor} transparent opacity={0.03} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Sketch grid on the active plane */}
      <group rotation={planeRotation} position={info.origin}>
        {Array.from({ length: 41 }, (_, i) => {
          const v = (i - 20) * 5;
          const opacity = v % 10 === 0 ? 0.15 : 0.06;
          return (
            <React.Fragment key={`grid-${i}`}>
              <Line points={[[-100, v, 0.01], [100, v, 0.01]]} color={planeColor} lineWidth={0.5} transparent opacity={opacity} />
              <Line points={[[v, -100, 0.01], [v, 100, 0.01]]} color={planeColor} lineWidth={0.5} transparent opacity={opacity} />
            </React.Fragment>
          );
        })}
      </group>

      {/* Committed line segments */}
      {segmentLines.map((pts, i) => (
        <Line key={`seg-${i}`} points={pts} color="#40b4ff" lineWidth={2} />
      ))}

      {/* Committed circles */}
      {circleData.map((c, i) => {
        const circlePts: [number, number, number][] = [];
        for (let j = 0; j <= 64; j++) {
          const angle = (j / 64) * Math.PI * 2;
          circlePts.push(sketchTo3D({
            x: c.center2D.x + c.radius * Math.cos(angle),
            y: c.center2D.y + c.radius * Math.sin(angle),
          }, info));
        }
        return <Line key={`circ-${i}`} points={circlePts} color="#40b4ff" lineWidth={2} />;
      })}

      {/* Vertices */}
      {sketchPoints.map((pt) => {
        const pos = sketchTo3D(pt, info);
        return (
          <mesh key={pt.id} position={pos}>
            <sphereGeometry args={[0.35, 8, 8]} />
            <meshBasicMaterial color="#60c8ff" />
          </mesh>
        );
      })}

      {/* Coordinate label at last point */}
      {sketchPoints.length > 0 && (
        <Html position={sketchTo3D(sketchPoints[sketchPoints.length - 1], info)} center>
          <div className="bg-fusion-surface/90 text-fusion-blue text-[9px] px-1 py-0.5 rounded border border-fusion-border-light font-mono pointer-events-none">
            ({sketchPoints[sketchPoints.length - 1].x}, {sketchPoints[sketchPoints.length - 1].y})
          </div>
        </Html>
      )}

      {/* Rubber-band preview */}
      {previewElement}

      {/* Drag dimensions label */}
      {drawState.active && drawState.startPoint && drawState.currentPoint && (
        <Html
          position={sketchTo3D({
            x: (drawState.startPoint.x + drawState.currentPoint.x) / 2,
            y: (drawState.startPoint.y + drawState.currentPoint.y) / 2,
          }, info)}
          center
        >
          <div className="bg-fusion-surface/95 text-yellow-400 text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/30 font-mono pointer-events-none whitespace-nowrap">
            {(() => {
              const dx = drawState.currentPoint!.x - drawState.startPoint!.x;
              const dy = drawState.currentPoint!.y - drawState.startPoint!.y;
              const tool = activeSketchTool;
              if (tool === 'circle' || tool === 'centerCircle') {
                return `r = ${Math.sqrt(dx * dx + dy * dy).toFixed(1)}`;
              }
              if (tool === 'rectangle' || tool === 'centerRectangle') {
                return `${Math.abs(dx).toFixed(1)} × ${Math.abs(dy).toFixed(1)}`;
              }
              return `${Math.sqrt(dx * dx + dy * dy).toFixed(1)}`;
            })()}
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

// Keyboard shortcuts are handled centrally by src/shortcuts/useKeyboardShortcuts.ts
// (mounted in App.tsx via useKeyboardShortcuts hook)

// ────────────────────────────────────────────
// Reference planes (shown when toggled via View menu)
// ────────────────────────────────────────────
function ReferencePlanes() {
  const showPlanes = useEditorStore((s) => s.showPlanes);
  const sketchPhase = useEditorStore((s) => s.sketchPhase);
  // Hide default planes when plane selection overlay is showing
  if (!showPlanes || sketchPhase === 'selectPlane') return null;

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
  const sketchPhase = useEditorStore((s) => s.sketchPhase);
  const activeTool = useEditorStore((s) => s.activeTool);

  const isMeasureMode = activeTool === 'measure';

  // OrbitControls enabled when:
  // - Not in sketch mode at all, OR
  // - In plane selection phase (user still needs to orbit to find the right plane)
  // Disabled during drawing phase (camera is locked to the sketch plane)
  const orbitEnabled = !isSketchActive || sketchPhase === 'selectPlane';

  return (
    <Canvas
      camera={{ position: [30, 25, 30], fov: 50, near: 0.1, far: 10000 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor('#444444');
        // Expose scene for STL export
        (window as any).__r3ditor_scene = scene;
      }}
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
        enabled={orbitEnabled && !isMeasureMode}
      />

      {/* Camera animator for sketch plane transitions */}
      <CameraAnimator />

      {/* Camera projection handler */}
      <CameraProjectionHandler />

      {/* View command handler for standard views & zoom-to-fit */}
      <ViewCommandHandler />

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

      {/* Axis gizmo */}
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

      {/* Section analysis clipping plane */}
      <SectionPlane />

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

      {/* Plane selection overlay (phase 1) */}
      {sketchPhase === 'selectPlane' && <PlaneSelectionOverlay />}

      {/* Sketch drawing overlay (phase 2) */}
      {sketchPhase === 'drawing' && <SketchDrawingOverlay />}

      {/* Sketch constraint glyphs (visual markers on constrained geometry) */}
      {sketchPhase === 'drawing' && <SketchConstraintGlyphs />}

      {/* Sketch dimension annotations (value labels with leader lines) */}
      {sketchPhase === 'drawing' && <SketchDimensionAnnotations />}

      {/* Snap indicators during sketch drawing */}
      {sketchPhase === 'drawing' && <SnapIndicators />}

      {/* Sub-element picking (face/edge/vertex) */}
      <SubElementPicker />

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
