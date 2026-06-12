export type DataView = 'tree' | 'table' | 'raw';

const VIEWS: ReadonlyArray<{ value: DataView; label: string }> = [
  { value: 'tree', label: 'Tree' },
  { value: 'table', label: 'Table' },
  { value: 'raw', label: 'Raw' },
];

export interface ViewToggleProps {
  view: DataView;
  onChange: (view: DataView) => void;
}

/**
 * Segmented Tree|Table|Raw control. Mirrors Tabs.tsx's visual language but is plain
 * buttons (not Radix) so it can live inside clickable section headers — every click
 * stopPropagation()s to avoid toggling the host card.
 */
export function ViewToggle({ view, onChange }: ViewToggleProps): JSX.Element {
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded border border-white/10">
      {VIEWS.map(({ value, label }) => {
        const active = value === view;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition ${
              active
                ? 'bg-accent-teal/15 text-accent-teal'
                : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onChange(value);
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
