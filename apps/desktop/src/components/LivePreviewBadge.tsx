import { useEditorStore } from '../store/editorStore';

/**
 * Live Preview indicator — shows a floating badge when a feature dialog is open
 * to indicate that preview geometry is being rendered in the viewport.
 *
 * The actual 3D preview rendering is handled by Viewport3D based on featureDialog state.
 * This component provides the UI overlay.
 */
export function LivePreviewBadge() {
  const { featureDialog } = useEditorStore();

  if (!featureDialog.open || !featureDialog.featureType) return null;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-fusion-surface/90 border border-fusion-border-light shadow-lg backdrop-blur-sm">
      <div className="w-2 h-2 rounded-full bg-fusion-orange animate-pulse" />
      <span className="text-[10px] text-fusion-text-secondary font-medium">
        Live Preview — {featureDialog.featureType}
      </span>
    </div>
  );
}
