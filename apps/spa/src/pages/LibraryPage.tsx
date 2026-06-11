import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { Workflow } from '@tietide/shared';
import { useLibraryStore } from '@/stores/libraryStore';
import { useToastStore } from '@/stores/toastStore';
import { getNodeIcon } from '@/components/editor/nodes/nodeIcons';
import { ImportWorkflowButton } from '@/components/dashboard/ImportWorkflowButton';
import type { WorkflowTemplate } from '@/api/library';
import { cn } from '@/utils/cn';

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

// Fixed display order for the department sections; mirrors the API's
// LIBRARY_DEPARTMENT_ORDER. Any category not listed here is appended after,
// alphabetically, so the page never silently drops a template.
const DEPARTMENT_ORDER: readonly string[] = [
  'Sales',
  'Marketing',
  'Customer Success',
  'Engineering',
  'Product',
  'Operations & Finance',
];

interface DepartmentGroup {
  category: string;
  items: WorkflowTemplate[];
}

function groupByDepartment(templates: WorkflowTemplate[]): DepartmentGroup[] {
  const byCategory = new Map<string, WorkflowTemplate[]>();
  for (const template of templates) {
    const list = byCategory.get(template.category) ?? [];
    list.push(template);
    byCategory.set(template.category, list);
  }

  const groups: DepartmentGroup[] = [];
  for (const category of DEPARTMENT_ORDER) {
    const items = byCategory.get(category);
    if (items && items.length > 0) {
      groups.push({ category, items });
      byCategory.delete(category);
    }
  }
  // Unknown categories (defensive) keep their templates visible, sorted by name.
  for (const category of Array.from(byCategory.keys()).sort()) {
    groups.push({ category, items: byCategory.get(category)! });
  }
  return groups;
}

export function LibraryPage(): JSX.Element {
  const navigate = useNavigate();
  const { templates, status, error, search, fetch, setSearch, instantiate } = useLibraryStore();
  const toast = useToastStore((s) => s.show);

  const [busySlugs, setBusySlugs] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [templates, search]);

  const groups = useMemo(() => groupByDepartment(filtered), [filtered]);

  const handleImported = (created: Workflow): void => {
    navigate(`/workflows/${created.id}`, { state: { from: '/library' } });
  };

  const handleUseTemplate = async (slug: string): Promise<void> => {
    setBusySlugs((prev) => new Set(prev).add(slug));
    try {
      const created = await instantiate(slug);
      navigate(`/workflows/${created.id}`, { state: { from: '/library' } });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not instantiate template') });
    } finally {
      setBusySlugs((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col">
      <header className="border-b border-white/5 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Library</h1>
            <p className="text-xs text-text-secondary">
              Real-world workflow templates by department — pick one and start customizing.
            </p>
          </div>
          <ImportWorkflowButton variant="primary" onImported={handleImported} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <div data-tour="library-search" className="mb-6">
          <label className="relative flex items-center">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search templates…"
              aria-label="Search templates"
              className={cn(
                'w-full rounded-md border border-white/5 bg-elevated py-2 pl-9 pr-3',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
              )}
            />
          </label>
        </div>

        {status === 'loading' && templates.length === 0 && (
          <p className="text-sm text-text-secondary">Loading templates…</p>
        )}

        {status === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error"
          >
            <p>{error ?? 'Something went wrong'}</p>
            <button
              type="button"
              onClick={() => void fetch()}
              className="rounded-md bg-error/20 px-3 py-1 text-xs font-semibold text-error transition hover:bg-error/30"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && templates.length === 0 && (
          <p className="text-sm text-text-secondary">No templates available.</p>
        )}

        {templates.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-text-secondary">No templates match your filters.</p>
        )}

        {groups.length > 0 && (
          <div data-tour="library-grid" className="flex flex-col gap-10">
            {groups.map((group) => (
              <section key={group.category} aria-label={group.category}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
                  {group.category}
                </h2>
                <ul
                  aria-label={`${group.category} templates`}
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
                >
                  {group.items.map((template) => (
                    <TemplateCard
                      key={template.slug}
                      template={template}
                      isBusy={busySlugs.has(template.slug)}
                      onUse={handleUseTemplate}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

interface TemplateCardProps {
  template: WorkflowTemplate;
  isBusy: boolean;
  onUse: (slug: string) => void;
}

function TemplateCard({ template, isBusy, onUse }: TemplateCardProps): JSX.Element {
  return (
    <li
      data-testid="template-card"
      className="flex flex-col gap-3 rounded-lg border border-white/5 bg-surface p-4 transition hover:border-white/10"
    >
      <h3 className="text-sm font-semibold text-text-primary">{template.name}</h3>
      <p className="text-xs leading-relaxed text-text-secondary">{template.description}</p>
      <div className="flex flex-wrap items-center gap-2" aria-label="Node types">
        {template.nodeTypes.map((nodeType) => {
          const Icon = getNodeIcon(nodeType);
          return (
            <span
              key={nodeType}
              title={nodeType}
              aria-label={nodeType}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-elevated text-text-secondary"
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onUse(template.slug)}
        disabled={isBusy}
        className={cn(
          'mt-auto inline-flex items-center justify-center rounded-md bg-accent-teal px-3 py-2 text-sm font-semibold text-deep-blue transition',
          'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {isBusy ? 'Creating…' : 'Use template'}
      </button>
    </li>
  );
}

export default LibraryPage;
