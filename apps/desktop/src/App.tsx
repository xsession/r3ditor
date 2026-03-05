import { DocumentHeader } from './components/DocumentHeader';
import { FeatureToolbar } from './components/FeatureToolbar';
import { FeatureTree } from './components/FeatureTree';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Viewport3D } from './components/Viewport3D';
import { FeatureDialog } from './components/FeatureDialog';
import { BottomTabBar } from './components/BottomTabBar';
import { StatusBar } from './components/StatusBar';
import { useEditorStore } from './store/editorStore';

export default function App() {
  const featureDialogOpen = useEditorStore((s) => s.featureDialog.open);

  return (
    <div className="flex flex-col w-full h-screen bg-fusion-panel text-fusion-text font-sans">
      {/* ── Top: Application Bar (Fusion 360) ── */}
      <DocumentHeader />

      {/* ── Workspace Tabs + Toolbar Ribbon ── */}
      <FeatureToolbar />

      {/* ── Main Content Area ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Panel — Browser */}
        <FeatureTree />

        {/* Center — 3D Canvas */}
        <div className="flex-1 relative">
          <Viewport3D />

          {/* Feature dialog floating panel */}
          {featureDialogOpen && <FeatureDialog />}
        </div>

        {/* Right Panel — Inspector */}
        <PropertiesPanel />
      </div>

      {/* ── Bottom: Timeline ── */}
      <BottomTabBar />

      {/* ── Bottom: Navigation Bar ── */}
      <StatusBar />
    </div>
  );
}
