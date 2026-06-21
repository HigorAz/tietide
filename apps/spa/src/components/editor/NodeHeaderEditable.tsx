import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Pencil } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';

interface NodeHeaderEditableProps {
  nodeId: string;
  /** Current node title (`data.label`). */
  label: string;
  /** Current description to display (custom override, or the catalog default). */
  description: string;
  /** Catalog default — shown as the textarea placeholder when the field is empty. */
  descriptionPlaceholder?: string;
}

/**
 * The config-panel header's editable title + description. Click either (or the
 * pencil affordance that appears on hover) to edit inline; Enter commits, Escape
 * cancels. Renaming/description edits flow through the editorStore so they land
 * on the canvas node and persist to the workflow definition.
 */
export function NodeHeaderEditable({
  nodeId,
  label,
  description,
  descriptionPlaceholder,
}: NodeHeaderEditableProps): React.ReactElement {
  const renameNode = useEditorStore((s) => s.renameNode);
  const setNodeDescription = useEditorStore((s) => s.setNodeDescription);
  const pendingHeaderEdit = useEditorStore((s) => s.pendingHeaderEdit);
  const clearPendingHeaderEdit = useEditorStore((s) => s.clearPendingHeaderEdit);

  const [editing, setEditing] = useState<'label' | 'description' | null>(null);
  const [draft, setDraft] = useState('');
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const descInputRef = useRef<HTMLTextAreaElement | null>(null);

  const beginEdit = (field: 'label' | 'description'): void => {
    setDraft(field === 'label' ? label : description);
    setEditing(field);
  };

  // Honor the one-shot "begin rename" signal from the right-click → Rename
  // action. Keyed on the signal only; `label` is read fresh on the render the
  // signal flips it on.
  useEffect(() => {
    if (pendingHeaderEdit === 'label') {
      setDraft(label);
      setEditing('label');
      clearPendingHeaderEdit();
    }
  }, [pendingHeaderEdit, label, clearPendingHeaderEdit]);

  useEffect(() => {
    if (editing === 'label') {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    } else if (editing === 'description') {
      descInputRef.current?.focus();
    }
  }, [editing]);

  const commitLabel = (): void => {
    renameNode(nodeId, draft); // store ignores empty/whitespace and trims
    setEditing(null);
  };

  const commitDescription = (): void => {
    setNodeDescription(nodeId, draft.trim());
    setEditing(null);
  };

  const cancel = (): void => setEditing(null);

  const onLabelKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitLabel();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const onDescriptionKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitDescription();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const inputClass = cn(
    'w-full rounded border border-white/10 bg-elevated px-1.5 py-0.5',
    'outline-none focus:ring-1 focus:ring-accent-teal',
  );

  return (
    <div className="min-w-0">
      {editing === 'label' ? (
        <input
          ref={labelInputRef}
          data-testid="node-header-title-input"
          value={draft}
          maxLength={255}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={onLabelKeyDown}
          className={cn(inputClass, 'text-sm font-semibold text-text-primary')}
        />
      ) : (
        <button
          type="button"
          data-testid="node-header-title"
          onClick={() => beginEdit('label')}
          title="Click to rename"
          className={cn(
            'group flex w-full items-center gap-1 rounded text-left',
            'hover:bg-elevated/60',
          )}
        >
          <h2 className="truncate text-sm font-semibold text-text-primary">{label}</h2>
          <Pencil
            size={11}
            className="shrink-0 text-text-muted opacity-0 transition group-hover:opacity-100"
            aria-hidden
          />
        </button>
      )}

      {editing === 'description' ? (
        <textarea
          ref={descInputRef}
          data-testid="node-header-description-input"
          value={draft}
          rows={2}
          maxLength={500}
          placeholder={descriptionPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDescription}
          onKeyDown={onDescriptionKeyDown}
          className={cn(inputClass, 'mt-1 resize-none text-xs leading-snug text-text-secondary')}
        />
      ) : (
        <button
          type="button"
          data-testid="node-header-description"
          onClick={() => beginEdit('description')}
          title="Click to edit description"
          className="group mt-0.5 flex w-full items-start gap-1 rounded text-left hover:bg-elevated/60"
        >
          {description ? (
            <p className="text-xs leading-snug text-text-secondary">{description}</p>
          ) : (
            <p className="text-xs italic leading-snug text-text-muted">Add a description…</p>
          )}
          <Pencil
            size={11}
            className="mt-0.5 shrink-0 text-text-muted opacity-0 transition group-hover:opacity-100"
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}
