import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  FORBIDDEN_NODE_TYPES,
  NODE_CATALOG,
  NODE_GROUP_LABELS,
  NODE_GROUP_ORDER,
  NodeCategory,
  NodeGroup,
  type NodeTypeDefinition,
} from '@tietide/shared';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/stores/authStore';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { pushRecentNode, readRecentNodes } from '@/utils/recentlyUsedNodes';
import { readCollapsedState, writeCollapsedState } from '@/utils/nodeLibraryCollapse';
import { getNodeIcon } from './nodes/nodeIcons';

export const NODE_LIBRARY_DRAG_MIME = 'application/reactflow-node-type';

const RECENT_SECTION_ID = 'recent';
const RECENT_SECTION_TITLE = 'Recently used';

interface SectionData {
  id: string;
  title: string;
  items: NodeTypeDefinition[];
}

const inferGroup = (category: NodeCategory): NodeGroup => {
  switch (category) {
    case NodeCategory.TRIGGER:
      return NodeGroup.TRIGGERS;
    case NodeCategory.LOGIC:
      return NodeGroup.LOGIC;
    case NodeCategory.ACTION:
    default:
      return NodeGroup.ACTIONS;
  }
};

const groupOf = (def: NodeTypeDefinition): NodeGroup => def.group ?? inferGroup(def.category);

const matches = (def: NodeTypeDefinition, query: string): boolean => {
  if (!query) return true;
  const needle = query.toLowerCase();
  if (def.name.toLowerCase().includes(needle)) return true;
  if (def.description.toLowerCase().includes(needle)) return true;
  if (def.provider && def.provider.toLowerCase().includes(needle)) return true;
  return NODE_GROUP_LABELS[groupOf(def)].toLowerCase().includes(needle);
};

export function NodeLibrary() {
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<NodeTypeDefinition['type'][]>(() => readRecentNodes(userId));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => readCollapsedState());

  // Re-hydrate recents when the signed-in user changes (login/logout).
  useEffect(() => {
    setRecent(readRecentNodes(userId));
  }, [userId]);

  useEffect(() => {
    writeCollapsedState(collapsed);
  }, [collapsed]);

  const visibleCatalog = useMemo(
    () => NODE_CATALOG.filter((d) => !FORBIDDEN_NODE_TYPES.has(d.type)),
    [],
  );

  const catalogByType = useMemo(() => {
    const map = new Map<string, NodeTypeDefinition>();
    for (const d of visibleCatalog) map.set(d.type, d);
    return map;
  }, [visibleCatalog]);

  const groupedSections = useMemo<SectionData[]>(() => {
    const filtered = visibleCatalog.filter((d) => matches(d, query));
    const buckets = new Map<NodeGroup, NodeTypeDefinition[]>();
    for (const def of filtered) {
      const g = groupOf(def);
      const list = buckets.get(g) ?? [];
      list.push(def);
      buckets.set(g, list);
    }
    return NODE_GROUP_ORDER.flatMap((g) => {
      const items = buckets.get(g) ?? [];
      if (items.length === 0) return [];
      return [{ id: g, title: NODE_GROUP_LABELS[g], items }];
    });
  }, [visibleCatalog, query]);

  const recentItems = useMemo(() => {
    if (!userId) return [];
    const seen = new Set<string>();
    const out: NodeTypeDefinition[] = [];
    for (const type of recent) {
      if (seen.has(type)) continue;
      const def = catalogByType.get(type);
      if (def && matches(def, query)) {
        seen.add(type);
        out.push(def);
      }
    }
    return out;
  }, [recent, catalogByType, query, userId]);

  const sections: SectionData[] = recentItems.length
    ? [
        { id: RECENT_SECTION_ID, title: RECENT_SECTION_TITLE, items: recentItems },
        ...groupedSections,
      ]
    : groupedSections;

  const toggle = (id: string): void => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDragStart = (def: NodeTypeDefinition, event: DragEvent<HTMLDivElement>): void => {
    event.dataTransfer.setData(NODE_LIBRARY_DRAG_MIME, def.type);
    event.dataTransfer.effectAllowed = 'copy';
    if (userId) {
      const next = pushRecentNode(userId, def.type);
      setRecent(next);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
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
            <div className="flex flex-col gap-3">
              {sections.map((section) => (
                <NodeLibrarySection
                  key={section.id}
                  section={section}
                  collapsed={Boolean(collapsed[section.id])}
                  onToggle={() => toggle(section.id)}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

interface SectionProps {
  section: SectionData;
  collapsed: boolean;
  onToggle: () => void;
  onDragStart: (def: NodeTypeDefinition, event: DragEvent<HTMLDivElement>) => void;
}

function NodeLibrarySection({ section, collapsed, onToggle, onDragStart }: SectionProps) {
  const listId = `node-library-section-${section.id}`;
  return (
    <section aria-label={section.title} className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={listId}
        className={cn(
          'flex items-center justify-between rounded px-1 py-1',
          'text-xs font-semibold uppercase tracking-wider text-text-secondary',
          'transition hover:text-text-primary',
          'focus:outline-none focus:ring-1 focus:ring-accent-teal',
        )}
      >
        <span>{section.title}</span>
        <ChevronDown
          aria-hidden
          className={cn('h-3.5 w-3.5 transition-transform', collapsed ? '-rotate-90' : 'rotate-0')}
        />
      </button>
      {!collapsed && (
        <ul id={listId} className="flex flex-col gap-1.5">
          {section.items.map((item) => (
            <li key={`${section.id}-${item.type}`}>
              <NodeLibraryItem item={item} onDragStart={onDragStart} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ItemProps {
  item: NodeTypeDefinition;
  onDragStart: (def: NodeTypeDefinition, event: DragEvent<HTMLDivElement>) => void;
}

function NodeLibraryItem({ item, onDragStart }: ItemProps) {
  const Icon = getNodeIcon(item.type);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-testid="node-library-item"
          draggable
          onDragStart={(event) => onDragStart(item, event)}
          title={item.description}
          aria-label={item.name}
          className={cn(
            'group flex cursor-grab items-center gap-3 rounded-md border border-white/5 bg-elevated px-3 py-2',
            'transition hover:border-accent-teal hover:bg-elevated/80 active:cursor-grabbing',
            'focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        >
          <span className="text-accent-teal">
            <Icon size={18} strokeWidth={2} aria-hidden />
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-text-primary">
            {item.name}
          </p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" align="start">
        {item.description}
      </TooltipContent>
    </Tooltip>
  );
}
