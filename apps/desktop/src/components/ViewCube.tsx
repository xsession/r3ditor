import { useEditorStore } from '../store/editorStore';
import clsx from 'clsx';
import { useState } from 'react';

/**
 * Fusion 360 ViewCube — the signature navigation cube in the top-right corner.
 *
 * This is an HTML/CSS implementation that overlays the 3D viewport.
 * In Fusion 360, it's a 3D cube with face labels (FRONT, BACK, TOP, BOTTOM, LEFT, RIGHT)
 * plus corner/edge hover targets. Clicking sets the camera to that view.
 *
 * Below the cube are the "Home" button and compass ring showing N/S/E/W.
 */

type ViewDirection = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'iso';

const faceLabels: { id: ViewDirection; label: string; style: React.CSSProperties }[] = [
  { id: 'front', label: 'FRONT', style: { transform: 'rotateY(0deg) translateZ(30px)' } },
  { id: 'back', label: 'BACK', style: { transform: 'rotateY(180deg) translateZ(30px)' } },
  { id: 'right', label: 'RIGHT', style: { transform: 'rotateY(90deg) translateZ(30px)' } },
  { id: 'left', label: 'LEFT', style: { transform: 'rotateY(-90deg) translateZ(30px)' } },
  { id: 'top', label: 'TOP', style: { transform: 'rotateX(90deg) translateZ(30px)' } },
  { id: 'bottom', label: 'BOTTOM', style: { transform: 'rotateX(-90deg) translateZ(30px)' } },
];

export function ViewCube() {
  const [hovered, setHovered] = useState<ViewDirection | null>(null);

  const handleClick = (dir: ViewDirection) => {
    useEditorStore.setState({ viewCommand: dir });
  };

  return (
    <div className="absolute top-3 right-3 z-30 select-none" style={{ perspective: '400px' }}>
      {/* 3D Cube container */}
      <div className="relative w-[60px] h-[60px]" style={{ transformStyle: 'preserve-3d' }}>
        <div
          className="w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
            transform: 'rotateX(-25deg) rotateY(-35deg)',
          }}
        >
          {faceLabels.map((face) => (
            <button
              key={face.id}
              className={clsx(
                'absolute inset-0 w-[60px] h-[60px] flex items-center justify-center',
                'text-[7px] font-bold tracking-[0.1em] backface-hidden transition-colors cursor-pointer',
                'border border-[#555]/60 rounded-[2px]',
                hovered === face.id
                  ? 'bg-fusion-blue/30 text-fusion-text-bright border-fusion-blue/50'
                  : 'bg-[#404040]/90 text-fusion-text-secondary hover:bg-[#505050]/90',
              )}
              style={{
                ...face.style,
                backfaceVisibility: 'hidden',
              }}
              onClick={() => handleClick(face.id)}
              onMouseEnter={() => setHovered(face.id)}
              onMouseLeave={() => setHovered(null)}
            >
              {face.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compass directions below the cube */}
      <div className="flex items-center justify-center mt-1">
        <div className="flex items-center gap-2 text-[8px] text-fusion-text-disabled">
          <span>N</span>
          <div className="w-[20px] h-px bg-fusion-border-light" />
          <span>S</span>
        </div>
      </div>

      {/* Quick view buttons below */}
      <div className="flex items-center justify-center gap-1 mt-1.5">
        <ViewShortcut label="⌂" title="Home (Isometric)" onClick={() => handleClick('iso')} />
        <ViewShortcut label="▣" title="Fit All" onClick={() => useEditorStore.setState({ viewCommand: 'zoomFit' })} />
      </div>
    </div>
  );
}

function ViewShortcut({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      className="flex items-center justify-center w-[20px] h-[20px] rounded-fusion text-[10px] text-fusion-text-disabled hover:text-fusion-text-secondary hover:bg-fusion-hover transition-colors"
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
