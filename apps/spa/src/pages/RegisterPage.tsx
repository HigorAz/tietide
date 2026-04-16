import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerFormSchema, type RegisterFormValues } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';

const inputClasses = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

const labelClasses = 'mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary';

interface MaybeAxiosError {
  response?: { status?: number };
}

const getStatus = (err: unknown): number | undefined =>
  (err as MaybeAxiosError | null | undefined)?.response?.status;

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const registerUser = useAuthStore((s) => s.register);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await registerUser(values);
      navigate('/login', { replace: true, state: { justRegistered: true } });
    } catch (err) {
      const status = getStatus(err);
      if (status === 409) {
        setSubmitError('Email already registered');
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    }
  });

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

          {submitError && (
            <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error" role="alert">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'w-full rounded-md bg-accent-teal px-4 py-2 text-sm font-semibold text-deep-blue',
              'transition-colors hover:bg-accent-teal-hover',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
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
