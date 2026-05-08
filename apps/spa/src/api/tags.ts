import type { Tag } from '@tietide/shared';
import { api } from './client';

export interface CreateTagBody {
  name: string;
  color?: string | null;
}

export interface UpdateTagBody {
  name?: string;
  color?: string | null;
}

export async function listTags(): Promise<Tag[]> {
  const { data } = await api.get<Tag[]>('/tags');
  return data;
}

export async function createTag(body: CreateTagBody): Promise<Tag> {
  const { data } = await api.post<Tag>('/tags', body);
  return data;
}

export async function updateTag(id: string, body: UpdateTagBody): Promise<Tag> {
  const { data } = await api.patch<Tag>(`/tags/${id}`, body);
  return data;
}

export async function deleteTag(id: string): Promise<void> {
  await api.delete(`/tags/${id}`);
}
