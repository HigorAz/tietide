import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { SettingsCard } from './SettingsCard';
import { sectionError } from './sectionError';

const dangerButton = cn(
  'inline-flex items-center gap-2 rounded-md bg-feedback-error px-3 py-2 text-sm font-semibold text-white',
  'transition-colors hover:bg-feedback-error/90 disabled:cursor-not-allowed disabled:opacity-60',
);

export function DangerZoneSection(): JSX.Element {
  const navigate = useNavigate();
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const toast = useToastStore((s) => s.show);

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    if (submitting) return;
    setOpen(false);
    setPassword('');
    setError(null);
  };

  const confirmDelete = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await deleteAccount(password);
      toast({ tone: 'success', message: 'Your account has been deleted.' });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(sectionError(err, 'Could not delete your account.'));
      setSubmitting(false);
    }
  };

  return (
    <SettingsCard
      title="Danger zone"
      description="Deleting your account is permanent. Workspaces where you are the only member are deleted with all their workflows; shared workspaces keep running without you."
      danger
    >
      <button type="button" onClick={() => setOpen(true)} className={dangerButton}>
        Delete account
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm account deletion"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
        >
          <div className="w-full max-w-md rounded-lg border border-feedback-error/40 bg-surface p-5 shadow-xl">
            <h3 className="text-base font-semibold text-text-primary">Delete your account?</h3>
            <p className="mt-2 text-sm text-text-secondary">
              This cannot be undone. Enter your password to confirm.
            </p>

            <label
              htmlFor="delete-account-password"
              className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-wide text-text-secondary"
            >
              Password
            </label>
            <input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary focus:border-feedback-error focus:outline-none focus:ring-1 focus:ring-feedback-error"
            />

            {error && (
              <p role="alert" className="mt-2 text-sm text-feedback-error">
                {error}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="inline-flex items-center rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-white/5 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={submitting || password.length === 0}
                className={dangerButton}
              >
                {submitting && <Spinner size="sm" label="Deleting" />}
                <span>{submitting ? 'Deleting…' : 'Delete account'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
