import { api } from './client';

export type EnvVarScope = 'GLOBAL' | 'USER';

export interface EnvVarView {
  id: string;
  key: string;
  scope: EnvVarScope;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEnvVarBody {
  key: string;
  value: string;
}

export interface UpdateEnvVarBody {
  key?: string;
  value?: string;
}

// USER scope
export async function listUserEnvVars(): Promise<EnvVarView[]> {
  const { data } = await api.get<EnvVarView[]>('/env-vars');
  return data;
}

export async function createUserEnvVar(body: CreateEnvVarBody): Promise<EnvVarView> {
  const { data } = await api.post<EnvVarView>('/env-vars', body);
  return data;
}

export async function updateUserEnvVar(id: string, body: UpdateEnvVarBody): Promise<EnvVarView> {
  const { data } = await api.patch<EnvVarView>(`/env-vars/${id}`, body);
  return data;
}

export async function deleteUserEnvVar(id: string): Promise<void> {
  await api.delete(`/env-vars/${id}`);
}

// GLOBAL scope (admin)
export async function listAdminEnvVars(): Promise<EnvVarView[]> {
  const { data } = await api.get<EnvVarView[]>('/admin/env-vars');
  return data;
}

export async function createAdminEnvVar(body: CreateEnvVarBody): Promise<EnvVarView> {
  const { data } = await api.post<EnvVarView>('/admin/env-vars', body);
  return data;
}

export async function updateAdminEnvVar(id: string, body: UpdateEnvVarBody): Promise<EnvVarView> {
  const { data } = await api.patch<EnvVarView>(`/admin/env-vars/${id}`, body);
  return data;
}

export async function deleteAdminEnvVar(id: string): Promise<void> {
  await api.delete(`/admin/env-vars/${id}`);
}
