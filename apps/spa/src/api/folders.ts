import type { Folder } from '@tietide/shared';
import { api } from './client';
import { fetchAllPages } from './pagination';

export interface CreateFolderBody {
  name: string;
  parentFolderId?: string | null;
}

export interface UpdateFolderBody {
  name?: string;
  parentFolderId?: string | null;
}

export interface DeleteFolderResult {
  deletedFolders: number;
  deletedWorkflows: number;
}

export async function listFolders(): Promise<Folder[]> {
  return fetchAllPages<Folder>('/folders');
}

export async function createFolder(body: CreateFolderBody): Promise<Folder> {
  const { data } = await api.post<Folder>('/folders', body);
  return data;
}

export async function updateFolder(id: string, body: UpdateFolderBody): Promise<Folder> {
  const { data } = await api.patch<Folder>(`/folders/${id}`, body);
  return data;
}

export async function deleteFolder(id: string): Promise<DeleteFolderResult> {
  const { data } = await api.delete<DeleteFolderResult>(`/folders/${id}`);
  return data;
}
