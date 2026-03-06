import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../store/editorStore';
import type { Entity, SketchPlaneInfo, BrowserNode } from '../store/editorStore';

// Helper to reset store between tests
function resetStore() {
  useEditorStore.setState(useEditorStore.getInitialState());
}

function makeEntity(id: string, name?: string): Entity {
  return {
    id,
    name: name ?? `Entity ${id}`,
    visible: true,
    locked: false,
    suppressed: false,
    faceCount: 6,
    edgeCount: 12,
    vertexCount: 8,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    type: 'box',
  };
}

describe('editorStore', () => {
  beforeEach(() => resetStore());

  // ── Document ───────────────────────────────────────────────────────────

  describe('document management', () => {
    it('starts with default document name', () => {
      const { documentName } = useEditorStore.getState();
      expect(documentName).toBe('Untitled');
    });

    it('updates document name', () => {
      useEditorStore.getState().setDocumentName('My Part');
      expect(useEditorStore.getState().documentName).toBe('My Part');
    });

    it('starts with one default tab', () => {
      const { documentTabs, activeTabId } = useEditorStore.getState();
      expect(documentTabs).toHaveLength(1);
      expect(activeTabId).toBe('design1');
    });

    it('adds and switches tabs', () => {
      const store = useEditorStore.getState();
      store.addTab({ id: 'asm1', name: 'Assembly 1', type: 'assembly', active: false });
      expect(useEditorStore.getState().documentTabs).toHaveLength(2);

      store.setActiveTab('asm1');
      expect(useEditorStore.getState().activeTabId).toBe('asm1');
      expect(useEditorStore.getState().workspaceMode).toBe('assembly');
    });

    it('removes tabs', () => {
      const store = useEditorStore.getState();
      store.addTab({ id: 'tab2', name: 'Tab 2', type: 'design', active: false });
      store.removeTab('tab2');
      expect(useEditorStore.getState().documentTabs).toHaveLength(1);
    });
  });

  // ── Workspace ──────────────────────────────────────────────────────────

  describe('workspace', () => {
    it('defaults to SOLID workspace and design mode', () => {
      const { fusionWorkspace, workspaceMode } = useEditorStore.getState();
      expect(fusionWorkspace).toBe('SOLID');
      expect(workspaceMode).toBe('design');
    });

    it('switches fusion workspace', () => {
      useEditorStore.getState().setFusionWorkspace('SHEET METAL');
      expect(useEditorStore.getState().fusionWorkspace).toBe('SHEET METAL');
    });

    it('switches workspace mode', () => {
      useEditorStore.getState().setWorkspaceMode('assembly');
      expect(useEditorStore.getState().workspaceMode).toBe('assembly');
    });
  });

  // ── Entities ───────────────────────────────────────────────────────────

  describe('entities', () => {
    it('starts with no entities', () => {
      expect(useEditorStore.getState().entities).toHaveLength(0);
    });

    it('adds an entity', () => {
      useEditorStore.getState().addEntity(makeEntity('e1'));
      expect(useEditorStore.getState().entities).toHaveLength(1);
      expect(useEditorStore.getState().entities[0].id).toBe('e1');
    });

    it('removes an entity', () => {
      const store = useEditorStore.getState();
      store.addEntity(makeEntity('e1'));
      store.addEntity(makeEntity('e2'));
      store.removeEntity('e1');
      expect(useEditorStore.getState().entities).toHaveLength(1);
      expect(useEditorStore.getState().entities[0].id).toBe('e2');
    });

    it('removing entity also clears selection', () => {
      const store = useEditorStore.getState();
      store.addEntity(makeEntity('e1'));
      store.select('e1');
      expect(useEditorStore.getState().selectedIds).toContain('e1');
      store.removeEntity('e1');
      expect(useEditorStore.getState().selectedIds).not.toContain('e1');
    });

    it('sets all entities at once', () => {
      useEditorStore.getState().setEntities([makeEntity('a'), makeEntity('b'), makeEntity('c')]);
      expect(useEditorStore.getState().entities).toHaveLength(3);
    });

    it('updates entity transform', () => {
      useEditorStore.getState().addEntity(makeEntity('e1'));
      useEditorStore.getState().updateEntityTransform('e1', { position: [5, 10, 15] });
      const updated = useEditorStore.getState().entities[0];
      expect(updated.transform.position).toEqual([5, 10, 15]);
      // Other transform fields preserved
      expect(updated.transform.scale).toEqual([1, 1, 1]);
    });

    it('toggles entity visibility', () => {
      useEditorStore.getState().addEntity(makeEntity('e1'));
      expect(useEditorStore.getState().entities[0].visible).toBe(true);
      useEditorStore.getState().toggleEntityVisibility('e1');
      expect(useEditorStore.getState().entities[0].visible).toBe(false);
      useEditorStore.getState().toggleEntityVisibility('e1');
      expect(useEditorStore.getState().entities[0].visible).toBe(true);
    });

    it('toggles entity suppressed', () => {
      useEditorStore.getState().addEntity(makeEntity('e1'));
      expect(useEditorStore.getState().entities[0].suppressed).toBe(false);
      useEditorStore.getState().toggleEntitySuppressed('e1');
      expect(useEditorStore.getState().entities[0].suppressed).toBe(true);
    });
  });

  // ── Selection ──────────────────────────────────────────────────────────

  describe('selection', () => {
    it('starts with no selection', () => {
      expect(useEditorStore.getState().selectedIds).toHaveLength(0);
    });

    it('selects a single entity (replaces previous)', () => {
      const store = useEditorStore.getState();
      store.select('a');
      expect(useEditorStore.getState().selectedIds).toEqual(['a']);
      store.select('b');
      expect(useEditorStore.getState().selectedIds).toEqual(['b']);
    });

    it('multi-selects (adds to selection)', () => {
      const store = useEditorStore.getState();
      store.select('a');
      store.multiSelect('b');
      expect(useEditorStore.getState().selectedIds).toEqual(['a', 'b']);
    });

    it('multi-select does not duplicate', () => {
      const store = useEditorStore.getState();
      store.select('a');
      store.multiSelect('a');
      expect(useEditorStore.getState().selectedIds).toEqual(['a']);
    });

    it('toggle-select adds and removes', () => {
      const store = useEditorStore.getState();
      store.toggleSelect('a');
      expect(useEditorStore.getState().selectedIds).toEqual(['a']);
      store.toggleSelect('a');
      expect(useEditorStore.getState().selectedIds).toEqual([]);
    });

    it('clears selection', () => {
      const store = useEditorStore.getState();
      store.select('a');
      store.multiSelect('b');
      store.clearSelection();
      expect(useEditorStore.getState().selectedIds).toEqual([]);
    });

    it('defaults to body selection filter', () => {
      expect(useEditorStore.getState().selectionFilter).toBe('body');
    });

    it('changes selection filter', () => {
      useEditorStore.getState().setSelectionFilter('face');
      expect(useEditorStore.getState().selectionFilter).toBe('face');
    });
  });

  // ── Tool ───────────────────────────────────────────────────────────────

  describe('tool management', () => {
    it('defaults to select tool', () => {
      expect(useEditorStore.getState().activeTool).toBe('select');
    });

    it('sets tool and updates status', () => {
      useEditorStore.getState().setTool('extrude');
      const state = useEditorStore.getState();
      expect(state.activeTool).toBe('extrude');
      expect(state.statusMessage).toContain('extrude');
    });

    it('cycles through tools', () => {
      const store = useEditorStore.getState();
      store.setTool('fillet');
      store.setTool('chamfer');
      store.setTool('select');
      expect(useEditorStore.getState().activeTool).toBe('select');
    });
  });

  // ── Sketch Workflow ────────────────────────────────────────────────────

  describe('sketch workflow', () => {
    it('starts with sketch inactive', () => {
      const { isSketchActive, sketchPhase, sketchPlane } = useEditorStore.getState();
      expect(isSketchActive).toBe(false);
      expect(sketchPhase).toBeNull();
      expect(sketchPlane).toBeNull();
    });

    it('begins plane selection', () => {
      useEditorStore.getState().beginPlaneSelection();
      const state = useEditorStore.getState();
      expect(state.isSketchActive).toBe(true);
      expect(state.sketchPhase).toBe('selectPlane');
      expect(state.activeTool).toBe('sketch');
      expect(state.showPlanes).toBe(true);
    });

    it('selects sketch plane transitions to drawing', () => {
      useEditorStore.getState().beginPlaneSelection();
      const planeInfo: SketchPlaneInfo = {
        type: 'XY',
        origin: [0, 0, 0],
        normal: [0, 0, 1],
        uAxis: [1, 0, 0],
        vAxis: [0, 1, 0],
      };
      useEditorStore.getState().selectSketchPlane(planeInfo);
      const state = useEditorStore.getState();
      expect(state.sketchPhase).toBe('drawing');
      expect(state.sketchPlane).toBe('XY');
      expect(state.activeSketchTool).toBe('line');
    });

    it('legacy startSketch goes directly to drawing', () => {
      useEditorStore.getState().startSketch('XZ');
      const state = useEditorStore.getState();
      expect(state.isSketchActive).toBe(true);
      expect(state.sketchPhase).toBe('drawing');
      expect(state.sketchPlane).toBe('XZ');
      expect(state.sketchPlaneInfo?.type).toBe('XZ');
    });

    it('adds sketch entities', () => {
      useEditorStore.getState().startSketch('XY');
      useEditorStore.getState().addSketchPoint({ id: 'p1', x: 0, y: 0, isConstruction: false });
      useEditorStore.getState().addSketchPoint({ id: 'p2', x: 10, y: 0, isConstruction: false });
      useEditorStore.getState().addSketchSegment({
        id: 's1', type: 'line', points: ['p1', 'p2'], isConstruction: false,
      });
      const state = useEditorStore.getState();
      expect(state.sketchPoints).toHaveLength(2);
      expect(state.sketchSegments).toHaveLength(1);
    });

    it('adds sketch constraints and dimensions', () => {
      useEditorStore.getState().startSketch('XY');
      useEditorStore.getState().addSketchConstraint({
        id: 'c1', type: 'horizontal', entityIds: ['s1'], satisfied: true,
      });
      useEditorStore.getState().addSketchDimension({
        id: 'd1', type: 'distance', entityIds: ['p1', 'p2'], value: 10, driving: true,
      });
      expect(useEditorStore.getState().sketchConstraints).toHaveLength(1);
      expect(useEditorStore.getState().sketchDimensions).toHaveLength(1);
    });

    it('finishSketch with data adds to timeline and browser', () => {
      useEditorStore.getState().startSketch('XY');
      useEditorStore.getState().addSketchPoint({ id: 'p1', x: 0, y: 0, isConstruction: false });
      useEditorStore.getState().finishSketch();
      const state = useEditorStore.getState();
      expect(state.isSketchActive).toBe(false);
      expect(state.sketchPhase).toBeNull();
      expect(state.activeTool).toBe('select');
      expect(state.timeline.length).toBeGreaterThanOrEqual(1);
    });

    it('finishSketch with empty data cancels', () => {
      useEditorStore.getState().startSketch('XY');
      useEditorStore.getState().finishSketch();
      const state = useEditorStore.getState();
      expect(state.isSketchActive).toBe(false);
      expect(state.statusMessage).toContain('cancelled');
    });

    it('cancelSketch resets all sketch state', () => {
      useEditorStore.getState().startSketch('XY');
      useEditorStore.getState().addSketchPoint({ id: 'p1', x: 5, y: 5, isConstruction: false });
      useEditorStore.getState().cancelSketch();
      const state = useEditorStore.getState();
      expect(state.isSketchActive).toBe(false);
      expect(state.sketchPoints).toHaveLength(0);
      expect(state.sketchSegments).toHaveLength(0);
      expect(state.activeTool).toBe('select');
    });

    it('sets sketch tool', () => {
      useEditorStore.getState().startSketch('XY');
      useEditorStore.getState().setSketchTool('rectangle');
      expect(useEditorStore.getState().activeSketchTool).toBe('rectangle');
    });

    it('updates draw state', () => {
      useEditorStore.getState().startSketch('XY');
      useEditorStore.getState().setDrawState({ active: true, startPoint: { x: 0, y: 0 } });
      const ds = useEditorStore.getState().drawState;
      expect(ds.active).toBe(true);
      expect(ds.startPoint).toEqual({ x: 0, y: 0 });
    });
  });

  // ── Feature Dialog ─────────────────────────────────────────────────────

  describe('feature dialog', () => {
    it('starts closed', () => {
      expect(useEditorStore.getState().featureDialog.open).toBe(false);
    });

    it('opens with feature type', () => {
      useEditorStore.getState().openFeatureDialog('extrude', { depth: 10 });
      const fd = useEditorStore.getState().featureDialog;
      expect(fd.open).toBe(true);
      expect(fd.featureType).toBe('extrude');
      expect(fd.params.depth).toBe(10);
    });

    it('updates dialog params', () => {
      useEditorStore.getState().openFeatureDialog('fillet');
      useEditorStore.getState().updateFeatureDialogParam('radius', 2.5);
      expect(useEditorStore.getState().featureDialog.params.radius).toBe(2.5);
    });

    it('closes dialog', () => {
      useEditorStore.getState().openFeatureDialog('chamfer');
      useEditorStore.getState().closeFeatureDialog();
      expect(useEditorStore.getState().featureDialog.open).toBe(false);
    });
  });

  // ── View toggles ──────────────────────────────────────────────────────

  describe('view toggles', () => {
    it('toggles grid', () => {
      const initial = useEditorStore.getState().showGrid;
      useEditorStore.getState().toggleGrid();
      expect(useEditorStore.getState().showGrid).toBe(!initial);
    });

    it('toggles axes', () => {
      const initial = useEditorStore.getState().showAxes;
      useEditorStore.getState().toggleAxes();
      expect(useEditorStore.getState().showAxes).toBe(!initial);
    });

    it('toggles origin', () => {
      const initial = useEditorStore.getState().showOrigin;
      useEditorStore.getState().toggleOrigin();
      expect(useEditorStore.getState().showOrigin).toBe(!initial);
    });

    it('sets view style', () => {
      useEditorStore.getState().setViewStyle('wireframe');
      expect(useEditorStore.getState().viewStyle).toBe('wireframe');
    });
  });

  // ── Panel toggles ─────────────────────────────────────────────────────

  describe('panel toggles', () => {
    it('toggles inspector', () => {
      const initial = useEditorStore.getState().inspectorOpen;
      useEditorStore.getState().toggleInspector();
      expect(useEditorStore.getState().inspectorOpen).toBe(!initial);
    });

    it('sets inspector tab', () => {
      useEditorStore.getState().setInspectorTab('appearance');
      expect(useEditorStore.getState().inspectorTab).toBe('appearance');
    });

    it('toggles browser panel', () => {
      const initial = useEditorStore.getState().browserOpen;
      useEditorStore.getState().toggleBrowser();
      expect(useEditorStore.getState().browserOpen).toBe(!initial);
    });

    it('toggles data panel', () => {
      const initial = useEditorStore.getState().dataPanel.open;
      useEditorStore.getState().toggleDataPanel();
      expect(useEditorStore.getState().dataPanel.open).toBe(!initial);
    });

    it('toggles display settings', () => {
      const initial = useEditorStore.getState().displaySettingsOpen;
      useEditorStore.getState().toggleDisplaySettings();
      expect(useEditorStore.getState().displaySettingsOpen).toBe(!initial);
    });
  });

  // ── Marking Menu ───────────────────────────────────────────────────────

  describe('marking menu', () => {
    it('opens at position', () => {
      useEditorStore.getState().openMarkingMenu(100, 200);
      const mm = useEditorStore.getState().markingMenu;
      expect(mm.open).toBe(true);
      expect(mm.x).toBe(100);
      expect(mm.y).toBe(200);
    });

    it('closes', () => {
      useEditorStore.getState().openMarkingMenu(100, 200);
      useEditorStore.getState().closeMarkingMenu();
      expect(useEditorStore.getState().markingMenu.open).toBe(false);
    });
  });

  // ── Assembly mates ─────────────────────────────────────────────────────

  describe('assembly', () => {
    it('adds mates', () => {
      useEditorStore.getState().addMate({
        id: 'm1', type: 'fastened', part1: 'p1', part2: 'p2', name: 'Mate 1',
      });
      expect(useEditorStore.getState().mates).toHaveLength(1);
    });

    it('removes mates', () => {
      const store = useEditorStore.getState();
      store.addMate({ id: 'm1', type: 'fastened', part1: 'p1', part2: 'p2', name: 'Mate 1' });
      store.addMate({ id: 'm2', type: 'revolute', part1: 'p1', part2: 'p3', name: 'Mate 2' });
      store.removeMate('m1');
      expect(useEditorStore.getState().mates).toHaveLength(1);
      expect(useEditorStore.getState().mates[0].id).toBe('m2');
    });
  });

  // ── History ────────────────────────────────────────────────────────────

  describe('history', () => {
    it('starts with no undo/redo', () => {
      const { canUndo, canRedo } = useEditorStore.getState();
      expect(canUndo).toBe(false);
      expect(canRedo).toBe(false);
    });

    it('sets history state', () => {
      useEditorStore.getState().setHistory(true, false);
      expect(useEditorStore.getState().canUndo).toBe(true);
      expect(useEditorStore.getState().canRedo).toBe(false);
    });
  });

  // ── Timeline / Rollback ────────────────────────────────────────────────

  describe('timeline', () => {
    it('starts empty', () => {
      expect(useEditorStore.getState().timeline).toHaveLength(0);
    });

    it('sets timeline', () => {
      useEditorStore.getState().setTimeline([
        { id: 't1', name: 'Sketch 1', type: 'sketch', suppressed: false, hasError: false },
        { id: 't2', name: 'Extrude 1', type: 'extrude', suppressed: false, hasError: false },
      ]);
      expect(useEditorStore.getState().timeline).toHaveLength(2);
    });

    it('sets rollback index', () => {
      useEditorStore.getState().setRollbackIndex(3);
      expect(useEditorStore.getState().rollbackIndex).toBe(3);
    });
  });

  // ── Browser Tree ───────────────────────────────────────────────────────

  describe('browser tree', () => {
    const sampleTree: BrowserNode[] = [
      {
        id: 'comp1', name: 'Component 1', type: 'component', status: 'valid',
        expanded: true, visible: true, children: [
          { id: 'body1', name: 'Body 1', type: 'body', status: 'valid',
            expanded: false, visible: true, children: [] },
        ],
      },
    ];

    it('sets browser tree', () => {
      useEditorStore.getState().setBrowserTree(sampleTree);
      expect(useEditorStore.getState().browserTree).toHaveLength(1);
      expect(useEditorStore.getState().browserTree[0].children).toHaveLength(1);
    });

    it('toggles browser node expansion', () => {
      useEditorStore.getState().setBrowserTree(sampleTree);
      useEditorStore.getState().toggleBrowserNode('comp1');
      expect(useEditorStore.getState().browserTree[0].expanded).toBe(false);
    });

    it('toggles browser node visibility', () => {
      useEditorStore.getState().setBrowserTree(sampleTree);
      useEditorStore.getState().toggleBrowserNodeVisibility('body1');
      expect(useEditorStore.getState().browserTree[0].children[0].visible).toBe(false);
    });
  });

  // ── Status ─────────────────────────────────────────────────────────────

  describe('status', () => {
    it('sets status message', () => {
      useEditorStore.getState().setStatusMessage('Loading...');
      expect(useEditorStore.getState().statusMessage).toBe('Loading...');
    });
  });
});
