import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  changePasswordFormSchema,
  type ChangePasswordFormValues,
  type PublicUser,
} from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { SettingsCard } from './SettingsCard';
import { sectionError } from './sectionError';

const fieldLabel = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary';
const inputClass =
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal';
const primaryButton = cn(
  'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-2 text-sm font-semibold text-deep-blue',
  'transition-colors hover:bg-accent-teal-hover disabled:cursor-not-allowed disabled:opacity-60',
);
const ghostButton = cn(
  'inline-flex items-center gap-2 rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm font-semibold text-text-primary',
  'transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60',
);

export function SecuritySection({ user }: { user: PublicUser }): JSX.Element {
  const navigate = useNavigate();
  const changePassword = useAuthStore((s) => s.changePassword);
  const resendVerification = useAuthStore((s) => s.resendVerification);
  const logoutEverywhere = useAuthStore((s) => s.logoutEverywhere);
  const toast = useToastStore((s) => s.show);

  const [resending, setResending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onChangePassword = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await changePassword(currentPassword, newPassword);
      reset({ currentPassword: '', newPassword: '' });
      toast({ tone: 'success', message: 'Password changed. Other sessions were signed out.' });
    } catch (err) {
      toast({ tone: 'error', message: sectionError(err, 'Could not change your password.') });
    }
  });

  const onResend = async (): Promise<void> => {
    setResending(true);
    try {
      const message = await resendVerification(user.email);
      toast({ tone: 'info', message });
    } catch (err) {
      toast({
        tone: 'error',
        message: sectionError(err, 'Could not send the verification email.'),
      });
    } finally {
      setResending(false);
    }
  };

  const onLogoutEverywhere = async (): Promise<void> => {
    setSigningOut(true);
    try {
      await logoutEverywhere();
      toast({ tone: 'success', message: 'Signed out of all sessions.' });
      navigate('/login', { replace: true });
    } catch (err) {
      toast({ tone: 'error', message: sectionError(err, 'Could not sign out everywhere.') });
      setSigningOut(false);
    }
  };

  return (
    <SettingsCard title="Security" description="Manage your password and active sessions.">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className={fieldLabel + ' mb-0'}>Email verification</span>
        {user.emailVerified ? (
          <span className="rounded-full bg-feedback-success/15 px-2.5 py-0.5 text-xs font-semibold text-feedback-success">
            Verified
          </span>
        ) : (
          <>
            <span className="rounded-full bg-feedback-warning/15 px-2.5 py-0.5 text-xs font-semibold text-feedback-warning">
              Not verified
            </span>
            <button type="button" onClick={onResend} disabled={resending} className={ghostButton}>
              {resending && <Spinner size="sm" label="Sending" />}
              <span>{resending ? 'Sending…' : 'Resend verification'}</span>
            </button>
          </>
        )}
      </div>

      <form onSubmit={onChangePassword} noValidate className="max-w-md">
        <div className="mb-3">
          <label htmlFor="current-password" className={fieldLabel}>
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            className={inputClass}
            {...register('currentPassword')}
          />
          {errors.currentPassword?.message && (
            <p role="alert" className="mt-1 text-xs text-feedback-error">
              {errors.currentPassword.message}
            </p>
          )}
        </div>
        <div className="mb-3">
          <label htmlFor="new-password" className={fieldLabel}>
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            {...register('newPassword')}
          />
          {errors.newPassword?.message && (
            <p role="alert" className="mt-1 text-xs text-feedback-error">
              {errors.newPassword.message}
            </p>
          )}
        </div>
        <button type="submit" disabled={isSubmitting} className={primaryButton}>
          {isSubmitting && <Spinner size="sm" label="Saving" />}
          <span>{isSubmitting ? 'Changing…' : 'Change password'}</span>
        </button>
      </form>

      <div className="mt-6 border-t border-white/5 pt-4">
        <p className="mb-2 text-sm text-text-secondary">
          Sign out of every device. You will need to sign in again.
        </p>
        <button
          type="button"
          onClick={onLogoutEverywhere}
          disabled={signingOut}
          className={ghostButton}
        >
          {signingOut && <Spinner size="sm" label="Signing out" />}
          <span>{signingOut ? 'Signing out…' : 'Log out everywhere'}</span>
        </button>
      </div>
    </SettingsCard>
  );
}
