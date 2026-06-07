import type { WorkflowTagSummary } from '@tietide/shared';
import { cn } from '@/utils/cn';

interface TagChipsProps {
  tags: WorkflowTagSummary[];
  className?: string;
}

/** Compact, read-only display of a workflow's assigned tags. */
export function TagChips({ tags, className }: TagChipsProps): JSX.Element | null {
  if (tags.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-elevated px-2 py-0.5 text-[11px] text-text-secondary"
        >
          {tag.color && (
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
          )}
          {tag.name}
        </span>
      ))}
    </div>
  );
}
