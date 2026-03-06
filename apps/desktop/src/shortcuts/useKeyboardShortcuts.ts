import { useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import {
  type ShortcutBinding,
  type ShortcutContext,
  normalizeKeyEvent,
} from './registry';
import * as api from '../api/tauri';

/**
 * Central keyboard shortcut handler.
 * Mounted once in App — routes keyboard events to the correct action
 * based on current context (global, sketch, feature, assembly).
 */
export function useKeyboardShortcuts() {
  const bindingsRef = useRef<ShortcutBinding[]>([]);

  // Build bindings from store actions
  const buildBindings = useCallback((): ShortcutBinding[] => {
    const store = useEditorStore.getState();
    const bindings: ShortcutBinding[] = [];

    // ── Global shortcuts ──

    bindings.push({
      id: 'undo', label: 'Undo', keys: 'ctrl+z', contexts: ['global'],
      group: 'Edit', action: () => api.undo(),
    });
    bindings.push({
      id: 'redo', label: 'Redo', keys: 'ctrl+y', contexts: ['global'],
      group: 'Edit', action: () => api.redo(),
    });
    bindings.push({
      id: 'redo2', label: 'Redo', keys: 'ctrl+shift+z', contexts: ['global'],
      group: 'Edit', action: () => api.redo(),
    });

    bindings.push({
      id: 'save', label: 'Save', keys: 'ctrl+s', contexts: ['global'],
      group: 'File', action: () => store.setStatusMessage('Saved'),
    });

    bindings.push({
      id: 'copy', label: 'Copy', keys: 'ctrl+c', contexts: ['global'],
      group: 'Edit', action: () => {
        const s = useEditorStore.getState();
        if (s.selectedIds.length > 0) {
          useEditorStore.setState({ clipboard: s.selectedIds.slice() });
          s.setStatusMessage(`Copied ${s.selectedIds.length} item(s)`);
        }
      },
    });
    bindings.push({
      id: 'paste', label: 'Paste', keys: 'ctrl+v', contexts: ['global'],
      group: 'Edit', action: () => {
        const s = useEditorStore.getState();
        const clipboard = (s as any).clipboard as string[] | undefined;
        if (clipboard && clipboard.length > 0) {
          // Duplicate entities with offset
          const newEntities = clipboard
            .map((id) => s.entities.find((e) => e.id === id))
            .filter(Boolean)
            .map((e) => ({
              ...e!,
              id: `${e!.id}_copy_${Date.now()}`,
              name: `${e!.name} (Copy)`,
              transform: {
                ...e!.transform,
                position: [
                  e!.transform.position[0] + 15,
                  e!.transform.position[1],
                  e!.transform.position[2],
                ] as [number, number, number],
              },
            }));
          for (const ne of newEntities) {
            s.addEntity(ne);
          }
          s.setStatusMessage(`Pasted ${newEntities.length} item(s)`);
        }
      },
    });

    bindings.push({
      id: 'delete', label: 'Delete', keys: 'delete', contexts: ['global'],
      group: 'Edit', action: () => {
        const s = useEditorStore.getState();
        for (const id of s.selectedIds) {
          s.removeEntity(id);
        }
        s.clearSelection();
        s.setStatusMessage('Deleted selection');
      },
    });

    bindings.push({
      id: 'selectAll', label: 'Select All', keys: 'ctrl+a', contexts: ['global'],
      group: 'Edit', action: () => {
        const s = useEditorStore.getState();
        useEditorStore.setState({ selectedIds: s.entities.map((e) => e.id) });
      },
    });

    // ── Escape — universal cancel ──

    bindings.push({
      id: 'escape', label: 'Cancel / Deselect', keys: 'escape', contexts: ['global', 'sketch', 'feature'],
      group: 'General', action: () => {
        const s = useEditorStore.getState();
        // If feature dialog is open, close it
        if (s.featureDialog.open) {
          s.closeFeatureDialog();
          return;
        }
        // If marking menu is open, close it
        if (s.markingMenu.open) {
          s.closeMarkingMenu();
          return;
        }
        // If in sketch mode, cancel sketch
        if (s.isSketchActive) {
          s.cancelSketch();
          return;
        }
        // Otherwise deselect
        if (s.selectedIds.length > 0) {
          s.clearSelection();
          s.setStatusMessage('Selection cleared');
          return;
        }
        // Reset tool to select
        s.setTool('select');
      },
    });

    // ── Tool shortcuts (design mode) ──

    bindings.push({
      id: 'tool_select', label: 'Select', keys: 'v', contexts: ['global'],
      group: 'Tools', action: () => store.setTool('select'),
    });
    bindings.push({
      id: 'tool_move', label: 'Move', keys: 'w', contexts: ['global'],
      group: 'Tools', action: () => store.setTool('move'),
    });
    bindings.push({
      id: 'tool_rotate_tool', label: 'Rotate', keys: 'q', contexts: ['global'],
      group: 'Tools', action: () => store.setTool('rotate'),
    });
    bindings.push({
      id: 'tool_measure', label: 'Measure', keys: 'm', contexts: ['global'],
      group: 'Tools', action: () => store.setTool('measure'),
    });

    // ── Feature shortcuts (design mode) ──

    bindings.push({
      id: 'feat_extrude', label: 'Extrude', keys: 'e', contexts: ['global'],
      group: 'Features', action: () => store.openFeatureDialog('extrude'),
    });
    bindings.push({
      id: 'feat_fillet', label: 'Fillet', keys: 'f', contexts: ['global'],
      group: 'Features', action: () => store.openFeatureDialog('fillet'),
    });
    bindings.push({
      id: 'feat_hole', label: 'Hole', keys: 'h', contexts: ['global'],
      group: 'Features', action: () => store.openFeatureDialog('hole'),
    });
    bindings.push({
      id: 'feat_boolean', label: 'Combine', keys: 'b', contexts: ['global'],
      group: 'Features', action: () => store.openFeatureDialog('boolean'),
    });

    // ── View shortcuts ──

    bindings.push({
      id: 'zoom_fit', label: 'Zoom to Fit', keys: 'z', contexts: ['global'],
      group: 'View', action: () => {
        useEditorStore.setState({ viewCommand: 'zoomFit' });
        store.setStatusMessage('Zoom to Fit');
      },
    });
    bindings.push({
      id: 'view_front', label: 'Front View', keys: '1', contexts: ['global'],
      group: 'View', action: () => {
        useEditorStore.setState({ viewCommand: 'front' });
        store.setStatusMessage('Front View');
      },
    });
    bindings.push({
      id: 'view_back', label: 'Back View', keys: '2', contexts: ['global'],
      group: 'View', action: () => {
        useEditorStore.setState({ viewCommand: 'back' });
        store.setStatusMessage('Back View');
      },
    });
    bindings.push({
      id: 'view_top', label: 'Top View', keys: '3', contexts: ['global'],
      group: 'View', action: () => {
        useEditorStore.setState({ viewCommand: 'top' });
        store.setStatusMessage('Top View');
      },
    });
    bindings.push({
      id: 'view_bottom', label: 'Bottom View', keys: '4', contexts: ['global'],
      group: 'View', action: () => {
        useEditorStore.setState({ viewCommand: 'bottom' });
        store.setStatusMessage('Bottom View');
      },
    });
    bindings.push({
      id: 'view_left', label: 'Left View', keys: '5', contexts: ['global'],
      group: 'View', action: () => {
        useEditorStore.setState({ viewCommand: 'left' });
        store.setStatusMessage('Left View');
      },
    });
    bindings.push({
      id: 'view_right', label: 'Right View', keys: '6', contexts: ['global'],
      group: 'View', action: () => {
        useEditorStore.setState({ viewCommand: 'right' });
        store.setStatusMessage('Right View');
      },
    });
    bindings.push({
      id: 'view_iso', label: 'Isometric View', keys: '0', contexts: ['global'],
      group: 'View', action: () => {
        useEditorStore.setState({ viewCommand: 'iso' });
        store.setStatusMessage('Isometric View');
      },
    });

    bindings.push({
      id: 'toggle_grid', label: 'Toggle Grid', keys: 'g', contexts: ['global'],
      group: 'View', action: () => store.toggleGrid(),
    });

    // ── Panel shortcuts ──

    bindings.push({
      id: 'toggle_inspector', label: 'Toggle Inspector', keys: 'i', contexts: ['global'],
      group: 'Panels', action: () => store.toggleInspector(),
    });
    bindings.push({
      id: 'toggle_browser', label: 'Toggle Browser', keys: 't', contexts: ['global'],
      group: 'Panels', action: () => store.toggleBrowser(),
    });

    // ── Command palette ──

    bindings.push({
      id: 'command_palette', label: 'Command Palette', keys: 's', contexts: ['global'],
      group: 'General', action: () => {
        useEditorStore.setState({ commandPaletteOpen: true });
      },
    });

    // ── Sketch mode shortcuts (only active when sketch is active) ──

    bindings.push({
      id: 'sketch_line', label: 'Line', keys: 'l', contexts: ['sketch'],
      group: 'Sketch', action: () => store.setSketchTool('line'),
    });
    bindings.push({
      id: 'sketch_rect', label: 'Rectangle', keys: 'r', contexts: ['sketch'],
      group: 'Sketch', action: () => store.setSketchTool('rectangle'),
    });
    bindings.push({
      id: 'sketch_circle', label: 'Circle', keys: 'c', contexts: ['sketch'],
      group: 'Sketch', action: () => store.setSketchTool('circle'),
    });
    bindings.push({
      id: 'sketch_arc', label: '3-Point Arc', keys: 'a', contexts: ['sketch'],
      group: 'Sketch', action: () => store.setSketchTool('arc3point'),
    });
    bindings.push({
      id: 'sketch_spline', label: 'Spline', keys: 'p', contexts: ['sketch'],
      group: 'Sketch', action: () => store.setSketchTool('spline'),
    });
    bindings.push({
      id: 'sketch_trim', label: 'Trim', keys: 't', contexts: ['sketch'],
      group: 'Sketch', action: () => store.setSketchTool('trim'),
    });
    bindings.push({
      id: 'sketch_dimension', label: 'Dimension', keys: 'd', contexts: ['sketch'],
      group: 'Sketch', action: () => store.setStatusMessage('Dimension tool — click geometry to dimension'),
    });
    bindings.push({
      id: 'sketch_offset', label: 'Offset', keys: 'o', contexts: ['sketch'],
      group: 'Sketch', action: () => store.setSketchTool('offset'),
    });
    bindings.push({
      id: 'sketch_construction', label: 'Toggle Construction', keys: 'x', contexts: ['sketch'],
      group: 'Sketch', action: () => store.setSketchTool('constructionToggle'),
    });
    bindings.push({
      id: 'sketch_finish', label: 'Finish Sketch', keys: 'enter', contexts: ['sketch'],
      group: 'Sketch', action: () => store.finishSketch(),
    });

    // ── Create Sketch ──

    bindings.push({
      id: 'create_sketch', label: 'Create Sketch', keys: 'n', contexts: ['global'],
      group: 'Sketch', action: () => store.beginPlaneSelection(),
    });

    // ── Visibility toggle (Space = toggle selected entity visibility) ──

    bindings.push({
      id: 'toggle_visibility', label: 'Toggle Visibility', keys: ' ', contexts: ['global'],
      group: 'Edit', action: () => {
        const s = useEditorStore.getState();
        for (const id of s.selectedIds) {
          s.toggleEntityVisibility(id);
        }
        if (s.selectedIds.length > 0) {
          s.setStatusMessage(`Toggled visibility of ${s.selectedIds.length} item(s)`);
        }
      },
    });

    // ── Duplicate (Ctrl+D) ──

    bindings.push({
      id: 'duplicate', label: 'Duplicate', keys: 'ctrl+d', contexts: ['global'],
      group: 'Edit', action: () => {
        const s = useEditorStore.getState();
        if (s.selectedIds.length === 0) return;
        const newIds: string[] = [];
        for (const id of s.selectedIds) {
          const entity = s.entities.find((e) => e.id === id);
          if (entity) {
            const newId = `${entity.id}_dup_${Date.now()}`;
            newIds.push(newId);
            s.addEntity({
              ...entity,
              id: newId,
              name: `${entity.name} (Copy)`,
              transform: {
                ...entity.transform,
                position: [
                  entity.transform.position[0] + 15,
                  entity.transform.position[1],
                  entity.transform.position[2],
                ],
              },
            });
          }
        }
        useEditorStore.setState({ selectedIds: newIds });
        s.setStatusMessage(`Duplicated ${newIds.length} item(s)`);
      },
    });

    // ── View style shortcuts (Shift+1/2/3) ──

    bindings.push({
      id: 'view_shaded', label: 'Shaded', keys: 'shift+1', contexts: ['global'],
      group: 'View', action: () => { store.setViewStyle('shaded'); store.setStatusMessage('Visual Style: Shaded'); },
    });
    bindings.push({
      id: 'view_shaded_edges', label: 'Shaded with Edges', keys: 'shift+2', contexts: ['global'],
      group: 'View', action: () => { store.setViewStyle('shadedEdges'); store.setStatusMessage('Visual Style: Shaded with Edges'); },
    });
    bindings.push({
      id: 'view_wireframe', label: 'Wireframe', keys: 'shift+3', contexts: ['global'],
      group: 'View', action: () => { store.setViewStyle('wireframe'); store.setStatusMessage('Visual Style: Wireframe'); },
    });
    bindings.push({
      id: 'view_hidden', label: 'Hidden Edges', keys: 'shift+4', contexts: ['global'],
      group: 'View', action: () => { store.setViewStyle('hidden'); store.setStatusMessage('Visual Style: Hidden Edges'); },
    });

    // ── Camera projection toggle (Numpad 5 or Shift+5) ──

    bindings.push({
      id: 'toggle_projection', label: 'Toggle Perspective/Ortho', keys: 'shift+5', contexts: ['global'],
      group: 'View', action: () => {
        store.toggleCameraProjection();
        const proj = useEditorStore.getState().cameraProjection;
        store.setStatusMessage(`Camera: ${proj === 'perspective' ? 'Perspective' : 'Orthographic'}`);
      },
    });

    // ── Feature shortcuts: Revolve, Chamfer, Shell, Sweep, Loft ──

    bindings.push({
      id: 'feat_revolve', label: 'Revolve', keys: 'ctrl+shift+e', contexts: ['global'],
      group: 'Features', action: () => store.openFeatureDialog('revolve'),
    });
    bindings.push({
      id: 'feat_chamfer', label: 'Chamfer', keys: 'ctrl+shift+f', contexts: ['global'],
      group: 'Features', action: () => store.openFeatureDialog('chamfer'),
    });
    bindings.push({
      id: 'feat_shell', label: 'Shell', keys: 'ctrl+shift+h', contexts: ['global'],
      group: 'Features', action: () => store.openFeatureDialog('shell'),
    });
    bindings.push({
      id: 'feat_sweep', label: 'Sweep', keys: 'ctrl+shift+w', contexts: ['global'],
      group: 'Features', action: () => store.openFeatureDialog('sweep'),
    });
    bindings.push({
      id: 'feat_loft', label: 'Loft', keys: 'ctrl+shift+l', contexts: ['global'],
      group: 'Features', action: () => store.openFeatureDialog('loft'),
    });
    bindings.push({
      id: 'feat_pattern', label: 'Linear Pattern', keys: 'ctrl+shift+p', contexts: ['global'],
      group: 'Features', action: () => store.openFeatureDialog('linearPattern'),
    });

    // ── Section analysis ──

    bindings.push({
      id: 'section_analysis', label: 'Section Analysis', keys: 'ctrl+shift+x', contexts: ['global'],
      group: 'Inspect', action: () => {
        useEditorStore.setState((s: any) => ({ sectionPlane: { ...s.sectionPlane, enabled: !s.sectionPlane?.enabled } }));
        store.setStatusMessage('Section analysis toggled');
      },
    });

    // ── Fusion 360 additional shortcuts ──

    bindings.push({
      id: 'feat_press_pull', label: 'Press Pull', keys: 'ctrl+shift+d', contexts: ['global'],
      group: 'Features', action: () => { store.openFeatureDialog('extrude', { mode: 'pressPull' }); store.setStatusMessage('Press/Pull — select face and drag'); },
    });
    bindings.push({
      id: 'feat_joint', label: 'Joint', keys: 'j', contexts: ['global'],
      group: 'Assembly', action: () => store.setStatusMessage('Joint — select components to constrain'),
    });
    bindings.push({
      id: 'appearance', label: 'Appearance', keys: 'a', contexts: ['global'],
      group: 'Modify', action: () => { store.setInspectorTab('appearance'); if (!useEditorStore.getState().inspectorOpen) store.toggleInspector(); store.setStatusMessage('Appearance panel opened'); },
    });
    bindings.push({
      id: 'feat_project', label: 'Project', keys: 'ctrl+p', contexts: ['sketch'],
      group: 'Sketch', action: () => store.setStatusMessage('Project — select geometry to project onto sketch'),
    });

    // ── Toggle show/hide planes ──

    bindings.push({
      id: 'toggle_planes', label: 'Toggle Planes', keys: 'ctrl+shift+g', contexts: ['global'],
      group: 'View', action: () => { store.togglePlanes(); store.setStatusMessage('Reference planes toggled'); },
    });

    return bindings;
  }, []);

  useEffect(() => {
    bindingsRef.current = buildBindings();

    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const keyCombo = normalizeKeyEvent(e);
      if (!keyCombo || keyCombo === 'ctrl' || keyCombo === 'shift' || keyCombo === 'alt') return;

      // Determine current context
      const state = useEditorStore.getState();
      const context: ShortcutContext = state.isSketchActive
        ? 'sketch'
        : state.workspaceMode === 'assembly'
          ? 'assembly'
          : state.featureDialog.open
            ? 'feature'
            : 'global';

      // Find matching binding — prefer more specific context
      const binding = bindingsRef.current.find((b) => {
        if (b.keys !== keyCombo) return false;
        // 'escape' binding is special: active in all its contexts
        if (b.contexts.includes(context)) return true;
        // Global shortcuts also fire when not in their specific context
        // UNLESS a sketch/feature binding overrides the same key
        return false;
      });

      // If in sketch mode but no sketch binding found, try global
      const fallback = !binding
        ? bindingsRef.current.find((b) => b.keys === keyCombo && b.contexts.includes('global'))
        : null;

      const match = binding || fallback;
      if (match) {
        e.preventDefault();
        e.stopPropagation();
        match.action();
        // Track for recent commands
        addRecentCommand(match.id);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [buildBindings]);

  return bindingsRef;
}

// ── Recent commands tracking ──
const MAX_RECENT = 10;
let recentCommands: string[] = [];

function addRecentCommand(id: string) {
  recentCommands = [id, ...recentCommands.filter((c) => c !== id)].slice(0, MAX_RECENT);
}

export function getRecentCommands(): string[] {
  return recentCommands;
}
