import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordFormSchema, type ForgotPasswordFormValues } from '@tietide/shared';
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

export function ForgotPasswordPage(): JSX.Element {
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const toast = useToastStore((s) => s.show);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await forgotPassword(values.email);
      // Neutral confirmation regardless of whether the email is registered.
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
          If <span className="text-text-primary">{submittedEmail}</span> is registered, we&apos;ve
          sent a link to reset your password. The link expires in 1 hour.
        </p>
        <Link to="/login" className="font-semibold text-accent-teal hover:text-accent-teal-hover">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="mb-1.5 text-3xl font-bold text-text-primary">Forgot your password?</h1>
      <p className="mb-[30px] text-[15px] text-text-secondary">
        Enter your email and we&apos;ll send you a link to reset it.
      </p>

      <form onSubmit={onSubmit} noValidate>
        <AuthTextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <button type="submit" disabled={isSubmitting} className={submitClasses}>
          {isSubmitting && <Spinner size="sm" label="Sending reset link" />}
          <span>{isSubmitting ? 'Sending…' : 'Send reset link'}</span>
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Remembered it?{' '}
        <Link to="/login" className="font-semibold text-accent-teal hover:text-accent-teal-hover">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
