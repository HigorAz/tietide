import type {
  ConnectionStatus,
  ConnectionType,
  ConnectionProvider,
  OllamaModelsResult,
} from '@tietide/shared';
import { api } from './client';
import { readToken } from './tokenStorage';
import { ACTIVE_ORG_STORAGE_KEY } from '@/stores/authStore';
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
  // Whether the current user may edit/delete this connection (owner or SUPERADMIN).
  canEdit?: boolean;
}

export interface CreateConnectionBody {
  provider: ConnectionProvider;
  type: ConnectionType;
  name: string;
  config: Record<string, unknown>;
  // Ollama only: use TieTide's hosted server (baseUrl injected server-side).
  ollamaServerHosted?: boolean;
}

export interface UpdateConnectionBody {
  name?: string;
  status?: ConnectionStatus;
  // New provider credentials (validated + re-encrypted server-side). Not allowed
  // for OAuth2 connections — reconnect those instead.
  config?: Record<string, unknown>;
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

export interface OllamaModelTarget {
  connectionId?: string;
  baseUrl?: string;
  ollamaServerHosted?: boolean;
}

// Whether TieTide's hosted Ollama server is configured (feature-gates the
// "Use TieTide's hosted Ollama" option). Returns only a boolean — never the URL.
export async function getOllamaServerAvailability(): Promise<boolean> {
  const { data } = await api.get<{ available: boolean }>('/connections/ollama/server');
  return data.available;
}

export interface OllamaPullProgress {
  status: string;
  total?: number;
  completed?: number;
  error?: string;
}

/**
 * List the models installed on an Ollama server. Resolve the server either by an
 * existing `connectionId` (node forms) or a raw `baseUrl` (connection-create form).
 */
export async function listOllamaModels(input: OllamaModelTarget): Promise<OllamaModelsResult> {
  const { data } = await api.post<OllamaModelsResult>('/connections/ollama/models', input);
  return data;
}

/**
 * Trigger a model pull on the Ollama server and stream NDJSON progress lines. The
 * endpoint streams `application/x-ndjson`, so we drop to a raw `fetch` (axios buffers
 * the whole body) and parse each line incrementally, attaching the same auth + org
 * headers the axios client uses. Resolves when the stream ends; rejects on a line
 * carrying an `error` or a non-OK HTTP status.
 */
export async function pullOllamaModel(
  input: OllamaModelTarget & { model: string },
  onProgress: (progress: OllamaPullProgress) => void,
): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_URL || '/v1';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = readToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const orgId = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  if (orgId) {
    headers['X-Org-Id'] = orgId;
  }

  const response = await fetch(`${baseUrl}/connections/ollama/pull`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Pull failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const progress = JSON.parse(trimmed) as OllamaPullProgress;
    if (progress.error) {
      throw new Error(progress.error);
    }
    onProgress(progress);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      handleLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  }
  // Flush any trailing line not terminated by a newline.
  handleLine(buffer);
}

export async function startOAuth(params: StartOAuthParams): Promise<StartOAuthResult> {
  const search = new URLSearchParams({ provider: params.provider, label: params.label });
  if (params.scopes) {
    search.set('scopes', params.scopes);
  }
  const { data } = await api.get<StartOAuthResult>(`/connections/oauth/start?${search.toString()}`);
  return data;
}
