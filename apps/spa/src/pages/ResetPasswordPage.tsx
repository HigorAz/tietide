import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordFormSchema, type ResetPasswordFormValues } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Spinner } from '@/components/ui/Spinner';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { AuthTextField } from '@/components/auth/AuthTextField';
import { cn } from '@/utils/cn';
import { resolveAuthErrorMessage } from '@/utils/authError';

const submitClasses = cn(
  'mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-teal px-4 py-3 text-[15px] font-bold text-deep-blue',
  'transition-colors hover:bg-accent-teal-hover',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

interface MaybeAxiosError {
  response?: { status?: number };
}

const getStatus = (err: unknown): number | undefined =>
  (err as MaybeAxiosError | null | undefined)?.response?.status;

export function ResetPasswordPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const toast = useToastStore((s) => s.show);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '' },
  });

  // A link with no token can never succeed — send the user to request a fresh one
  // instead of letting them fill in a form that will always 400.
  if (!token) {
    return (
      <AuthLayout>
        <h1 className="mb-2 text-3xl font-bold text-text-primary">Reset link invalid</h1>
        <p className="mb-6 text-[15px] leading-relaxed text-text-secondary">
          This password reset link is missing or malformed. Request a new one to continue.
        </p>
        <Link
          to="/forgot-password"
          className="font-semibold text-accent-teal hover:text-accent-teal-hover"
        >
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await resetPassword(token, values.password);
      // Reset issues a fresh session (auto-login) — go straight into the app.
      navigate('/', { replace: true });
    } catch (err) {
      const message =
        getStatus(err) === 400
          ? 'This password reset link is invalid or has expired. Request a new one.'
          : resolveAuthErrorMessage(err);
      toast({ tone: 'error', message });
    }
  });

  return (
    <AuthLayout>
      <h1 className="mb-1.5 text-3xl font-bold text-text-primary">Choose a new password</h1>
      <p className="mb-[30px] text-[15px] text-text-secondary">
        Enter a new password for your account.
      </p>

      <form onSubmit={onSubmit} noValidate>
        <AuthTextField
          id="password"
          label="New password"
          isPassword
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <button type="submit" disabled={isSubmitting} className={submitClasses}>
          {isSubmitting && <Spinner size="sm" label="Resetting password" />}
          <span>{isSubmitting ? 'Resetting…' : 'Reset password'}</span>
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        <Link to="/login" className="font-semibold text-accent-teal hover:text-accent-teal-hover">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
