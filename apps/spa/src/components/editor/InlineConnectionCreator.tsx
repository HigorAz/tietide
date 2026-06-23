import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ConnectionProvider, ConnectionType } from '@tietide/shared';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useToastStore } from '@/stores/toastStore';
import { useOAuthPopup } from '@/hooks/useOAuthPopup';
import { getProviderEntry } from '@/components/connections/providerCatalog';
import { ApiKeyConnectionModal } from '@/components/connections/ApiKeyConnectionModal';
import { HttpConnectionModal } from '@/components/connections/HttpConnectionModal';
import { OllamaConnectionModal } from '@/components/connections/OllamaConnectionModal';
import { OAuthConnectionModal } from '@/components/connections/OAuthConnectionModal';
import { cn } from '@/utils/cn';

type ModalKind = 'oauth' | 'apiKey' | 'http' | 'ollama';

export interface InlineConnectionCreatorProps {
  /** Provider tag of the node's required connection (e.g. 'google'). */
  provider: string;
  /** Human label for the provider (e.g. 'Google'). */
  label: string;
  /** Called with the new connection id once it is created/authorized. */
  onCreated: (connectionId: string) => void;
  /** 'cta' = prominent empty-state button; 'link' = subtle "add another" link. */
  variant?: 'cta' | 'link';
}

/**
 * Creates a connection WITHOUT leaving the editor. The Connections page used to
 * be reachable only via a `target="_blank"` link, which lands on /login because
 * the session token lives in per-tab sessionStorage (a new tab has none). Here
 * we reuse the same modals the Connections page uses (OAuth popup / API-key /
 * HTTP / Ollama) inline, then auto-select the new connection.
 */
export function InlineConnectionCreator({
  provider,
  label,
  onCreated,
  variant = 'cta',
}: InlineConnectionCreatorProps): JSX.Element | null {
  const entry = getProviderEntry(provider);
  const create = useConnectionsStore((s) => s.create);
  const fetch = useConnectionsStore((s) => s.fetch);
  const toast = useToastStore((s) => s.show);
  const oauth = useOAuthPopup();
  const [modal, setModal] = useState<ModalKind | null>(null);

  if (!entry) return null;

  const open = (): void => {
    if (entry.id === ConnectionProvider.HTTP) setModal('http');
    else if (entry.id === ConnectionProvider.OLLAMA) setModal('ollama');
    else if (entry.type === ConnectionType.API_KEY || entry.type === ConnectionType.CUSTOM)
      setModal('apiKey');
    else setModal('oauth');
  };

  const handleCreate = async (body: Parameters<typeof create>[0]): Promise<void> => {
    const created = await create(body);
    toast({ tone: 'success', message: 'Connection added' });
    onCreated(created.id);
    setModal(null);
  };

  const handleOAuth: React.ComponentProps<typeof OAuthConnectionModal>['onConnect'] = (params) =>
    oauth.start(params).then(async (outcome) => {
      if (outcome.status === 'success') {
        toast({ tone: 'success', message: 'Connection added' });
        await fetch();
        if (outcome.connectionId) onCreated(outcome.connectionId);
        setModal(null);
      } else if (outcome.status === 'cancelled') {
        toast({ tone: 'info', message: 'OAuth cancelled' });
      } else if (outcome.status === 'error') {
        toast({ tone: 'error', message: outcome.message ?? 'OAuth failed' });
      } else {
        toast({ tone: 'error', message: 'OAuth timed out' });
      }
      return outcome;
    });

  const triggerClass =
    variant === 'cta'
      ? cn(
          'mt-2 inline-flex items-center gap-1.5 rounded-md border border-accent-teal/40 bg-accent-teal/10 px-2.5 py-1.5',
          'text-xs font-medium text-accent-teal transition hover:bg-accent-teal/15',
          'focus:outline-none focus:ring-1 focus:ring-accent-teal',
        )
      : cn(
          'inline-flex items-center gap-1 text-xs font-medium text-accent-teal transition',
          'hover:underline focus:outline-none focus:ring-1 focus:ring-accent-teal',
        );

  return (
    <>
      <button
        type="button"
        data-testid="inline-add-connection"
        onClick={open}
        className={triggerClass}
      >
        <Plus aria-hidden className="h-3 w-3" />
        <span>Add a {label} connection</span>
      </button>

      {modal === 'apiKey' && (
        <ApiKeyConnectionModal
          provider={entry.id}
          type={entry.type}
          onClose={() => setModal(null)}
          onCreate={handleCreate}
        />
      )}
      {modal === 'http' && (
        <HttpConnectionModal onClose={() => setModal(null)} onCreate={handleCreate} />
      )}
      {modal === 'ollama' && (
        <OllamaConnectionModal onClose={() => setModal(null)} onCreate={handleCreate} />
      )}
      {modal === 'oauth' && (
        <OAuthConnectionModal
          provider={entry.id}
          onClose={() => setModal(null)}
          onConnect={handleOAuth}
        />
      )}
    </>
  );
}

export default InlineConnectionCreator;
