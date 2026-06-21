import type { JSX } from 'react';
import { BoxSelect, Hand } from 'lucide-react';
import { useEditorStore, type InteractionMode } from '@/stores/editorStore';
import { cn } from '@/utils/cn';

const MODES: ReadonlyArray<{
  mode: InteractionMode;
  label: string;
  title: string;
  Icon: typeof Hand;
}> = [
  {
    mode: 'pan',
    label: 'Pan mode',
    title: 'Pan mode — drag the canvas to move; hold Shift/Alt and drag to box-select',
    Icon: Hand,
  },
  {
    mode: 'select',
    label: 'Select mode',
    title: 'Select mode — drag to box-select; hold Space and drag to pan',
    Icon: BoxSelect,
  },
];

/**
 * Figma-style pan/select segmented toggle for the canvas. Reads and writes
 * `interactionMode` on the editor store, which Canvas feeds into
 * editorTouchProps. Rendered inline in the EditorToolbar.
 */
export function InteractionModeToggle(): JSX.Element {
  const interactionMode = useEditorStore((s) => s.interactionMode);
  const setInteractionMode = useEditorStore((s) => s.setInteractionMode);

  return (
    <div
      data-testid="interaction-mode-toggle"
      role="group"
      aria-label="Canvas interaction mode"
      className="flex items-center gap-0.5 rounded border border-white/10 p-0.5"
    >
      {MODES.map(({ mode, label, title, Icon }) => {
        const active = interactionMode === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={title}
            onClick={() => setInteractionMode(mode)}
            className={cn(
              'inline-flex items-center rounded px-1.5 py-1 transition',
              'focus:outline-none focus:ring-1 focus:ring-accent-teal',
              active
                ? 'bg-accent-teal text-deep-blue'
                : 'text-text-muted hover:bg-elevated hover:text-text-primary',
            )}
          >
            <Icon size={15} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
