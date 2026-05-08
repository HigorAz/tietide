import { useEffect, useRef, useState } from 'react';
import { ConnectionType } from '@tietide/shared';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useToastStore } from '@/stores/toastStore';
import { useOAuthPopup } from '@/hooks/useOAuthPopup';
import { ProviderPicker } from '@/components/connections/ProviderPicker';
import { ConnectionRow } from '@/components/connections/ConnectionRow';
import { ApiKeyConnectionModal } from '@/components/connections/ApiKeyConnectionModal';
import { DeleteConnectionDialog } from '@/components/connections/DeleteConnectionDialog';
import { PROVIDER_CATALOG, type ProviderEntry } from '@/components/connections/providerCatalog';
import type { ConnectionView } from '@/api/connections';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { readBridgeFromUrl, readDeepLinkFromUrl } from './connectionsPageUrl';

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

export function ConnectionsPage(): JSX.Element {
  // ----- Bridge: if we're inside an OAuth popup, postMessage and close. -----
  const [closing, setClosing] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (!window.opener || window.opener.closed) return false;
    return readBridgeFromUrl(window.location.search) !== null;
  });

  useEffect(() => {
    if (!closing) return;
    const outcome = readBridgeFromUrl(window.location.search);
    if (!outcome) {
      setClosing(false);
      return;
    }
    try {
      window.opener?.postMessage(
        {
          type: 'tietide:oauth:done',
          status: outcome.status,
          connectionId: outcome.connectionId,
          message: outcome.message,
        },
        window.location.origin,
      );
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        window.close();
      } catch {
        // ignore
      }
    }, 50);
  }, [closing]);

  // ----- Standard page state -----
  const { connections, status, error, testingIds, deletingIds, fetch, create, remove, test } =
    useConnectionsStore();
  const toast = useToastStore((s) => s.show);
  const oauth = useOAuthPopup();

  const [apiKeyProvider, setApiKeyProvider] = useState<ProviderEntry | null>(null);
  const [toRevoke, setToRevoke] = useState<ConnectionView | null>(null);
  const [oauthInflight, setOauthInflight] = useState<string | null>(null);
  const deepLinkHandledRef = useRef<boolean>(false);

  useEffect(() => {
    if (closing) return;
    void fetch();
  }, [fetch, closing]);

  // ----- Direct-mode bridge fallback: page mounted (not in popup) but with status query. -----
  useEffect(() => {
    if (closing) return;
    if (typeof window === 'undefined') return;
    const outcome = readBridgeFromUrl(window.location.search);
    if (!outcome) return;
    if (outcome.status === 'success') {
      toast({ tone: 'success', message: 'Connection added' });
    } else {
      toast({ tone: 'error', message: outcome.message ?? 'OAuth failed' });
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, [closing, toast]);

  // Deep-link: ConnectionPicker's empty-state CTA opens us at
  // /connections?provider=X&connect=true to auto-fire the connect flow.
  // Guard with a ref so React.StrictMode's double-invoke effect pass
  // doesn't open the popup twice; strip the query so a refresh is idempotent.
  useEffect(() => {
    if (closing) return;
    if (typeof window === 'undefined') return;
    if (deepLinkHandledRef.current) return;
    const request = readDeepLinkFromUrl(window.location.search);
    if (!request) return;
    deepLinkHandledRef.current = true;
    window.history.replaceState({}, '', window.location.pathname);
    void handlePick(request.provider);
  }, [closing]);

  const handlePick = async (provider: ProviderEntry): Promise<void> => {
    // API_KEY and CUSTOM both render via the same form-from-schema modal.
    // The modal sends back the right `type` because we now pass it through.
    if (provider.type === ConnectionType.API_KEY || provider.type === ConnectionType.CUSTOM) {
      setApiKeyProvider(provider);
      return;
    }
    setOauthInflight(provider.id);
    try {
      const outcome = await oauth.start({
        provider: provider.id,
        label: `My ${provider.label}`,
      });
      if (outcome.status === 'success') {
        toast({ tone: 'success', message: `Connected to ${provider.label}` });
        await fetch();
      } else if (outcome.status === 'error') {
        toast({ tone: 'error', message: outcome.message ?? 'OAuth failed' });
      } else if (outcome.status === 'cancelled') {
        toast({ tone: 'info', message: 'OAuth cancelled' });
      } else {
        toast({ tone: 'error', message: 'OAuth timed out' });
      }
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'OAuth failed') });
    } finally {
      setOauthInflight(null);
    }
  };

  const handleApiKeyCreate = async (body: Parameters<typeof create>[0]): Promise<void> => {
    try {
      await create(body);
      toast({ tone: 'success', message: 'Connection added' });
      setApiKeyProvider(null);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not create connection') });
      throw err;
    }
  };

  const handleTest = async (id: string): Promise<void> => {
    try {
      const result = await test(id);
      if (result.ok) {
        toast({
          tone: 'success',
          message: `Test succeeded (${result.latencyMs}ms)`,
        });
      } else {
        toast({ tone: 'error', message: `Test failed: ${result.message ?? 'unknown error'}` });
      }
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not run test') });
    }
  };

  const handleRevokeConfirm = async (id: string): Promise<void> => {
    try {
      await remove(id);
      toast({ tone: 'success', message: 'Connection revoked' });
      setToRevoke(null);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not revoke connection') });
    }
  };

  if (closing) {
    return (
      <div
        className="flex min-h-[300px] items-center justify-center text-sm text-text-secondary"
        data-testid="oauth-bridge-closing"
      >
        Finalizing connection… you can close this window.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">Connections</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Connect your accounts so workflows can call them. Credentials are encrypted at rest and
          never leave the server in plain text.
        </p>
      </header>

      <ProviderPicker onPick={handlePick} />

      <section aria-labelledby="your-connections-heading">
        <h2
          id="your-connections-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
        >
          Your connections
        </h2>

        {status === 'loading' && connections.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-surface p-4 text-sm text-text-secondary">
            <Spinner size="sm" label="Loading connections" />
            <span>Loading…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-error">
            <span>Could not load connections: {error ?? 'unknown error'}</span>
            <button
              type="button"
              onClick={() => void fetch()}
              className={cn(
                'rounded-md border border-error/40 px-2.5 py-1 text-xs font-medium text-error transition',
                'hover:bg-error/10 focus:outline-none focus:ring-1 focus:ring-error',
              )}
            >
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && connections.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/10 bg-surface p-8 text-center">
            <p className="text-sm text-text-secondary">
              No connections yet. Pick a provider above to add your first one.
            </p>
          </div>
        )}

        {connections.length > 0 && (
          <ul className="flex flex-col gap-2">
            {connections.map((c) => (
              <ConnectionRow
                key={c.id}
                connection={c}
                isTesting={Boolean(testingIds[c.id])}
                isDeleting={Boolean(deletingIds[c.id])}
                onTest={(id) => void handleTest(id)}
                onRevoke={(conn) => setToRevoke(conn)}
              />
            ))}
          </ul>
        )}

        {oauthInflight && (
          <p className="mt-3 text-xs text-text-secondary" role="status">
            Waiting for {oauthInflight} authorization…
          </p>
        )}
      </section>

      {apiKeyProvider && (
        <ApiKeyConnectionModal
          provider={apiKeyProvider.id}
          type={apiKeyProvider.type}
          onClose={() => setApiKeyProvider(null)}
          onCreate={handleApiKeyCreate}
        />
      )}

      {toRevoke && (
        <DeleteConnectionDialog
          connection={toRevoke}
          onClose={() => setToRevoke(null)}
          onConfirm={handleRevokeConfirm}
        />
      )}
    </div>
  );
}

// Re-export catalog so tests can import without coupling to deep paths.
export { PROVIDER_CATALOG };
