import { api } from './client';

export interface AuditLogRow {
  id: string;
  userId: string;
  userEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  items: AuditLogRow[];
  nextCursor: string | null;
}

export interface AuditLogFiltersResponse {
  users: Array<{ id: string; email: string }>;
  actions: string[];
  resources: string[];
}

export interface AuditLogQuery {
  userId?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

function toParams(query: AuditLogQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (query.userId) params.userId = query.userId;
  if (query.action) params.action = query.action;
  if (query.resource) params.resource = query.resource;
  if (query.from) params.from = query.from;
  if (query.to) params.to = query.to;
  if (query.cursor) params.cursor = query.cursor;
  if (query.limit !== undefined) params.limit = query.limit;
  return params;
}

export async function listAuditLog(query: AuditLogQuery = {}): Promise<AuditLogListResponse> {
  const { data } = await api.get<AuditLogListResponse>('/admin/audit', { params: toParams(query) });
  return data;
}

export async function listAuditLogFilters(): Promise<AuditLogFiltersResponse> {
  const { data } = await api.get<AuditLogFiltersResponse>('/admin/audit/filters');
  return data;
}

export async function exportAuditLogCsv(query: AuditLogQuery = {}): Promise<Blob> {
  const { data } = await api.get<Blob>('/admin/audit/export', {
    params: toParams(query),
    responseType: 'blob',
  });
  return data;
}
