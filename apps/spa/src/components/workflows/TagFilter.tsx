import { Settings2, X } from 'lucide-react';
import type { Tag } from '@tietide/shared';
import { cn } from '@/utils/cn';

interface TagFilterProps {
  tags: Tag[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
  onClear: () => void;
  onManage: () => void;
}

export function TagFilter({
  tags,
  selectedIds,
  onToggle,
  onClear,
  onManage,
}: TagFilterProps): JSX.Element {
  const selectedSet = new Set(selectedIds);
  return (
    <div role="region" aria-label="Tag filter" className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-text-muted">Tags</span>
      {tags.length === 0 ? (
        <span className="text-xs text-text-muted">No tags yet</span>
      ) : (
        tags.map((tag) => {
          const selected = selectedSet.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggle(tag.id)}
              aria-pressed={selected}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition',
                selected
                  ? 'border-accent-teal bg-accent-teal/15 text-accent-teal'
                  : 'border-white/10 bg-elevated text-text-secondary hover:border-white/20',
              )}
            >
              {tag.color && (
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
              )}
              {tag.name}
            </button>
          );
        })
      )}
      {selectedIds.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear tag filter"
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-text-muted hover:text-text-primary"
        >
          <X className="h-3 w-3" /> clear
        </button>
      )}
      <button
        type="button"
        onClick={onManage}
        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted transition hover:bg-white/5 hover:text-text-primary"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Manage tags
      </button>
    </div>
  );
}
