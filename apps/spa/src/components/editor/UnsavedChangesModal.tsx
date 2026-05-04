import { Modal } from '@/components/dashboard/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';

export interface UnsavedChangesModalProps {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
  isSaving: boolean;
  saveError: string | null;
}

const TITLE_ID = 'unsaved-changes-title';

export function UnsavedChangesModal({
  open,
  onSave,
  onDiscard,
  onStay,
  isSaving,
  saveError,
}: UnsavedChangesModalProps): JSX.Element | null {
  if (!open) return null;

  return (
    <Modal titleId={TITLE_ID} ariaLabel="Unsaved changes" onClose={onStay}>
      <h2 id={TITLE_ID} className="mb-1 text-lg font-semibold text-text-primary">
        Unsaved changes
      </h2>
      <p className="mb-5 text-sm text-text-secondary">
        You have unsaved changes. Save, discard, or stay?
      </p>

      {saveError && (
        <p role="alert" className="mb-4 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          {saveError}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onStay}
          disabled={isSaving}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition',
            'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          Stay
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={isSaving}
          className={cn(
            'rounded-md border border-error/40 px-3 py-1.5 text-sm font-medium text-error transition',
            'hover:bg-error/10 focus:outline-none focus:ring-1 focus:ring-error',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className={cn(
            'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
            'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isSaving && <Spinner size="sm" label="Saving" />}
          <span>{isSaving ? 'Saving…' : 'Save'}</span>
        </button>
      </div>
    </Modal>
  );
}
