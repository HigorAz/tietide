import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Activity, ChevronRight, FileText, Power, Trash2 } from 'lucide-react';
import type { Tag } from '@tietide/shared';
import type { WorkflowListItem } from '@/api/workflows';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { formatRelativeTime } from './relativeTime';
import { TagChips } from '@/components/workflows/TagChips';
import { TagPickerPopover } from '@/components/workflows/TagPickerPopover';

export interface WorkflowRowProps {
  workflow: WorkflowListItem;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleActive: (id: string, next: boolean) => void;
  onDelete: (id: string) => void;
  /** Open the documentation pop-up for this workflow (view / edit / download). */
  onOpenDocs: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  availableTags: Tag[];
  onSetTags: (id: string, tagIds: string[]) => void;
  onManageTags?: () => void;
  isToggling?: boolean;
  isDeleting?: boolean;
}

const stop = (event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>): void => {
  event.preventDefault();
  event.stopPropagation();
};

export function WorkflowRow({
  workflow,
  selected,
  onOpen,
  onToggleActive,
  onDelete,
  onOpenDocs,
  onToggleSelect,
  onRename,
  availableTags,
  onSetTags,
  onManageTags,
  isToggling,
  isDeleting,
}: WorkflowRowProps): JSX.Element {
  const { id, name, isActive, updatedAt, executionCount, documentation, tags } = workflow;

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Reset draft when the underlying workflow name changes (e.g. after a successful save).
  useEffect(() => {
    if (!editing) setDraftName(name);
  }, [name, editing]);

  const handleOpen = (): void => onOpen(id);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };

  const startEditing = (event: MouseEvent<HTMLElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    setDraftName(name);
    setEditing(true);
  };

  const cancelEditing = (): void => {
    setDraftName(name);
    setEditing(false);
  };

  const submitRename = async (): Promise<void> => {
    if (submittingRef.current) return;
    const next = draftName.trim();
    if (next === name) {
      cancelEditing();
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onRename(id, next);
      setEditing(false);
    } catch {
      // Parent toasts; row stays in edit mode so the user can correct.
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  };

  const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    onToggleSelect(id);
  };

  const docsLabel = documentation ? 'View docs' : 'Generate docs';
  const docsAriaLabel = documentation
    ? `View documentation for ${name}`
    : `Generate documentation for ${name}`;

  return (
    <li
      className={cn(
        'rounded-lg border border-white/5 bg-surface transition hover:border-accent-teal/40',
        selected && 'border-accent-teal/40 bg-accent-teal/[0.04]',
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <input
          type="checkbox"
          aria-label={`Select ${name}`}
          checked={selected}
          onChange={handleCheckboxChange}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className={cn(
            'h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-elevated text-accent-teal',
            'focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        />

        <div
          role="button"
          tabIndex={0}
          aria-label={`Open ${name}`}
          onClick={handleOpen}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex flex-1 cursor-pointer items-center gap-3 rounded-md text-left',
            'focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
          {editing ? (
            <input
              autoFocus
              type="text"
              value={draftName}
              aria-label={`Rename ${name}`}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={() => void submitRename()}
              onClick={stop}
              onPointerDown={(event) => event.stopPropagation()}
              disabled={submitting}
              className={cn(
                'flex-1 truncate rounded-md border border-accent-teal/40 bg-elevated px-2 py-1 text-sm text-text-primary',
                'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
                'disabled:cursor-wait disabled:opacity-60',
              )}
            />
          ) : (
            <h3
              role="button"
              tabIndex={0}
              onClick={startEditing}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  setDraftName(name);
                  setEditing(true);
                }
              }}
              title={`Click to rename ${name}`}
              className="truncate cursor-text rounded text-sm font-semibold text-text-primary hover:text-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal"
            >
              {name}
            </h3>
          )}
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              isActive ? 'bg-accent-teal/15 text-accent-teal' : 'bg-white/5 text-text-secondary',
            )}
          >
            {isActive ? 'Active' : 'Inactive'}
          </span>
          <TagChips tags={tags} />
          <span
            aria-label={`${executionCount} executions`}
            className="ml-auto inline-flex items-center gap-1.5 text-xs text-text-secondary"
          >
            <Activity aria-hidden="true" className="h-3.5 w-3.5" />
            {executionCount}
          </span>
          <span className="text-xs text-text-secondary">
            Updated {formatRelativeTime(updatedAt)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            aria-label={`Toggle active for ${name}`}
            onClick={(event) => {
              stop(event);
              if (isToggling) return;
              onToggleActive(id, !isActive);
            }}
            disabled={isToggling}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition',
              'focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
              isActive
                ? 'text-accent-teal hover:bg-accent-teal/10'
                : 'text-text-secondary hover:bg-white/5',
            )}
          >
            {isToggling ? (
              <Spinner size="sm" className="h-3.5 w-3.5" label={`Updating ${name}`} />
            ) : (
              <Power aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {isActive ? 'On' : 'Off'}
          </button>

          <button
            type="button"
            aria-label={docsAriaLabel}
            onClick={(event) => {
              stop(event);
              onOpenDocs(id);
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-text-secondary transition',
              'hover:bg-accent-teal/10 hover:text-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
            )}
          >
            <FileText aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap">{docsLabel}</span>
          </button>

          <TagPickerPopover
            tags={availableTags}
            selectedIds={tags.map((t) => t.id)}
            onChange={(next) => onSetTags(id, next)}
            onManage={onManageTags}
            triggerAriaLabel={`Edit tags for ${name}`}
          />

          <button
            type="button"
            aria-label={`Delete ${name}`}
            onClick={(event) => {
              stop(event);
              if (isDeleting) return;
              onDelete(id);
            }}
            disabled={isDeleting}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-text-secondary transition',
              'hover:bg-error/10 hover:text-error focus:outline-none focus:ring-1 focus:ring-error',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {isDeleting ? (
              <Spinner size="sm" className="h-3.5 w-3.5" label={`Deleting ${name}`} />
            ) : (
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </li>
  );
}
