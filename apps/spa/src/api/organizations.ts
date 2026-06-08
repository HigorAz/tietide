import type { OrgRole } from '@tietide/shared';
import { api } from './client';

/** An organization plus the calling user's role within it (org-switcher payload). */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface OrgMember {
  userId: string;
  email: string;
  name: string;
  role: OrgRole;
  createdAt: string;
}

export interface OrgInvite {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  createdAt: string;
}

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const { data } = await api.get<OrganizationSummary[]>('/organizations');
  return data;
}

export async function createOrganization(name: string): Promise<OrganizationSummary> {
  const { data } = await api.post<OrganizationSummary>('/organizations', { name });
  return data;
}

export async function getOrganization(id: string): Promise<OrganizationDetail> {
  const { data } = await api.get<OrganizationDetail>(`/organizations/${id}`);
  return data;
}

export async function renameOrganization(id: string, name: string): Promise<OrganizationDetail> {
  const { data } = await api.patch<OrganizationDetail>(`/organizations/${id}`, { name });
  return data;
}

export async function deleteOrganization(id: string): Promise<void> {
  await api.delete(`/organizations/${id}`);
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const { data } = await api.get<OrgMember[]>(`/organizations/${orgId}/members`);
  return data;
}

export async function changeMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<OrgMember> {
  const { data } = await api.patch<OrgMember>(`/organizations/${orgId}/members/${userId}`, {
    role,
  });
  return data;
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  await api.delete(`/organizations/${orgId}/members/${userId}`);
}

export async function listInvites(orgId: string): Promise<OrgInvite[]> {
  const { data } = await api.get<OrgInvite[]>(`/organizations/${orgId}/invites`);
  return data;
}

export async function createInvite(
  orgId: string,
  email: string,
  role: OrgRole,
): Promise<OrgInvite> {
  const { data } = await api.post<OrgInvite>(`/organizations/${orgId}/invites`, { email, role });
  return data;
}

export async function revokeInvite(orgId: string, inviteId: string): Promise<void> {
  await api.delete(`/organizations/${orgId}/invites/${inviteId}`);
}

export async function acceptInvite(token: string): Promise<OrganizationSummary> {
  const { data } = await api.post<OrganizationSummary>('/organizations/invites/accept', { token });
  return data;
}
