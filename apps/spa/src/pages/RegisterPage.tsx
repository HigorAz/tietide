import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerFormSchema, type RegisterFormValues } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Spinner } from '@/components/ui/Spinner';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { AuthTextField } from '@/components/auth/AuthTextField';
import { cn } from '@/utils/cn';
import { resolveAuthErrorMessage } from '@/utils/authError';

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
      <AuthLayout>
        <h1 className="mb-2 text-3xl font-bold text-text-primary">Check your inbox</h1>
        <p className="mb-6 text-[15px] leading-relaxed text-text-secondary">
          If <span className="text-text-primary">{submittedEmail}</span> can be used, we&apos;ve
          sent a verification link. Click it to activate your account and sign in. The link expires
          in 24 hours.
        </p>
        <Link to="/login" className="font-semibold text-accent-teal hover:text-accent-teal-hover">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="mb-1.5 text-3xl font-bold text-text-primary">Create your account</h1>
      <p className="mb-[30px] text-[15px] text-text-secondary">
        Start building integrations in minutes.
      </p>

      <form onSubmit={onSubmit} noValidate>
        <AuthTextField
          id="name"
          label="Name"
          type="text"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <AuthTextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <AuthTextField
          id="password"
          label="Password"
          isPassword
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            'mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-teal px-4 py-3 text-[15px] font-bold text-deep-blue',
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
        <Link to="/login" className="font-semibold text-accent-teal hover:text-accent-teal-hover">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
