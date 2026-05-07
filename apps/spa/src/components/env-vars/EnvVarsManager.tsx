import { useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CreateEnvVarBody, EnvVarView, UpdateEnvVarBody } from '@/api/envVars';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';

const KEY_REGEX = /^[A-Z][A-Z0-9_]*$/;

const errorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { data?: { message?: unknown } } }).response;
    const msg = r?.data?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg) && typeof msg[0] === 'string') return msg[0];
  }
  return fallback;
};

export interface EnvVarsManagerProps {
  /** Page heading. */
  title: string;
  /** Page subtitle. */
  description: string;
  /** API binding — supplied by the page wrapper. */
  api: {
    list: () => Promise<EnvVarView[]>;
    create: (body: CreateEnvVarBody) => Promise<EnvVarView>;
    update: (id: string, body: UpdateEnvVarBody) => Promise<EnvVarView>;
    remove: (id: string) => Promise<void>;
  };
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface FormState {
  mode: 'create' | 'edit';
  id?: string;
  key: string;
  /** Captured at the time the form opens; used to detect whether the user renamed. */
  originalKey: string;
  value: string;
  /** When editing, the user may submit empty value to mean "keep existing." */
  showValueField: boolean;
}

const emptyForm = (): FormState => ({
  mode: 'create',
  key: '',
  originalKey: '',
  value: '',
  showValueField: true,
});

export function EnvVarsManager({ title, description, api }: EnvVarsManagerProps): JSX.Element {
  const [rows, setRows] = useState<EnvVarView[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EnvVarView | null>(null);

  useEffect(() => {
    void refresh();
  }, [api]);

  async function refresh(): Promise<void> {
    setStatus('loading');
    setLoadError(null);
    try {
      const data = await api.list();
      setRows(data);
      setStatus('ready');
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load env vars'));
      setStatus('error');
    }
  }

  function openCreate(): void {
    setForm(emptyForm());
    setFormError(null);
  }

  function openEdit(row: EnvVarView): void {
    setForm({
      mode: 'edit',
      id: row.id,
      key: row.key,
      originalKey: row.key,
      value: '',
      showValueField: false,
    });
    setFormError(null);
  }

  function closeForm(): void {
    setForm(null);
    setFormError(null);
  }

  async function submit(): Promise<void> {
    if (!form) return;
    if (!KEY_REGEX.test(form.key)) {
      setFormError(
        'Key must start with an uppercase letter and contain only A–Z, 0–9, and underscores.',
      );
      return;
    }
    if (form.mode === 'create' && form.value.length === 0) {
      setFormError('Value is required.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (form.mode === 'create') {
        const created = await api.create({ key: form.key, value: form.value });
        setRows((cur) => [...cur, created].sort((a, b) => a.key.localeCompare(b.key)));
      } else {
        const id = form.id;
        if (id === undefined) throw new Error('missing id');
        const body: UpdateEnvVarBody = {};
        if (form.key !== form.originalKey && form.key.length > 0) {
          body.key = form.key;
        }
        if (form.showValueField && form.value.length > 0) body.value = form.value;
        if (Object.keys(body).length === 0) {
          setFormError('Provide a new key or a new value.');
          setSubmitting(false);
          return;
        }
        const updated = await api.update(id, body);
        setRows((cur) =>
          cur.map((r) => (r.id === id ? updated : r)).sort((a, b) => a.key.localeCompare(b.key)),
        );
      }
      setForm(null);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save env var'));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    try {
      await api.remove(pendingDelete.id);
      setRows((cur) => cur.filter((r) => r.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not delete env var'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col">
      <header className="border-b border-white/5 bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-xs text-text-secondary">{description}</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className={cn(
              'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-2 text-sm font-semibold text-deep-blue transition',
              'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
            )}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            New env var
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        {status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Spinner /> Loading env vars…
          </div>
        )}

        {status === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error"
          >
            <p>{loadError ?? 'Something went wrong'}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-md bg-error/20 px-3 py-1 text-xs font-semibold text-error transition hover:bg-error/30"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && rows.length === 0 && (
          <p className="text-sm text-text-secondary">
            No env vars yet. Click <span className="font-semibold">New env var</span> to add one.
          </p>
        )}

        {status === 'ready' && rows.length > 0 && (
          <ul
            aria-label="Env vars"
            className="flex flex-col divide-y divide-white/5 rounded-md border border-white/5 bg-surface"
          >
            {rows.map((row) => (
              <li
                key={row.id}
                data-testid="env-var-row"
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-text-primary">{row.key}</p>
                    <p className="text-[11px] text-text-secondary">
                      Updated {new Date(row.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    aria-label={`Edit ${row.key}`}
                    className="rounded-md border border-white/10 bg-elevated p-1.5 text-text-secondary transition hover:border-white/20 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
                  >
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(row)}
                    disabled={deletingId === row.id}
                    aria-label={`Delete ${row.key}`}
                    className="rounded-md border border-white/10 bg-elevated p-1.5 text-text-secondary transition hover:border-error/40 hover:text-error focus:outline-none focus:ring-1 focus:ring-error disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {form !== null && (
        <FormDialog
          form={form}
          submitting={submitting}
          error={formError}
          onChange={setForm}
          onCancel={closeForm}
          onSubmit={() => void submit()}
        />
      )}

      {pendingDelete !== null && (
        <ConfirmDeleteDialog
          envVarKey={pendingDelete.key}
          busy={deletingId === pendingDelete.id}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}

interface FormDialogProps {
  form: FormState;
  submitting: boolean;
  error: string | null;
  onChange: (next: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

function FormDialog({
  form,
  submitting,
  error,
  onChange,
  onCancel,
  onSubmit,
}: FormDialogProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="env-var-form-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
    >
      <div className="w-full max-w-md rounded-lg border border-white/5 bg-surface p-5 shadow-xl">
        <h2 id="env-var-form-title" className="mb-1 text-base font-semibold">
          {form.mode === 'create' ? 'Create env var' : 'Edit env var'}
        </h2>
        <p className="mb-4 text-xs text-text-secondary">
          Keys must match <span className="font-mono">[A-Z][A-Z0-9_]*</span>. Values are encrypted
          at rest.
        </p>

        <label className="mb-3 flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-text-secondary">Key</span>
          <input
            type="text"
            value={form.key}
            onChange={(e) => onChange({ ...form, key: e.target.value.toUpperCase() })}
            placeholder="API_BASE_URL"
            aria-label="Key"
            className="rounded-md border border-white/10 bg-elevated px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal"
          />
        </label>

        {form.mode === 'edit' && !form.showValueField && (
          <button
            type="button"
            onClick={() => onChange({ ...form, showValueField: true })}
            className="mb-3 rounded-md border border-white/10 bg-elevated px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:text-text-primary"
          >
            Rotate value…
          </button>
        )}

        {(form.mode === 'create' || form.showValueField) && (
          <label className="mb-3 flex flex-col gap-1 text-xs">
            <span className="font-semibold uppercase tracking-wide text-text-secondary">Value</span>
            <input
              type="password"
              value={form.value}
              onChange={(e) => onChange({ ...form, value: e.target.value })}
              placeholder="(write-only)"
              aria-label="Value"
              autoComplete="off"
              className="rounded-md border border-white/10 bg-elevated px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal"
            />
            <span className="text-[11px] text-text-secondary">
              Existing values are never displayed back. Type a new value to rotate.
            </span>
          </label>
        )}

        {error !== null && (
          <p role="alert" className="mb-3 text-xs text-error">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="rounded-md bg-accent-teal px-3 py-2 text-sm font-semibold text-deep-blue transition hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving…' : form.mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDeleteDialogProps {
  envVarKey: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDeleteDialog({
  envVarKey,
  busy,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps): JSX.Element {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="env-var-delete-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
    >
      <div className="w-full max-w-md rounded-lg border border-white/5 bg-surface p-5 shadow-xl">
        <h2 id="env-var-delete-title" className="mb-1 text-base font-semibold">
          Delete {envVarKey}?
        </h2>
        <p className="mb-4 text-xs text-text-secondary">
          Workflows that reference <span className="font-mono">{`{{${envVarKey}}}`}</span> will fail
          until you re-create it.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-error px-3 py-2 text-sm font-semibold text-white transition hover:bg-error/90 focus:outline-none focus:ring-1 focus:ring-error disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EnvVarsManager;
