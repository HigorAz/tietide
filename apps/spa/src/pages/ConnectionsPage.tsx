import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionType } from '@tietide/shared';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useToastStore } from '@/stores/toastStore';
import { useOAuthPopup } from '@/hooks/useOAuthPopup';
import { ProviderPicker } from '@/components/connections/ProviderPicker';
import { ConnectionRow } from '@/components/connections/ConnectionRow';
import { ApiKeyConnectionModal } from '@/components/connections/ApiKeyConnectionModal';
import { OAuthConnectionModal } from '@/components/connections/OAuthConnectionModal';
import { DeleteConnectionDialog } from '@/components/connections/DeleteConnectionDialog';
import { PROVIDER_CATALOG, type ProviderEntry } from '@/components/connections/providerCatalog';
import type { ConnectionView } from '@/api/connections';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { readBridgeFromUrl, readDeepLinkFromUrl } from './connectionsPageUrl';

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

export function ConnectionsPage(): JSX.Element {
  // ----- Bridge: relay the OAuth outcome to any opener/listener. -----
  // Detect "bridge mode" purely from URL params. We used to gate on
  // `window.opener` / `window.name`, but Chrome's default COOP can strip
  // BOTH on the provider redirect chain (e.g. Google → API → SPA), leaving
  // the popup looking like a normal /connections page and the opener
  // hanging until the user closed it manually (which then registered as
  // "cancelled"). URL params survive every navigation.
  //
  // Behavior whenever the URL has ?status=…:
  //   1. postMessage to window.opener (best-effort; may be null).
  //   2. broadcast on BroadcastChannel('tietide-oauth') — same-origin,
  //      survives COOP severance.
  //   3. attempt window.close() — works for script-opened popups, ignored
  //      for normal tabs.
  //   4. if we're still here after the close attempt, strip the query and
  //      render the page as usual so direct-link arrivals aren't stuck on
  //      a "Finalizing…" screen.
  const initialOutcome = useMemo(
    () => (typeof window === 'undefined' ? null : readBridgeFromUrl(window.location.search)),
    [],
  );
  const [closing, setClosing] = useState<boolean>(initialOutcome !== null);

  // ----- Standard page state -----
  const {
    connections,
    status,
    error,
    testingIds,
    deletingIds,
    fetch,
    create,
    remove,
    test,
    update,
  } = useConnectionsStore();
  const toast = useToastStore((s) => s.show);
  const oauth = useOAuthPopup();

  const [apiKeyProvider, setApiKeyProvider] = useState<ProviderEntry | null>(null);
  const [oauthProvider, setOauthProvider] = useState<ProviderEntry | null>(null);
  const [toRevoke, setToRevoke] = useState<ConnectionView | null>(null);
  const deepLinkHandledRef = useRef<boolean>(false);

  useEffect(() => {
    if (!closing || !initialOutcome) return;
    const payload = {
      type: 'tietide:oauth:done',
      status: initialOutcome.status,
      connectionId: initialOutcome.connectionId,
      message: initialOutcome.message,
    };
    try {
      window.opener?.postMessage(payload, window.location.origin);
    } catch {
      // ignore — opener may be null or cross-origin
    }
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('tietide-oauth');
        channel.postMessage(payload);
      }
    } catch {
      // ignore
    }
    const closeTimer = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        // ignore
      }
    }, 80);
    const fallbackTimer = window.setTimeout(() => {
      // window.close() was denied (regular tab / browser policy). Surface
      // the outcome inline and drop back to the standard page so the user
      // isn't stuck on the "Finalizing…" screen.
      if (initialOutcome.status === 'success') {
        toast({ tone: 'success', message: 'Connection added' });
      } else {
        toast({ tone: 'error', message: initialOutcome.message ?? 'OAuth failed' });
      }
      window.history.replaceState({}, '', window.location.pathname);
      setClosing(false);
    }, 500);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(fallbackTimer);
      channel?.close();
    };
  }, [closing, initialOutcome, toast]);

  useEffect(() => {
    if (closing) return;
    void fetch();
  }, [fetch, closing]);

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

  const handlePick = (provider: ProviderEntry): void => {
    // API_KEY and CUSTOM both render via the same form-from-schema modal.
    if (provider.type === ConnectionType.API_KEY || provider.type === ConnectionType.CUSTOM) {
      setApiKeyProvider(provider);
      return;
    }
    // OAuth providers open a naming + scope modal first; the popup is launched
    // synchronously from the modal's Connect button to stay within the user
    // gesture (popup-blockers reject window.open after an await).
    setOauthProvider(provider);
  };

  const handleOAuthConnect: React.ComponentProps<typeof OAuthConnectionModal>['onConnect'] = (
    params,
  ) =>
    oauth.start(params).then(async (outcome) => {
      if (outcome.status === 'success') {
        toast({ tone: 'success', message: 'Connection added' });
        await fetch();
      } else if (outcome.status === 'cancelled') {
        toast({ tone: 'info', message: 'OAuth cancelled' });
      } else if (outcome.status === 'error') {
        toast({ tone: 'error', message: outcome.message ?? 'OAuth failed' });
      } else {
        toast({ tone: 'error', message: 'OAuth timed out' });
      }
      return outcome;
    });

  const handleRename = async (id: string, name: string): Promise<void> => {
    try {
      await update(id, { name });
      toast({ tone: 'success', message: 'Connection renamed' });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not rename connection') });
      throw err;
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
              No connections yet. Pick a provider below to add your first one.
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
                onRename={handleRename}
              />
            ))}
          </ul>
        )}
      </section>

      <ProviderPicker onPick={handlePick} />

      {apiKeyProvider && (
        <ApiKeyConnectionModal
          provider={apiKeyProvider.id}
          type={apiKeyProvider.type}
          onClose={() => setApiKeyProvider(null)}
          onCreate={handleApiKeyCreate}
        />
      )}

      {oauthProvider && (
        <OAuthConnectionModal
          provider={oauthProvider.id}
          onClose={() => setOauthProvider(null)}
          onConnect={handleOAuthConnect}
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
