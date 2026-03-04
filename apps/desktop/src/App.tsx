import { Toolbar } from './components/Toolbar';
import { FeatureTree } from './components/FeatureTree';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Viewport3D } from './components/Viewport3D';
import { StatusBar } from './components/StatusBar';

export default function App() {
  return (
    <div className="flex flex-col w-full h-screen bg-editor-bg text-editor-text">
      {/* Top Toolbar */}
      <Toolbar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Feature Tree */}
        <FeatureTree />

        {/* Center — 3D Viewport */}
        <div className="flex-1 relative">
          <Viewport3D />
        </div>

        {/* Right Panel — Properties */}
        <PropertiesPanel />
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />
    </div>
  );
}
