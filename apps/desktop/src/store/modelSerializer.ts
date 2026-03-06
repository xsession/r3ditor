/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  Model Serializer — r3ditor Project Save / Load          ║
 * ║                                                           ║
 * ║  Serialises the editor state to a portable JSON project  ║
 * ║  file (.r3d.json) and deserialises it back, following    ║
 * ║  the architecture's .manu native format concept.         ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

import { useEditorStore } from './editorStore';
import type {
  Entity,
  SketchPoint,
  SketchSegment,
  SketchConstraint,
  SketchDimension,
  TimelineEntry,
  BrowserNode,
  MateDefinition,
  FusionWorkspace,
  WorkspaceMode,
  DocumentTab,
} from './editorStore';

// ─── Project File Format ─────────────────────────────────────────────────────

export const PROJECT_FORMAT_VERSION = '1.0.0';
export const PROJECT_FILE_EXTENSION = '.r3d.json';

/** Snapshot of sketch geometry that was used to create a sketch (before finishSketch clears them). */
export interface SketchSnapshot {
  id: string;
  name: string;
  plane: 'XY' | 'XZ' | 'YZ' | 'face' | null;
  planeInfo: {
    type: string;
    origin: [number, number, number];
    normal: [number, number, number];
    uAxis: [number, number, number];
    vAxis: [number, number, number];
  } | null;
  points: SketchPoint[];
  segments: SketchSegment[];
  constraints: SketchConstraint[];
  dimensions: SketchDimension[];
  dof: number;
}

/** Feature parameters captured at creation time. */
export interface FeatureSnapshot {
  id: string;
  name: string;
  type: string;
  params: Record<string, unknown>;
  sketchRef?: string;
  entityRef?: string;
}

/** Full serialisable project file. */
export interface R3dProject {
  /** Format metadata */
  format: {
    version: string;
    generator: string;
    createdAt: string;
    modifiedAt: string;
  };

  /** Document info */
  document: {
    name: string;
    tabs: DocumentTab[];
    activeTabId: string;
    fusionWorkspace: FusionWorkspace;
    workspaceMode: WorkspaceMode;
  };

  /** 3D entities (bodies) */
  entities: Entity[];

  /** Parametric timeline (history) */
  timeline: TimelineEntry[];

  /** Browser tree (component hierarchy) */
  browserTree: BrowserNode[];

  /** Sketch definitions (geometry data) */
  sketches: SketchSnapshot[];

  /** Feature definitions with parameters */
  features: FeatureSnapshot[];

  /** Assembly mates / joints */
  mates: MateDefinition[];

  /** View & display settings */
  viewSettings: {
    viewStyle: string;
    cameraProjection: string;
    navigationStyle: string;
    showGrid: boolean;
    showAxes: boolean;
    showOrigin: boolean;
    showPlanes: boolean;
  };

  /** Statistics */
  statistics: {
    entityCount: number;
    timelineEntryCount: number;
    sketchCount: number;
    featureCount: number;
    mateCount: number;
    totalFaces: number;
    totalEdges: number;
    totalVertices: number;
  };
}

// ─── Serialisation ───────────────────────────────────────────────────────────

/**
 * Capture the current editor state and build a serialisable project object.
 *
 * @param sketches - Array of sketch snapshots captured during the modelling session
 *                   (since finishSketch clears sketch geometry, callers must capture them).
 * @param features - Array of feature snapshots captured during the modelling session.
 */
export function serializeProject(
  sketches: SketchSnapshot[] = [],
  features: FeatureSnapshot[] = [],
): R3dProject {
  const s = useEditorStore.getState();
  const now = new Date().toISOString();

  return {
    format: {
      version: PROJECT_FORMAT_VERSION,
      generator: 'r3ditor',
      createdAt: now,
      modifiedAt: now,
    },
    document: {
      name: s.documentName,
      tabs: s.documentTabs,
      activeTabId: s.activeTabId,
      fusionWorkspace: s.fusionWorkspace,
      workspaceMode: s.workspaceMode,
    },
    entities: s.entities.map((e) => ({ ...e })),
    timeline: s.timeline.map((t) => ({ ...t })),
    browserTree: deepCopyNodes(s.browserTree),
    sketches,
    features,
    mates: s.mates.map((m) => ({ ...m })),
    viewSettings: {
      viewStyle: s.viewStyle,
      cameraProjection: s.cameraProjection,
      navigationStyle: s.navigationStyle,
      showGrid: s.showGrid,
      showAxes: s.showAxes,
      showOrigin: s.showOrigin,
      showPlanes: s.showPlanes,
    },
    statistics: {
      entityCount: s.entities.length,
      timelineEntryCount: s.timeline.length,
      sketchCount: sketches.length,
      featureCount: features.length,
      mateCount: s.mates.length,
      totalFaces: s.entities.reduce((sum, e) => sum + e.faceCount, 0),
      totalEdges: s.entities.reduce((sum, e) => sum + e.edgeCount, 0),
      totalVertices: s.entities.reduce((sum, e) => sum + e.vertexCount, 0),
    },
  };
}

/**
 * Convert a project object to a formatted JSON string (the file contents).
 */
export function projectToJSON(project: R3dProject): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Parse a JSON string back into a project object.
 */
export function projectFromJSON(json: string): R3dProject {
  const parsed = JSON.parse(json) as R3dProject;
  if (!parsed.format?.version) {
    throw new Error('Invalid r3ditor project file: missing format.version');
  }
  return parsed;
}

/**
 * Load a project into the editor store, restoring entities, timeline,
 * browser tree, mates, and view settings.
 */
export function loadProjectIntoStore(project: R3dProject): void {
  // Reset to initial state first
  useEditorStore.setState(useEditorStore.getInitialState());

  // Apply project state
  useEditorStore.setState({
    // Document
    documentName: project.document.name,
    documentTabs: project.document.tabs,
    activeTabId: project.document.activeTabId,
    fusionWorkspace: project.document.fusionWorkspace,
    workspaceMode: project.document.workspaceMode,

    // Entities
    entities: project.entities,

    // Timeline
    timeline: project.timeline,

    // Browser tree
    browserTree: project.browserTree,
    featureTree: project.browserTree,

    // Assembly
    mates: project.mates,

    // View settings
    viewStyle: project.viewSettings.viewStyle as any,
    cameraProjection: project.viewSettings.cameraProjection as any,
    navigationStyle: project.viewSettings.navigationStyle,
    showGrid: project.viewSettings.showGrid,
    showAxes: project.viewSettings.showAxes,
    showOrigin: project.viewSettings.showOrigin,
    showPlanes: project.viewSettings.showPlanes,

    // Status
    statusMessage: `Loaded project: ${project.document.name}`,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deep-copy a browser tree (recursive children). */
function deepCopyNodes(nodes: BrowserNode[]): BrowserNode[] {
  return nodes.map((n) => ({
    ...n,
    children: deepCopyNodes(n.children),
  }));
}
