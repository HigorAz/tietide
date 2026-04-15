import { useMemo, useState, type DragEvent } from 'react';
import { NODE_CATALOG, NodeCategory, type NodeTypeDefinition } from '@tietide/shared';
import { cn } from '@/utils/cn';
import { getNodeIcon } from './nodes/nodeIcons';

export const NODE_LIBRARY_DRAG_MIME = 'application/reactflow-node-type';

interface SectionData {
  id: string;
  title: string;
  items: NodeTypeDefinition[];
}

const matches = (def: NodeTypeDefinition, query: string): boolean => {
  if (!query) return true;
  const needle = query.toLowerCase();
  return def.name.toLowerCase().includes(needle) || def.description.toLowerCase().includes(needle);
};

// Conditional is tagged LOGIC in the shared catalog; the sidebar surfaces it
// under "Actions" because that matches the user's mental model.
const groupForSidebar = (category: NodeCategory): 'triggers' | 'actions' =>
  category === NodeCategory.TRIGGER ? 'triggers' : 'actions';

export function NodeLibrary() {
  const [query, setQuery] = useState('');

  const sections = useMemo<SectionData[]>(() => {
    const filtered = NODE_CATALOG.filter((def) => matches(def, query));
    const triggers = filtered.filter((def) => groupForSidebar(def.category) === 'triggers');
    const actions = filtered.filter((def) => groupForSidebar(def.category) === 'actions');
    return [
      { id: 'triggers', title: 'Triggers', items: triggers },
      { id: 'actions', title: 'Actions', items: actions },
    ].filter((section) => section.items.length > 0);
  }, [query]);

  return (
    <aside
      data-testid="node-library"
      className="flex h-full w-72 flex-col gap-4 border-r border-white/5 bg-surface p-4"
    >
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Node Library
        </h2>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search nodes…"
          className={cn(
            'mt-2 w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
            'text-sm text-text-primary placeholder:text-text-muted',
            'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        />
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {sections.length === 0 ? (
          <p className="px-1 py-4 text-sm text-text-muted">No nodes match your search.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {sections.map((section) => (
              <NodeLibrarySection key={section.id} title={section.title} items={section.items} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

interface SectionProps {
  title: string;
  items: NodeTypeDefinition[];
}

function NodeLibrarySection({ title, items }: SectionProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.type}>
            <NodeLibraryItem item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ItemProps {
  item: NodeTypeDefinition;
}

function NodeLibraryItem({ item }: ItemProps) {
  const Icon = getNodeIcon(item.type);

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(NODE_LIBRARY_DRAG_MIME, item.type);
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      data-testid="node-library-item"
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'group flex cursor-grab items-start gap-3 rounded-md border border-white/5 bg-elevated px-3 py-2',
        'transition hover:border-accent-teal hover:bg-elevated/80 active:cursor-grabbing',
      )}
    >
      <span className="mt-0.5 text-accent-teal">
        <Icon size={18} strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight text-text-primary">{item.name}</p>
        <p className="mt-0.5 text-xs leading-snug text-text-secondary">{item.description}</p>
      </div>
    </div>
  );
}
