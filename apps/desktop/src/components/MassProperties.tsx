import { useEditorStore } from '../store/editorStore';
import { Scale, X } from 'lucide-react';
import { useState } from 'react';

/**
 * MassProperties — Displays volume, surface area, center of mass for selected entities.
 *
 * Universal feature in Fusion 360, Onshape, FreeCAD, and SALOME.
 * Shows computed physical properties of selected geometry.
 */

interface MassPropertiesData {
  volume: number;         // mm³
  surfaceArea: number;    // mm²
  centerOfMass: [number, number, number];  // mm
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  faceCount: number;
  edgeCount: number;
  vertexCount: number;
  // Material properties (if assigned)
  density: number;        // g/cm³
  mass: number;           // grams
}

function computeMassProperties(entities: ReturnType<typeof useEditorStore.getState>['entities'], selectedIds: string[]): MassPropertiesData | null {
  const selected = entities.filter((e) => selectedIds.includes(e.id));
  if (selected.length === 0) return null;

  // Compute approximate properties from entity geometry
  // In a real app, this would call the cad-kernel WASM for precise BRep analysis
  let totalVolume = 0;
  let totalSurfaceArea = 0;
  let totalFaces = 0;
  let totalEdges = 0;
  let totalVertices = 0;
  let weightedCenterX = 0;
  let weightedCenterY = 0;
  let weightedCenterZ = 0;
  const bboxMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const bboxMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const entity of selected) {
    const [sx, sy, sz] = entity.transform.scale;
    const [px, py, pz] = entity.transform.position;

    let vol = 0;
    let sa = 0;

    switch (entity.type) {
      case 'box': {
        // Assume unit cube scaled
        vol = sx * sy * sz;
        sa = 2 * (sx * sy + sy * sz + sx * sz);
        break;
      }
      case 'cylinder': {
        const r = sx / 2;
        const h = sy;
        vol = Math.PI * r * r * h;
        sa = 2 * Math.PI * r * h + 2 * Math.PI * r * r;
        break;
      }
      case 'sphere': {
        const r = sx / 2;
        vol = (4 / 3) * Math.PI * r * r * r;
        sa = 4 * Math.PI * r * r;
        break;
      }
      default: {
        // Approximate from face/edge/vertex count (imported/brep)
        vol = sx * sy * sz * 0.8; // rough estimate
        sa = 2 * (sx * sy + sy * sz + sx * sz) * 0.9;
        break;
      }
    }

    totalVolume += vol;
    totalSurfaceArea += sa;
    totalFaces += entity.faceCount;
    totalEdges += entity.edgeCount;
    totalVertices += entity.vertexCount;
    weightedCenterX += px * vol;
    weightedCenterY += py * vol;
    weightedCenterZ += pz * vol;

    // Bounding box (approximate)
    const halfX = sx / 2, halfY = sy / 2, halfZ = sz / 2;
    bboxMin[0] = Math.min(bboxMin[0], px - halfX);
    bboxMin[1] = Math.min(bboxMin[1], py - halfY);
    bboxMin[2] = Math.min(bboxMin[2], pz - halfZ);
    bboxMax[0] = Math.max(bboxMax[0], px + halfX);
    bboxMax[1] = Math.max(bboxMax[1], py + halfY);
    bboxMax[2] = Math.max(bboxMax[2], pz + halfZ);
  }

  const density = 7.85; // Steel default g/cm³
  const volumeCm3 = totalVolume / 1000; // mm³ → cm³
  const mass = volumeCm3 * density;

  const comX = totalVolume > 0 ? weightedCenterX / totalVolume : 0;
  const comY = totalVolume > 0 ? weightedCenterY / totalVolume : 0;
  const comZ = totalVolume > 0 ? weightedCenterZ / totalVolume : 0;

  return {
    volume: totalVolume,
    surfaceArea: totalSurfaceArea,
    centerOfMass: [comX, comY, comZ],
    boundingBox: {
      min: bboxMin[0] === Infinity ? [0, 0, 0] : bboxMin,
      max: bboxMax[0] === -Infinity ? [0, 0, 0] : bboxMax,
    },
    faceCount: totalFaces,
    edgeCount: totalEdges,
    vertexCount: totalVertices,
    density,
    mass,
  };
}

export function MassProperties() {
  const [isOpen, setIsOpen] = useState(false);
  const entities = useEditorStore((s) => s.entities);
  const selectedIds = useEditorStore((s) => s.selectedIds);

  const data = computeMassProperties(entities, selectedIds);

  if (!isOpen) {
    return (
      <button
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-fusion-text-secondary hover:text-fusion-text hover:bg-fusion-hover rounded transition-colors"
        onClick={() => setIsOpen(true)}
        title="Mass Properties"
      >
        <Scale size={11} />
        <span>Properties</span>
      </button>
    );
  }

  return (
    <div className="absolute top-12 right-80 w-64 bg-fusion-surface border border-fusion-border-light rounded shadow-2xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-fusion-panel border-b border-fusion-border-light">
        <div className="flex items-center gap-1.5">
          <Scale size={13} className="text-fusion-blue" />
          <span className="text-xs font-medium text-fusion-text">Mass Properties</span>
        </div>
        <button
          className="p-0.5 rounded hover:bg-fusion-hover text-fusion-text-disabled hover:text-fusion-text transition-colors"
          onClick={() => setIsOpen(false)}
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {!data ? (
          <p className="text-xs text-fusion-text-disabled text-center py-4">
            Select one or more entities to view mass properties
          </p>
        ) : (
          <>
            {/* Volume & Area */}
            <Section title="Geometry">
              <PropRow label="Volume" value={formatVolume(data.volume)} />
              <PropRow label="Surface Area" value={formatArea(data.surfaceArea)} />
              <PropRow label="Faces" value={String(data.faceCount)} />
              <PropRow label="Edges" value={String(data.edgeCount)} />
              <PropRow label="Vertices" value={String(data.vertexCount)} />
            </Section>

            {/* Mass */}
            <Section title="Physical">
              <PropRow label="Density" value={`${data.density} g/cm³`} />
              <PropRow label="Mass" value={formatMass(data.mass)} />
            </Section>

            {/* Center of Mass */}
            <Section title="Center of Mass">
              <PropRow label="X" value={`${data.centerOfMass[0].toFixed(2)} mm`} />
              <PropRow label="Y" value={`${data.centerOfMass[1].toFixed(2)} mm`} />
              <PropRow label="Z" value={`${data.centerOfMass[2].toFixed(2)} mm`} />
            </Section>

            {/* Bounding Box */}
            <Section title="Bounding Box">
              <PropRow
                label="Size"
                value={`${(data.boundingBox.max[0] - data.boundingBox.min[0]).toFixed(1)} × ${(data.boundingBox.max[1] - data.boundingBox.min[1]).toFixed(1)} × ${(data.boundingBox.max[2] - data.boundingBox.min[2]).toFixed(1)} mm`}
              />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] text-fusion-text-disabled uppercase tracking-wider mb-1">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-fusion-text-secondary">{label}</span>
      <span className="text-fusion-text font-mono text-[10px]">{value}</span>
    </div>
  );
}

// ── Formatting helpers ──

function formatVolume(mm3: number): string {
  if (mm3 > 1e9) return `${(mm3 / 1e9).toFixed(3)} m³`;
  if (mm3 > 1e3) return `${(mm3 / 1e3).toFixed(3)} cm³`;
  return `${mm3.toFixed(3)} mm³`;
}

function formatArea(mm2: number): string {
  if (mm2 > 1e6) return `${(mm2 / 1e6).toFixed(3)} m²`;
  if (mm2 > 1e2) return `${(mm2 / 1e2).toFixed(3)} cm²`;
  return `${mm2.toFixed(3)} mm²`;
}

function formatMass(grams: number): string {
  if (grams > 1000) return `${(grams / 1000).toFixed(3)} kg`;
  return `${grams.toFixed(3)} g`;
}
