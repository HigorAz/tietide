import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginFormSchema, type LoginFormValues } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Spinner } from '@/components/ui/Spinner';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { AuthTextField } from '@/components/auth/AuthTextField';
import { cn } from '@/utils/cn';
import { resolveAuthErrorMessage } from '@/utils/authError';

interface MaybeAxiosError {
  response?: { status?: number };
}

const getStatus = (err: unknown): number | undefined =>
  (err as MaybeAxiosError | null | undefined)?.response?.status;

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const toast = useToastStore((s) => s.show);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
      navigate('/', { replace: true });
    } catch (err) {
      const status = getStatus(err);
      let message: string;
      if (status === 401) {
        message = 'Invalid credentials';
      } else if (status === 403) {
        // The account exists but the email isn't verified yet.
        message = 'Please verify your email before signing in. Check your inbox for the link.';
      } else {
        message = resolveAuthErrorMessage(err);
      }
      toast({ tone: 'error', message });
    }
  });

  return (
    <AuthLayout>
      <h1 className="mb-1.5 text-3xl font-bold text-text-primary">Welcome back</h1>
      <p className="mb-[30px] text-[15px] text-text-secondary">Sign in to continue to TieTide.</p>

      <form onSubmit={onSubmit} noValidate>
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="mb-6 flex justify-end">
          <Link
            to="/forgot-password"
            className="text-[13px] font-semibold text-accent-teal hover:text-accent-teal-hover"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            'mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-teal px-4 py-3 text-[15px] font-bold text-deep-blue',
            'transition-colors hover:bg-accent-teal-hover',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isSubmitting && <Spinner size="sm" label="Signing in" />}
          <span>{isSubmitting ? 'Signing in…' : 'Sign in'}</span>
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Don&apos;t have an account?{' '}
        <Link
          to="/register"
          className="font-semibold text-accent-teal hover:text-accent-teal-hover"
        >
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}
