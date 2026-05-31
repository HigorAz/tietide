import type { ConnectionStatus, ConnectionType, ConnectionProvider } from '@tietide/shared';
import { api } from './client';
import { fetchAllPages } from './pagination';

export interface ConnectionView {
  id: string;
  type: ConnectionType;
  provider: string;
  name: string;
  status: ConnectionStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionBody {
  provider: ConnectionProvider;
  type: ConnectionType;
  name: string;
  config: Record<string, unknown>;
}

export interface UpdateConnectionBody {
  name?: string;
  status?: ConnectionStatus;
}

export interface TestConnectionResult {
  ok: boolean;
  message?: string;
  latencyMs: number;
}

export interface StartOAuthResult {
  redirectUrl: string;
  state: string;
}

export interface StartOAuthParams {
  provider: ConnectionProvider;
  label: string;
  scopes?: string;
}

export async function listConnections(): Promise<ConnectionView[]> {
  return fetchAllPages<ConnectionView>('/connections');
}

export async function getConnection(id: string): Promise<ConnectionView> {
  const { data } = await api.get<ConnectionView>(`/connections/${id}`);
  return data;
}

export async function createConnection(body: CreateConnectionBody): Promise<ConnectionView> {
  const { data } = await api.post<ConnectionView>('/connections', body);
  return data;
}

export async function updateConnection(
  id: string,
  body: UpdateConnectionBody,
): Promise<ConnectionView> {
  const { data } = await api.patch<ConnectionView>(`/connections/${id}`, body);
  return data;
}

export async function deleteConnection(id: string): Promise<void> {
  await api.delete(`/connections/${id}`);
}

export async function testConnection(id: string): Promise<TestConnectionResult> {
  const { data } = await api.post<TestConnectionResult>(`/connections/${id}/test`);
  return data;
}

export async function startOAuth(params: StartOAuthParams): Promise<StartOAuthResult> {
  const search = new URLSearchParams({ provider: params.provider, label: params.label });
  if (params.scopes) {
    search.set('scopes', params.scopes);
  }
  const { data } = await api.get<StartOAuthResult>(`/connections/oauth/start?${search.toString()}`);
  return data;
}
