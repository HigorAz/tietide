import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { acceptInvite } from '@/api/organizations';

export function InviteAcceptPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const loadOrganizations = useAuthStore((s) => s.loadOrganizations);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const toast = useToastStore((s) => s.show);

  const [error, setError] = useState<string | null>(null);
  // Guard against React 18 StrictMode double-invoking the effect (and double-
  // consuming the single-use token).
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!token) {
      setError('This invitation link is missing its token.');
      return;
    }

    void (async () => {
      try {
        const summary = await acceptInvite(token);
        await loadOrganizations();
        switchOrganization(summary.id);
        toast({ tone: 'success', message: `You’ve joined ${summary.name}.` });
        navigate('/organizations/members', { replace: true });
      } catch (err) {
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'This invitation is invalid or has expired.',
        );
      }
    })();
  }, [token, navigate, loadOrganizations, switchOrganization, toast]);

  return (
    <div className="p-6">
      {error ? (
        <div className="max-w-md">
          <h1 className="mb-2 text-lg font-semibold text-text-primary">Invitation problem</h1>
          <p className="mb-4 text-sm text-text-secondary">{error}</p>
          <Link
            to="/organizations"
            className="text-sm font-medium text-accent-teal hover:underline"
          >
            Go to your workspaces
          </Link>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">Accepting your invitation…</p>
      )}
    </div>
  );
}
