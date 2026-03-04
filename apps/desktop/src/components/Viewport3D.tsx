import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  Environment,
} from '@react-three/drei';
import { useEditorStore } from '../store/editorStore';

export function Viewport3D() {
  const { entities, selectedIds, showGrid, showAxes } = useEditorStore();

  return (
    <Canvas
      camera={{ position: [30, 25, 30], fov: 50, near: 0.1, far: 10000 }}
      className="w-full h-full"
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor('#1e1e2e');
      }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.4} />
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

      {/* Navigation gizmo */}
      {showAxes && (
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={['#f87171', '#4ade80', '#60a5fa']}
            labelColor="white"
          />
        </GizmoHelper>
      )}

      {/* Render entities as placeholder meshes */}
      {entities.map((entity) => {
        const isSelected = selectedIds.includes(entity.id);
        return (
          <mesh
            key={entity.id}
            position={[0, 0, 0]}
            onClick={() => useEditorStore.getState().select(entity.id)}
          >
            <boxGeometry args={[20, 20, 20]} />
            <meshStandardMaterial
              color={isSelected ? '#40b4ff' : '#808090'}
              metalness={0.1}
              roughness={0.6}
              wireframe={false}
            />
            {isSelected && (
              <lineSegments>
                <edgesGeometry
                  args={[new (await import('three')).BoxGeometry(20, 20, 20)]}
                />
                <lineBasicMaterial color="#40b4ff" linewidth={2} />
              </lineSegments>
            )}
          </mesh>
        );
      })}

      {/* Environment for reflections */}
      <Environment preset="studio" />
    </Canvas>
  );
}
