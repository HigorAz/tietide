import { useEffect, useRef, useState } from 'react';
import { Check, Settings2, Tag as TagIcon } from 'lucide-react';
import type { Tag } from '@tietide/shared';
import { cn } from '@/utils/cn';

interface TagPickerPopoverProps {
  tags: Tag[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  triggerAriaLabel: string;
  triggerLabel?: string;
  onManage?: () => void;
  align?: 'left' | 'right';
}

/**
 * Self-contained tag multi-select popover. Each toggle emits the full updated id
 * list via onChange (the parent persists). Mirrors the click-outside dropdown
 * pattern used by BulkActionsToolbar's "Move to folder".
 */
export function TagPickerPopover({
  tags,
  selectedIds,
  onChange,
  triggerAriaLabel,
  triggerLabel,
  onManage,
  align = 'right',
}: TagPickerPopoverProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = new Set(selectedIds);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: globalThis.MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggle = (tagId: string): void => {
    const next = selected.has(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId];
    onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-text-secondary transition',
          'hover:bg-accent-teal/10 hover:text-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
        )}
      >
        <TagIcon aria-hidden="true" className="h-3.5 w-3.5" />
        {triggerLabel && <span>{triggerLabel}</span>}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Assign tags"
          className={cn(
            'absolute z-20 mt-1 max-h-72 w-56 overflow-auto rounded-md border border-white/10 bg-elevated p-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {tags.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-text-muted">No tags yet</p>
          ) : (
            tags.map((tag) => {
              const isSelected = selected.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={isSelected}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(tag.id);
                  }}
                  className="flex w-full items-center gap-2 truncate rounded px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-white/5 hover:text-text-primary"
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {isSelected && (
                      <Check aria-hidden="true" className="h-3.5 w-3.5 text-accent-teal" />
                    )}
                  </span>
                  {tag.color && (
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                  )}
                  <span className="truncate">{tag.name}</span>
                </button>
              );
            })
          )}
          {onManage && (
            <>
              <div className="my-1 border-t border-white/5" />
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onManage();
                }}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-text-muted hover:bg-white/5 hover:text-text-primary"
              >
                <Settings2 aria-hidden="true" className="h-3.5 w-3.5" />
                Manage tags
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
