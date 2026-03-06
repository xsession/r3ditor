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
import { useEditorStore } from './store/editorStore';
import { useKeyboardShortcuts } from './shortcuts/useKeyboardShortcuts';

export default function App() {
  const featureDialogOpen = useEditorStore((s) => s.featureDialog.open);
  const bindingsRef = useKeyboardShortcuts();

  // Right-click context menu handler on the main content area
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    useEditorStore.getState().openMarkingMenu(e.clientX, e.clientY);
  };

  return (
    <div className="flex flex-col w-full h-screen bg-fusion-panel text-fusion-text font-sans">
      {/* ── Top: Application Bar (Fusion 360) ── */}
      <DocumentHeader />

      {/* ── Workspace Tabs + Toolbar Ribbon ── */}
      <FeatureToolbar />

      {/* ── Selection Filter Bar ── */}
      <SelectionFilterBar />

      {/* ── Main Content Area ── */}
      <div className="flex flex-1 overflow-hidden relative" onContextMenu={handleContextMenu}>
        {/* Left Panel — Browser */}
        <FeatureTree />

        {/* Center — 3D Canvas */}
        <div className="flex-1 relative">
          <Viewport3D />

          {/* Live preview badge */}
          <LivePreviewBadge />

          {/* Measure tool readout */}
          <MeasureReadout />

          {/* Sketch constraint overlay (DOF counter, auto-constraints) */}
          <SketchConstraintOverlay />

          {/* Quick dimension prompt after drawing geometry */}
          <QuickDimension />

          {/* Feature dialog floating panel */}
          {featureDialogOpen && <FeatureDialog />}
        </div>

        {/* Right Panel — Inspector */}
        <PropertiesPanel />

        {/* Floating tool panels (absolutely positioned) */}
        <CustomWorkplaneManager />
        <MassProperties />
        <ConfigurationManager />
      </div>

      {/* ── Section Analysis Controls ── */}
      <SectionControls />

      {/* ── Bottom: Timeline ── */}
      <BottomTabBar />

      {/* ── Bottom: Navigation Bar ── */}
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
