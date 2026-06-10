import { Search } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from './DataTable';
import { JsonTree } from './JsonTree';
import { RawJson } from './RawJson';
import { ViewToggle, type DataView } from './ViewToggle';

export interface DataViewerProps {
  value: unknown;
  /** Stable alias root (`trigger` / `steps.<alias>`) enabling tree "Copy path". */
  pillRef?: string;
  testId?: string;
  defaultView?: DataView;
}

/**
 * The single shared run-data viewer mounted on both run surfaces (timeline cards in
 * NodeRunInspection and the flat InspectorRunPanel). Owns a slim toolbar — search left,
 * Tree|Table|Raw toggle right — and the active pane. Search is tree-scoped: typing while
 * on Table/Raw snaps back to the tree and flattens it to matching `path: value` rows.
 */
export function DataViewer({
  value,
  pillRef,
  testId = 'data-viewer',
  defaultView = 'tree',
}: DataViewerProps): JSX.Element {
  const [view, setView] = useState<DataView>(defaultView);
  const [search, setSearch] = useState('');

  const handleSearch = (next: string): void => {
    setSearch(next);
    // Search only makes sense against the tree → snap back when typing elsewhere.
    if (next.trim().length > 0 && view !== 'tree') setView('tree');
  };

  return (
    <div data-testid={testId}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="relative flex items-center">
          <Search size={12} className="absolute left-2 text-text-muted" />
          <input
            type="text"
            aria-label="Search data"
            placeholder="Search data…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="h-6 w-40 rounded border border-white/10 bg-deep-blue/40 pl-6 pr-2 text-[11px] text-text-primary placeholder:text-text-muted focus:border-accent-teal/50 focus:outline-none"
          />
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === 'tree' && <JsonTree value={value} pillRef={pillRef} searchQuery={search} />}
      {view === 'table' && <DataTable value={value} />}
      {view === 'raw' && <RawJson value={value} />}
    </div>
  );
}
