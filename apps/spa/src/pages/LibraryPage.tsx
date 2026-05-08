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

export function LibraryPage(): JSX.Element {
  const navigate = useNavigate();
  const { templates, status, error, search, category, fetch, setSearch, setCategory, instantiate } =
    useLibraryStore();
  const toast = useToastStore((s) => s.show);

  const [busySlugs, setBusySlugs] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) set.add(t.category);
    return Array.from(set).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (category && t.category !== category) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    });
  }, [templates, search, category]);

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
              Pre-built workflow templates — pick one and start customizing.
            </p>
          </div>
          <ImportWorkflowButton variant="primary" onImported={handleImported} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-3">
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
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
              <CategoryChip
                label="All"
                selected={category === null}
                onClick={() => setCategory(null)}
                ariaLabel="Show all categories"
              />
              {categories.map((c) => (
                <CategoryChip
                  key={c}
                  label={c}
                  selected={category === c}
                  onClick={() => setCategory(c)}
                  ariaLabel={`Filter by ${c}`}
                />
              ))}
            </div>
          )}
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

        {filtered.length > 0 && (
          <ul
            aria-label="Workflow templates"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            {filtered.map((template) => (
              <TemplateCard
                key={template.slug}
                template={template}
                isBusy={busySlugs.has(template.slug)}
                onUse={handleUseTemplate}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

interface CategoryChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  ariaLabel: string;
}

function CategoryChip({ label, selected, onClick, ariaLabel }: CategoryChipProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition',
        'focus:outline-none focus:ring-1 focus:ring-accent-teal',
        selected
          ? 'border-accent-teal bg-accent-teal/15 text-accent-teal'
          : 'border-white/10 bg-elevated text-text-secondary hover:border-white/20 hover:text-text-primary',
      )}
    >
      {label}
    </button>
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
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-text-primary">{template.name}</h2>
        <span className="shrink-0 rounded-full border border-accent-teal/40 bg-accent-teal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-teal">
          {template.category}
        </span>
      </div>
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
