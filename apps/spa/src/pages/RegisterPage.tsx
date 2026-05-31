import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerFormSchema, type RegisterFormValues } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { resolveAuthErrorMessage } from '@/utils/authError';

const inputClasses = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

const labelClasses = 'mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary';

export function RegisterPage(): JSX.Element {
  const registerUser = useAuthStore((s) => s.register);
  const toast = useToastStore((s) => s.show);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerUser(values);
      // No auto-login on register anymore: the API emailed a verification link.
      // Show a neutral confirmation (identical regardless of whether the email
      // was new or already taken — no enumeration signal).
      setSubmittedEmail(values.email);
    } catch (err) {
      toast({ tone: 'error', message: resolveAuthErrorMessage(err) });
    }
  });

  if (submittedEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-deep-blue px-4 py-12">
        <div className="w-full max-w-sm rounded-lg bg-surface p-8 text-center shadow-xl">
          <h1 className="mb-2 text-2xl font-semibold text-text-primary">Check your inbox</h1>
          <p className="mb-6 text-sm text-text-secondary">
            If <span className="text-text-primary">{submittedEmail}</span> can be used, we&apos;ve
            sent a verification link. Click it to activate your account and sign in. The link
            expires in 24 hours.
          </p>
          <Link to="/login" className="font-medium text-accent-teal hover:text-accent-teal-hover">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-deep-blue px-4 py-12">
      <div className="w-full max-w-sm rounded-lg bg-surface p-8 shadow-xl">
        <h1 className="mb-1 text-2xl font-semibold text-text-primary">Create your account</h1>
        <p className="mb-6 text-sm text-text-secondary">Start building integrations in minutes.</p>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="name" className={labelClasses}>
              Name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              className={inputClasses}
              aria-invalid={errors.name ? 'true' : 'false'}
              {...register('name')}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-error" role="alert">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email" className={labelClasses}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={inputClasses}
              aria-invalid={errors.email ? 'true' : 'false'}
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-error" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className={labelClasses}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              className={inputClasses}
              aria-invalid={errors.password ? 'true' : 'false'}
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-error" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-teal px-4 py-2 text-sm font-semibold text-deep-blue',
              'transition-colors hover:bg-accent-teal-hover',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {isSubmitting && <Spinner size="sm" label="Creating account" />}
            <span>{isSubmitting ? 'Creating account…' : 'Create account'}</span>
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-teal hover:text-accent-teal-hover">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
