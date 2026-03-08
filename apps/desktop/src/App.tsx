import { DocumentHeader } from './components/DocumentHeader';
import { FeatureToolbar } from './components/FeatureToolbar';
import { FeatureTree } from './components/FeatureTree';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Viewport3D } from './components/Viewport3D';
import { FeatureDialog } from './components/FeatureDialog';
import { BottomTabBar } from './components/BottomTabBar';
import { StatusBar } from './components/StatusBar';
import { CommandPalette } from './components/CommandPalette';
import { ContextMenu } from './components/ContextMenu';
import { MarkingMenu } from './components/MarkingMenu';
import { SelectionFilterBar } from './components/SelectionFilterBar';
import { LivePreviewBadge } from './components/LivePreviewBadge';
import { MeasureReadout } from './components/MeasureReadout';
import { SectionControls } from './components/SectionAnalysis';
import { BoxSelectionOverlay } from './components/BoxSelectionOverlay';
import { SketchConstraintOverlay } from './components/SketchConstraintOverlay';
import { QuickDimension } from './components/QuickDimension';
import { ScriptConsole } from './components/ScriptConsole';
import { CustomWorkplaneManager } from './components/CustomWorkplanes';
import { MassProperties } from './components/MassProperties';
import { ConfigurationManager } from './components/ConfigurationManager';
import { ViewCube } from './components/ViewCube';
import { ViewportNavBar } from './components/ViewportNavBar';
import { useEditorStore } from './store/editorStore';
import { useKeyboardShortcuts } from './shortcuts/useKeyboardShortcuts';

/**
 * Fusion 360 Main Application Layout
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ DocumentHeader (34px) — App bar                         │
 * ├─────────────────────────────────────────────────────────┤
 * │ FeatureToolbar (ribbon) — Workspace tabs + tool ribbon  │
 * ├─────────────────────────────────────────────────────────┤
 * │ SelectionFilterBar (24px)                               │
 * ├────────────┬───────────────────────────────┬────────────┤
 * │ FeatureTree│        Viewport3D             │ Properties │
 * │ (Browser)  │  ┌─────────────────────┐      │ (Inspector)│
 * │ 240px      │  │ ViewCube (top-right) │      │ 256px      │
 * │            │  │ ViewportNavBar (btm) │      │            │
 * │            │  │ Feature dialog       │      │            │
 * │            │  └─────────────────────┘      │            │
 * ├────────────┴───────────────────────────────┴────────────┤
 * │ SectionControls                                         │
 * ├─────────────────────────────────────────────────────────┤
 * │ BottomTabBar (34px) — Timeline                          │
 * ├─────────────────────────────────────────────────────────┤
 * │ StatusBar (28px) — Status + units                       │
 * └─────────────────────────────────────────────────────────┘
 */
export default function App() {
  const featureDialogOpen = useEditorStore((s) => s.featureDialog.open);
  const bindingsRef = useKeyboardShortcuts();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    useEditorStore.getState().openMarkingMenu(e.clientX, e.clientY);
  };

  return (
    <div className="flex flex-col w-full h-screen bg-fusion-panel text-fusion-text font-sans overflow-hidden">
      {/* ── Top: Application Bar ── */}
      <DocumentHeader />

      {/* ── Workspace Tabs + Toolbar Ribbon ── */}
      <FeatureToolbar />

      {/* ── Selection Filter Bar ── */}
      <SelectionFilterBar />

      {/* ── Main Content Area ── */}
      <div className="flex flex-1 overflow-hidden relative" onContextMenu={handleContextMenu}>
        {/* Left Panel — Browser */}
        <FeatureTree />

        {/* Center — 3D Canvas with overlays */}
        <div className="flex-1 relative bg-fusion-canvas">
          <Viewport3D />

          {/* ViewCube — Fusion 360's signature navigation cube (top-right) */}
          <ViewCube />

          {/* Floating navigation bar (bottom-center of viewport) */}
          <ViewportNavBar />

          {/* Live preview badge */}
          <LivePreviewBadge />

          {/* Measure tool readout */}
          <MeasureReadout />

          {/* Sketch constraint overlay (DOF counter) */}
          <SketchConstraintOverlay />

          {/* Quick dimension prompt */}
          <QuickDimension />

          {/* Feature dialog floating panel */}
          {featureDialogOpen && <FeatureDialog />}
        </div>

        {/* Right Panel — Inspector */}
        <PropertiesPanel />

        {/* Floating tool panels */}
        <CustomWorkplaneManager />
        <MassProperties />
        <ConfigurationManager />
      </div>

      {/* ── Section Analysis Controls ── */}
      <SectionControls />

      {/* ── Bottom: Timeline ── */}
      <BottomTabBar />

      {/* ── Bottom: Status Bar ── */}
      <StatusBar />

      {/* ── Overlays ── */}
      <MarkingMenu />
      <ContextMenu />
      <CommandPalette bindings={bindingsRef} />
      <BoxSelectionOverlay />
      <ScriptConsole />
    </div>
  );
}
