import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { ConnectionProvider, ConnectionType } from '@tietide/shared';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useToastStore } from '@/stores/toastStore';
import { useOAuthPopup } from '@/hooks/useOAuthPopup';
import { ProviderPicker } from '@/components/connections/ProviderPicker';
import { ConnectionRow } from '@/components/connections/ConnectionRow';
import { ApiKeyConnectionModal } from '@/components/connections/ApiKeyConnectionModal';
import { HttpConnectionModal } from '@/components/connections/HttpConnectionModal';
import { OllamaConnectionModal } from '@/components/connections/OllamaConnectionModal';
import { OAuthConnectionModal } from '@/components/connections/OAuthConnectionModal';
import { DeleteConnectionDialog } from '@/components/connections/DeleteConnectionDialog';
import { EditConnectionModal } from '@/components/connections/EditConnectionModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import {
  PROVIDER_CATALOG,
  getProviderLabel,
  type ProviderEntry,
} from '@/components/connections/providerCatalog';
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
  const [editing, setEditing] = useState<ConnectionView | null>(null);
  const [httpModalOpen, setHttpModalOpen] = useState<boolean>(false);
  const [ollamaModalOpen, setOllamaModalOpen] = useState<boolean>(false);
  const [toRevoke, setToRevoke] = useState<ConnectionView | null>(null);
  const [mineQuery, setMineQuery] = useState<string>('');
  const [availableQuery, setAvailableQuery] = useState<string>('');
  const deepLinkHandledRef = useRef<boolean>(false);

  // My Connections search matches the connection name OR its application
  // (provider label / raw provider id).
  const filteredConnections = useMemo(() => {
    const q = mineQuery.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter((c) => {
      const haystack = `${c.name} ${getProviderLabel(c.provider)} ${c.provider}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [connections, mineQuery]);

  useEffect(() => {
    if (!closing || !initialOutcome) return;
    // No `message` is forwarded: the OAuth bridge URL is attacker-controllable,
    // so we never echo a raw param. The opener derives its own fixed copy from
    // `status` (W5.44).
    const payload = {
      type: 'tietide:oauth:done',
      status: initialOutcome.status,
      connectionId: initialOutcome.connectionId,
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
        // Fixed, status-keyed copy — never the raw `message` URL param (W5.44).
        toast({ tone: 'error', message: 'OAuth failed' });
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
    // HTTP has multiple auth shapes (bearer / api-key / basic) that don't fit
    // the flat schema-driven modal — it gets its own auth-type-aware modal.
    if (provider.id === ConnectionProvider.HTTP) {
      setHttpModalOpen(true);
      return;
    }
    // Ollama is CUSTOM-typed but needs the model-aware modal (server probe +
    // pull) rather than the flat schema-driven form — give it its own branch.
    if (provider.id === ConnectionProvider.OLLAMA) {
      setOllamaModalOpen(true);
      return;
    }
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

  const handleEdit = (connection: ConnectionView): void => {
    // OAuth credentials can't be hand-edited — re-run the OAuth flow to refresh
    // them ("Reconnect"). Everything else opens the schema-driven edit modal.
    if (connection.type === ConnectionType.OAUTH2) {
      const provider = PROVIDER_CATALOG.find((p) => p.id === connection.provider);
      if (provider) {
        setOauthProvider(provider);
        return;
      }
    }
    setEditing(connection);
  };

  const handleEditSave = async (config: Record<string, unknown>): Promise<void> => {
    if (!editing) return;
    try {
      await update(editing.id, { config });
      toast({ tone: 'success', message: 'Connection updated' });
      setEditing(null);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not update connection') });
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

  const handleHttpCreate = async (body: Parameters<typeof create>[0]): Promise<void> => {
    try {
      await create(body);
      toast({ tone: 'success', message: 'Connection added' });
      setHttpModalOpen(false);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not create connection') });
      throw err;
    }
  };

  const handleOllamaCreate = async (body: Parameters<typeof create>[0]): Promise<void> => {
    try {
      await create(body);
      toast({ tone: 'success', message: 'Connection added' });
      setOllamaModalOpen(false);
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

      <Tabs defaultValue="mine">
        <TabsList data-tour="connections-tabs">
          <TabsTrigger value="mine">My Connections</TabsTrigger>
          <TabsTrigger value="available">Available Connections</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-5">
          <label className="relative mb-4 flex items-center">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
            />
            <input
              type="search"
              value={mineQuery}
              onChange={(e) => setMineQuery(e.target.value)}
              placeholder="Search by name or application…"
              aria-label="Search your connections"
              className={cn(
                'w-full rounded-md border border-white/5 bg-elevated py-2 pl-9 pr-3 text-sm text-text-primary',
                'placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
              )}
            />
          </label>

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
                No connections yet. Open the Available Connections tab to add your first one.
              </p>
            </div>
          )}

          {connections.length > 0 && filteredConnections.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 bg-surface p-8 text-center">
              <p className="text-sm text-text-secondary">No connections match “{mineQuery}”.</p>
            </div>
          )}

          {filteredConnections.length > 0 && (
            <ul className="flex flex-col gap-2">
              {filteredConnections.map((c) => (
                <ConnectionRow
                  key={c.id}
                  connection={c}
                  isTesting={Boolean(testingIds[c.id])}
                  isDeleting={Boolean(deletingIds[c.id])}
                  onTest={(id) => void handleTest(id)}
                  onRevoke={(conn) => setToRevoke(conn)}
                  onRename={handleRename}
                  onEdit={handleEdit}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="available" className="mt-5">
          <label className="relative mb-4 flex items-center">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
            />
            <input
              type="search"
              value={availableQuery}
              onChange={(e) => setAvailableQuery(e.target.value)}
              placeholder="Search applications…"
              aria-label="Search available connections"
              className={cn(
                'w-full rounded-md border border-white/5 bg-elevated py-2 pl-9 pr-3 text-sm text-text-primary',
                'placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
              )}
            />
          </label>

          <ProviderPicker onPick={handlePick} query={availableQuery} />
        </TabsContent>
      </Tabs>

      {apiKeyProvider && (
        <ApiKeyConnectionModal
          provider={apiKeyProvider.id}
          type={apiKeyProvider.type}
          onClose={() => setApiKeyProvider(null)}
          onCreate={handleApiKeyCreate}
        />
      )}

      {editing && (
        <EditConnectionModal
          connection={editing}
          onClose={() => setEditing(null)}
          onSave={handleEditSave}
        />
      )}

      {httpModalOpen && (
        <HttpConnectionModal onClose={() => setHttpModalOpen(false)} onCreate={handleHttpCreate} />
      )}

      {ollamaModalOpen && (
        <OllamaConnectionModal
          onClose={() => setOllamaModalOpen(false)}
          onCreate={handleOllamaCreate}
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
