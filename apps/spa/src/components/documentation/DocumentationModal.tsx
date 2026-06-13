import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardCheck,
  ClipboardCopy,
  Download,
  FileDown,
  FileText,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import type { WorkflowDocumentationResponse } from '@/api/ai';
import { Modal } from '@/components/dashboard/Modal';
import { MarkdownContent } from '@/components/dashboard/MarkdownContent';
import { Spinner } from '@/components/ui/Spinner';
import { useToastStore } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { downloadDocAsPdf, downloadDocAsWord, slugifyDocFilename } from '@/lib/exportDocument';

export type DocumentationModalStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DocumentationModalProps {
  workflowName: string;
  status: DocumentationModalStatus;
  docs: WorkflowDocumentationResponse | null;
  error: string | null;
  /** Kick off (re)generation. */
  onRegenerate: () => void;
  /** Persist an edited body; rejects on failure. */
  onSave: (documentation: string) => Promise<void>;
  onClose: () => void;
}

const COPY_FEEDBACK_MS = 2000;

const SECTION_LABELS: ReadonlyArray<
  readonly [string, keyof WorkflowDocumentationResponse['sections']]
> = [
  ['Overview', 'overview'],
  ['Prerequisites', 'prerequisites'],
  ['Trigger', 'trigger'],
  ['Walkthrough', 'walkthrough'],
  ['Data flow', 'dataFlow'],
  ['Decisions', 'decisions'],
  ['Error handling', 'errorHandling'],
];

/**
 * Shared documentation pop-up used by the editor toolbar, the inspector dock,
 * and the dashboard list. Renders the markdown, supports in-place editing with
 * an unsaved-changes guard on close, and exports to Word / PDF.
 */
export function DocumentationModal({
  workflowName,
  status,
  docs,
  error,
  onRegenerate,
  onSave,
  onClose,
}: DocumentationModalProps): JSX.Element {
  const toast = useToastStore((s) => s.show);

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const body = docs?.documentation ?? '';
  const dirty = mode === 'edit' && draft !== body;

  // Leaving edit mode whenever the underlying doc changes (regenerate/save).
  useEffect(() => {
    if (mode === 'edit') return;
    setDraft(body);
  }, [body, mode]);

  const startEdit = useCallback(() => {
    setDraft(body);
    setMode('edit');
    setDownloadOpen(false);
  }, [body]);

  const discardEdit = useCallback(() => {
    setMode('view');
    setDraft(body);
  }, [body]);

  const doSave = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      await onSave(draft);
      setMode('view');
      toast({ tone: 'success', message: 'Documentation saved' });
      return true;
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to save' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, onSave, toast]);

  // X / Escape / backdrop all route here so we can guard unsaved edits.
  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mode === 'edit' ? draft : body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  }, [body, draft, mode]);

  const exportContent = mode === 'edit' ? draft : body;
  const handleDownload = useCallback(
    async (format: 'word' | 'pdf') => {
      setDownloadOpen(false);
      const base = slugifyDocFilename(workflowName);
      try {
        if (format === 'word') {
          await downloadDocAsWord(base, workflowName, exportContent);
        } else {
          await downloadDocAsPdf(base, workflowName, exportContent);
        }
      } catch {
        toast({ tone: 'error', message: 'Could not generate the download' });
      }
    },
    [exportContent, workflowName, toast],
  );

  return (
    <Modal
      onClose={requestClose}
      ariaLabel={`Documentation for ${workflowName}`}
      className="relative flex max-h-[85vh] w-full max-w-3xl flex-col p-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-text-primary">Documentation</h2>
          <p className="truncate text-xs text-text-secondary">{workflowName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status === 'ready' && docs && mode === 'view' && (
            <>
              <HeaderButton
                onClick={startEdit}
                icon={<Pencil size={14} aria-hidden />}
                label="Edit"
              />
              <HeaderButton
                onClick={onRegenerate}
                icon={<RefreshCw size={14} aria-hidden />}
                label="Regenerate"
              />
              <div className="relative">
                <HeaderButton
                  onClick={() => setDownloadOpen((v) => !v)}
                  icon={<Download size={14} aria-hidden />}
                  label="Download"
                  ariaHasPopup
                  ariaExpanded={downloadOpen}
                />
                {downloadOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-md border border-white/10 bg-elevated shadow-xl"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleDownload('word')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary hover:bg-white/5"
                    >
                      <FileText size={14} aria-hidden /> Word (.doc)
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleDownload('pdf')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary hover:bg-white/5"
                    >
                      <FileDown size={14} aria-hidden /> PDF
                    </button>
                  </div>
                )}
              </div>
              <HeaderButton
                onClick={() => void handleCopy()}
                icon={
                  copied ? (
                    <ClipboardCheck size={14} aria-hidden />
                  ) : (
                    <ClipboardCopy size={14} aria-hidden />
                  )
                }
                label={copied ? 'Copied' : 'Copy'}
              />
            </>
          )}
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close documentation"
            className="rounded p-1.5 text-text-secondary hover:bg-elevated hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Spinner size="sm" />
            <span>Generating documentation… this can take a minute or two.</span>
          </div>
        )}

        {status === 'error' && (
          <div
            role="alert"
            className="rounded border border-error/30 bg-error/10 p-3 text-sm text-error"
          >
            <p className="font-medium">Failed to load documentation</p>
            {error && <p className="mt-1 text-text-secondary">{error}</p>}
            <button
              type="button"
              onClick={onRegenerate}
              className="mt-2 rounded bg-accent-teal px-2 py-1 text-xs font-medium text-deep-blue hover:bg-accent-teal-hover"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'idle' && !docs && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-text-secondary">
            <FileText size={28} className="text-text-muted" aria-hidden />
            <p>No documentation yet.</p>
            <button
              type="button"
              onClick={onRegenerate}
              className="mt-1 inline-flex items-center gap-1.5 rounded bg-accent-teal px-2.5 py-1 text-xs font-medium text-deep-blue hover:bg-accent-teal-hover"
            >
              <FileText size={14} aria-hidden /> Generate documentation
            </button>
          </div>
        )}

        {status === 'ready' && docs && mode === 'view' && (
          <div className="space-y-4">
            <MarkdownContent source={body} />
            <dl className="space-y-2 border-t border-white/10 pt-3 text-sm">
              {SECTION_LABELS.map(([label, key]) => {
                const value = docs.sections[key];
                if (!value) return null;
                return (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-text-primary">{value}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        )}

        {status === 'ready' && docs && mode === 'edit' && (
          <textarea
            aria-label="Edit documentation"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-[55vh] w-full resize-none rounded-md border border-white/10 bg-deep-blue p-3 font-mono text-xs leading-relaxed text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
          />
        )}
      </div>

      {/* Edit footer */}
      {mode === 'edit' && (
        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={discardEdit}
            disabled={saving}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-elevated disabled:opacity-50"
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-teal px-3.5 py-1.5 text-xs font-semibold text-deep-blue hover:bg-accent-teal-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Spinner size="sm" label="Saving" />}
            Save changes
          </button>
        </div>
      )}

      {/* Unsaved-changes confirm overlay */}
      {confirmOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-deep-blue/80 p-4">
          <div
            role="alertdialog"
            aria-label="Discard unsaved changes?"
            className="w-full max-w-sm rounded-lg border border-white/10 bg-surface p-5 shadow-xl"
          >
            <h3 className="text-sm font-semibold text-text-primary">Unsaved changes</h3>
            <p className="mt-1 text-xs text-text-secondary">
              You have unsaved edits. Save them, discard them, or keep editing.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-elevated"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  onClose();
                }}
                className="rounded-md border border-error/40 px-3 py-1.5 text-xs font-medium text-error hover:bg-error/10"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  const ok = await doSave();
                  setConfirmOpen(false);
                  if (ok) onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent-teal px-3.5 py-1.5 text-xs font-semibold text-deep-blue hover:bg-accent-teal-hover disabled:opacity-50"
              >
                {saving && <Spinner size="sm" label="Saving" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface HeaderButtonProps {
  onClick: () => void;
  icon: JSX.Element;
  label: string;
  ariaHasPopup?: boolean;
  ariaExpanded?: boolean;
}

function HeaderButton({
  onClick,
  icon,
  label,
  ariaHasPopup,
  ariaExpanded,
}: HeaderButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs text-text-secondary',
        'hover:bg-elevated hover:text-text-primary',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
