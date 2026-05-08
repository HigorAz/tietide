import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { Tag } from '@tietide/shared';
import { cn } from '@/utils/cn';

interface TagManagerDialogProps {
  tags: Tag[];
  onClose: () => void;
  onCreate: (name: string, color: string | null) => Promise<void> | void;
  onUpdate: (id: string, patch: { name?: string; color?: string | null }) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

const PALETTE = ['#0ea5e9', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#14b8a6'];

export function TagManagerDialog({
  tags,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: TagManagerDialogProps): JSX.Element {
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<string | null>(PALETTE[0]!);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (): Promise<void> => {
    const name = draftName.trim();
    if (!name) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(name, draftColor);
      setDraftName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create tag');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tag-manager-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-white/10 bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="tag-manager-title" className="text-base font-semibold text-text-primary">
            Manage tags
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="mb-4 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="New tag name"
            aria-label="New tag name"
            className="flex-1 rounded-md border border-white/10 bg-elevated px-3 py-1.5 text-sm focus:border-accent-teal focus:outline-none"
          />
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Tag color">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={draftColor === c}
                aria-label={`Color ${c}`}
                onClick={() => setDraftColor(c)}
                className={cn(
                  'h-5 w-5 rounded-full border transition',
                  draftColor === c
                    ? 'ring-2 ring-accent-teal ring-offset-1 ring-offset-surface'
                    : 'border-white/20',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={submitting || !draftName.trim()}
            className="rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition hover:bg-accent-teal-hover disabled:opacity-50"
          >
            Add
          </button>
        </form>

        {error && (
          <p role="alert" className="mb-3 text-xs text-error">
            {error}
          </p>
        )}

        <ul aria-label="Tags" className="max-h-64 space-y-1 overflow-y-auto">
          {tags.length === 0 ? (
            <li className="rounded-md border border-dashed border-white/10 p-4 text-center text-sm text-text-secondary">
              No tags yet — create one above.
            </li>
          ) : (
            tags.map((tag) => (
              <TagRow
                key={tag.id}
                tag={tag}
                onUpdate={(patch) => onUpdate(tag.id, patch)}
                onDelete={() => onDelete(tag.id)}
              />
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

interface TagRowProps {
  tag: Tag;
  onUpdate: (patch: { name?: string; color?: string | null }) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}

function TagRow({ tag, onUpdate, onDelete }: TagRowProps): JSX.Element {
  const [name, setName] = useState(tag.name);
  const [editing, setEditing] = useState(false);

  const submitName = async (): Promise<void> => {
    setEditing(false);
    if (name.trim() && name !== tag.name) {
      await onUpdate({ name: name.trim() });
    } else {
      setName(tag.name);
    }
  };

  return (
    <li className="flex items-center gap-2 rounded-md border border-white/5 bg-elevated px-2 py-1.5">
      {tag.color && (
        <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
      )}
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void submitName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitName();
            if (e.key === 'Escape') {
              setName(tag.name);
              setEditing(false);
            }
          }}
          aria-label={`Rename ${tag.name}`}
          className="flex-1 rounded-md border border-white/10 bg-surface px-2 py-1 text-sm focus:border-accent-teal focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 truncate text-left text-sm text-text-primary hover:text-accent-teal"
        >
          {tag.name}
        </button>
      )}
      <button
        type="button"
        onClick={() => void onDelete()}
        aria-label={`Delete tag ${tag.name}`}
        className="text-text-muted hover:text-error"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
