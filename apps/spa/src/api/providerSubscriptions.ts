import { api } from './client';

export interface ProviderSubscription {
  id: string;
  nodeId: string;
  provider: string;
  /** Public URL to register with the provider (e.g. Discord Interactions Endpoint URL). */
  callbackUrl: string;
  expiresAt: string | null;
}

export async function listProviderSubscriptions(
  workflowId: string,
): Promise<ProviderSubscription[]> {
  const { data } = await api.get<ProviderSubscription[]>(
    `/workflows/${workflowId}/provider-subscriptions`,
  );
  return data;
}
