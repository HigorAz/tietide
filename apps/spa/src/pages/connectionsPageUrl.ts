import { getProviderEntry, type ProviderEntry } from '@/components/connections/providerCatalog';

export interface BridgeOutcome {
  status: 'success' | 'error';
  connectionId?: string;
  message?: string;
}

export interface DeepLinkRequest {
  provider: ProviderEntry;
}

export const readBridgeFromUrl = (search: string): BridgeOutcome | null => {
  const params = new URLSearchParams(search);
  const status = params.get('status');
  if (status !== 'success' && status !== 'error') return null;
  return {
    status,
    connectionId: params.get('id') ?? undefined,
    message: params.get('message') ?? undefined,
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
