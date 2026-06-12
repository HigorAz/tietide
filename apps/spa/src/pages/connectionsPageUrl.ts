import { getProviderEntry, type ProviderEntry } from '@/components/connections/providerCatalog';

export interface BridgeOutcome {
  status: 'success' | 'error';
  connectionId?: string;
}

export interface DeepLinkRequest {
  provider: ProviderEntry;
}

export const readBridgeFromUrl = (search: string): BridgeOutcome | null => {
  const params = new URLSearchParams(search);
  const status = params.get('status');
  if (status !== 'success' && status !== 'error') return null;
  // Note: we deliberately do NOT read a `message` URL param. It is
  // attacker-controllable (anyone can craft /connections?status=error&message=…)
  // and was previously reflected into the opener postMessage payload and a
  // toast. Outcome messages are fixed, status-keyed strings chosen client-side.
  return {
    status,
    connectionId: params.get('id') ?? undefined,
  };
};

export const readDeepLinkFromUrl = (search: string): DeepLinkRequest | null => {
  const params = new URLSearchParams(search);
  if (params.get('connect') !== 'true') return null;
  const providerId = params.get('provider');
  if (!providerId) return null;
  const provider = getProviderEntry(providerId);
  if (!provider) return null;
  return { provider };
};
