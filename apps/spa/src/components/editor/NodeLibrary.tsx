import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  FORBIDDEN_NODE_TYPES,
  NODE_CATALOG,
  NodeCategory,
  type NodeTypeDefinition,
} from '@tietide/shared';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/stores/authStore';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { pushRecentNode, readRecentNodes } from '@/utils/recentlyUsedNodes';
import { readCollapsedState, writeCollapsedState } from '@/utils/nodeLibraryCollapse';
import { getNodeIcon } from './nodes/nodeIcons';
import { BrandIcon } from './BrandIcon';
import { APP_INFO, APP_ORDER, getAppIdForNodeType, type AppId } from './nodeApps';

export const NODE_LIBRARY_DRAG_MIME = 'application/reactflow-node-type';

const RECENT_SECTION_ID = 'recent';
const RECENT_SECTION_TITLE = 'Recently used';

type SectionId = 'triggers' | 'actions' | 'logic' | 'custom';

interface AppGroup {
  appId: AppId;
  items: NodeTypeDefinition[];
}

interface Section {
  id: SectionId;
  title: string;
  apps: AppGroup[];
}

const sectionForCategory = (category: NodeCategory): SectionId | null => {
  switch (category) {
    case NodeCategory.TRIGGER:
      return 'triggers';
    case NodeCategory.ACTION:
      return 'actions';
    case NodeCategory.LOGIC:
      return 'logic';
    case NodeCategory.ANNOTATION:
      return 'custom';
    default:
      return null;
  }
};

const SECTION_TITLES: Record<SectionId, string> = {
  triggers: 'Triggers',
  actions: 'Actions',
  logic: 'Logic',
  custom: 'Custom',
};

const matches = (def: NodeTypeDefinition, query: string): boolean => {
  if (!query) return true;
  const needle = query.toLowerCase();
  if (def.name.toLowerCase().includes(needle)) return true;
  if (def.description.toLowerCase().includes(needle)) return true;
  if (def.provider && def.provider.toLowerCase().includes(needle)) return true;
  const appLabel = APP_INFO[getAppIdForNodeType(def.type)]?.label ?? '';
  return appLabel.toLowerCase().includes(needle);
};

const sectionKey = (id: SectionId): string => `section:${id}`;
const appKey = (section: SectionId, appId: AppId): string => `app:${section}:${appId}`;

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

  const sections = useMemo<Section[]>(() => {
    const filtered = visibleCatalog.filter((d) => matches(d, query));

    const bySection = new Map<SectionId, Map<AppId, NodeTypeDefinition[]>>();
    for (const def of filtered) {
      const section = sectionForCategory(def.category);
      if (!section) continue;
      const appId = getAppIdForNodeType(def.type);
      const apps = bySection.get(section) ?? new Map<AppId, NodeTypeDefinition[]>();
      const list = apps.get(appId) ?? [];
      list.push(def);
      apps.set(appId, list);
      bySection.set(section, apps);
    }

    const orderedSections: SectionId[] = ['triggers', 'actions', 'logic', 'custom'];
    return orderedSections.flatMap((sectionId) => {
      const apps = bySection.get(sectionId);
      if (!apps || apps.size === 0) return [];
      const orderedApps: AppGroup[] = APP_ORDER.flatMap((appId) => {
        const items = apps.get(appId);
        if (!items || items.length === 0) return [];
        return [{ appId, items }];
      });
      return [{ id: sectionId, title: SECTION_TITLES[sectionId], apps: orderedApps }];
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

  // Default collapse state: top-level sections are EXPANDED by default; app
  // groups are COLLAPSED by default. When a search query is active, every app
  // group that has matching items auto-expands (overriding the stored state)
  // so users see results without manual clicks.
  const isSectionCollapsed = (id: SectionId): boolean => {
    const explicit = collapsed[sectionKey(id)];
    return explicit === true; // default: expanded
  };
  const isAppCollapsed = (section: SectionId, appId: AppId): boolean => {
    if (query.trim().length > 0) return false;
    const explicit = collapsed[appKey(section, appId)];
    return explicit !== false; // default: collapsed
  };

  // Toggles flip the user-visible collapsed state, accounting for the per-row
  // default (sections default expanded, apps default collapsed). Using
  // !prev[id] would silently no-op the first click for app groups because
  // !undefined === true matches the default-collapsed state.
  const toggleRecent = (): void => {
    setCollapsed((prev) => ({ ...prev, [RECENT_SECTION_ID]: !Boolean(prev[RECENT_SECTION_ID]) }));
  };
  const toggleSection = (id: SectionId): void => {
    const currentlyCollapsed = isSectionCollapsed(id);
    setCollapsed((prev) => ({ ...prev, [sectionKey(id)]: !currentlyCollapsed }));
  };
  const toggleApp = (section: SectionId, appId: AppId): void => {
    const currentlyCollapsed = isAppCollapsed(section, appId);
    setCollapsed((prev) => ({ ...prev, [appKey(section, appId)]: !currentlyCollapsed }));
  };

  const handleDragStart = (def: NodeTypeDefinition, event: DragEvent<HTMLDivElement>): void => {
    event.dataTransfer.setData(NODE_LIBRARY_DRAG_MIME, def.type);
    event.dataTransfer.effectAllowed = 'copy';
    if (userId) {
      const next = pushRecentNode(userId, def.type);
      setRecent(next);
    }
  };

  const showRecent = recentItems.length > 0;

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
          {sections.length === 0 && !showRecent ? (
            <p className="px-1 py-4 text-sm text-text-muted">No nodes match your search.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {showRecent && (
                <RecentSection
                  items={recentItems}
                  collapsed={Boolean(collapsed[RECENT_SECTION_ID])}
                  onToggle={toggleRecent}
                  onDragStart={handleDragStart}
                />
              )}
              {sections.map((section) => (
                <NodeLibrarySection
                  key={section.id}
                  section={section}
                  isCollapsed={isSectionCollapsed(section.id)}
                  isAppCollapsed={(appId) => isAppCollapsed(section.id, appId)}
                  onToggleSection={() => toggleSection(section.id)}
                  onToggleApp={(appId) => toggleApp(section.id, appId)}
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

interface RecentSectionProps {
  items: NodeTypeDefinition[];
  collapsed: boolean;
  onToggle: () => void;
  onDragStart: (def: NodeTypeDefinition, event: DragEvent<HTMLDivElement>) => void;
}

function RecentSection({ items, collapsed, onToggle, onDragStart }: RecentSectionProps) {
  const listId = `node-library-section-${RECENT_SECTION_ID}`;
  return (
    <section aria-label={RECENT_SECTION_TITLE} className="flex flex-col gap-2">
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
        <span>{RECENT_SECTION_TITLE}</span>
        <ChevronDown
          aria-hidden
          className={cn('h-3.5 w-3.5 transition-transform', collapsed ? '-rotate-90' : 'rotate-0')}
        />
      </button>
      {!collapsed && (
        <ul id={listId} className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={`${RECENT_SECTION_ID}-${item.type}`}>
              <NodeLibraryItem item={item} onDragStart={onDragStart} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface SectionProps {
  section: Section;
  isCollapsed: boolean;
  isAppCollapsed: (appId: AppId) => boolean;
  onToggleSection: () => void;
  onToggleApp: (appId: AppId) => void;
  onDragStart: (def: NodeTypeDefinition, event: DragEvent<HTMLDivElement>) => void;
}

function NodeLibrarySection({
  section,
  isCollapsed,
  isAppCollapsed,
  onToggleSection,
  onToggleApp,
  onDragStart,
}: SectionProps) {
  const listId = `node-library-section-${section.id}`;
  return (
    <section
      aria-label={section.title}
      data-testid={`node-library-section-${section.id}`}
      className="flex flex-col gap-2"
    >
      <button
        type="button"
        onClick={onToggleSection}
        aria-expanded={!isCollapsed}
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
          className={cn(
            'h-3.5 w-3.5 transition-transform',
            isCollapsed ? '-rotate-90' : 'rotate-0',
          )}
        />
      </button>
      {!isCollapsed && (
        <div id={listId} className="flex flex-col gap-2 pl-1">
          {section.apps.map((app) => (
            <NodeLibraryAppGroup
              key={`${section.id}-${app.appId}`}
              sectionId={section.id}
              appId={app.appId}
              items={app.items}
              collapsed={isAppCollapsed(app.appId)}
              onToggle={() => onToggleApp(app.appId)}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface AppGroupProps {
  sectionId: SectionId;
  appId: AppId;
  items: NodeTypeDefinition[];
  collapsed: boolean;
  onToggle: () => void;
  onDragStart: (def: NodeTypeDefinition, event: DragEvent<HTMLDivElement>) => void;
}

function NodeLibraryAppGroup({
  sectionId,
  appId,
  items,
  collapsed,
  onToggle,
  onDragStart,
}: AppGroupProps) {
  const info = APP_INFO[appId];
  const listId = `node-library-app-${sectionId}-${appId}`;
  return (
    <div data-testid={`node-library-app-${sectionId}-${appId}`} className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={listId}
        className={cn(
          'flex items-center justify-between gap-2 rounded px-1 py-1',
          'text-xs font-medium text-text-secondary',
          'transition hover:text-text-primary',
          'focus:outline-none focus:ring-1 focus:ring-accent-teal',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <BrandIcon appId={appId} size={14} colored />
          <span className="truncate">{info.label}</span>
          <span className="text-text-muted">({items.length})</span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn('h-3.5 w-3.5 transition-transform', collapsed ? '-rotate-90' : 'rotate-0')}
        />
      </button>
      {!collapsed && (
        <ul id={listId} className="flex flex-col gap-1.5 pl-1">
          {items.map((item) => (
            <li key={`${sectionId}-${appId}-${item.type}`}>
              <NodeLibraryItem item={item} onDragStart={onDragStart} />
            </li>
          ))}
        </ul>
      )}
    </div>
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
