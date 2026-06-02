import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/ui/Spinner';

type Status = 'verifying' | 'success' | 'error';

// Landing page for the emailed verification link (/verify-email?token=...). It
// consumes the token, which activates the account and logs the user in, then
// sends them into the app. This is where auto-login now happens (W2.1).
export function VerifyEmailPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');
  // Guard against React 18 StrictMode double-invocation consuming the single-use
  // token twice (the second call would 400 on an already-consumed token).
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    let active = true;
    void (async () => {
      try {
        await verifyEmail(token);
        if (!active) return;
        setStatus('success');
        navigate('/', { replace: true });
      } catch {
        if (active) setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [token, verifyEmail, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-deep-blue px-4 py-12">
      <div className="w-full max-w-sm rounded-lg bg-surface p-8 text-center shadow-xl">
        {status === 'verifying' && (
          <div role="status" className="flex flex-col items-center gap-3">
            <Spinner size="md" label="Verifying your email" />
            <p className="text-sm text-text-secondary">Verifying your email…</p>
          </div>
        )}

        {status === 'success' && (
          <p className="text-sm text-text-secondary">Email verified — taking you to TieTide…</p>
        )}

        {status === 'error' && (
          <>
            <h1 className="mb-2 text-2xl font-semibold text-text-primary">
              Verification link invalid
            </h1>
            <p className="mb-6 text-sm text-text-secondary">
              This verification link is invalid or has expired. Register again to receive a fresh
              link, or sign in if your account is already verified.
            </p>
            <div className="flex justify-center gap-4 text-sm font-medium">
              <Link to="/register" className="text-accent-teal hover:text-accent-teal-hover">
                Register again
              </Link>
              <Link to="/login" className="text-accent-teal hover:text-accent-teal-hover">
                Sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
