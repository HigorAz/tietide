import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/api/organizations', () => ({
  listMembers: vi.fn(),
  listInvites: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
}));

import * as orgsApi from '@/api/organizations';
import type { OrgMember, OrganizationSummary } from '@/api/organizations';
import { useToastStore } from '@/stores/toastStore';
import { resetMembersStore } from '@/stores/membersStore';
import { MembersManager } from './MembersManager';

const mockedListMembers = vi.mocked(orgsApi.listMembers);
const mockedListInvites = vi.mocked(orgsApi.listInvites);

const member = (userId: string, role: OrgMember['role'] = 'MEMBER'): OrgMember => ({
  userId,
  email: `${userId}@x.com`,
  name: userId,
  role,
  createdAt: '2026-06-01T00:00:00.000Z',
});

const org = (role: OrganizationSummary['role']): OrganizationSummary => ({
  id: 'org-1',
  name: 'Acme',
  slug: 'acme-1',
  role,
});

describe('MembersManager', () => {
  beforeEach(() => {
    resetMembersStore();
    useToastStore.setState({ toasts: [] });
    mockedListMembers.mockReset();
    mockedListInvites.mockReset();
    mockedListMembers.mockResolvedValue([member('alice', 'SUPERADMIN'), member('bob', 'MEMBER')]);
    mockedListInvites.mockResolvedValue([]);
  });

  it('shows members and manager controls for a SUPERADMIN', async () => {
    render(<MembersManager activeOrg={org('SUPERADMIN')} />);

    await waitFor(() => expect(screen.getByText('bob@x.com')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /invite member/i })).toBeInTheDocument();
    expect(mockedListInvites).toHaveBeenCalledWith('org-1');
    expect(screen.getAllByRole('button', { name: /change role/i }).length).toBeGreaterThan(0);
  });

  it('renders friendly role labels instead of the raw enum', async () => {
    render(<MembersManager activeOrg={org('SUPERADMIN')} />);

    await waitFor(() => expect(screen.getByText('bob@x.com')).toBeInTheDocument());
    expect(screen.getByText('Super admin')).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
    expect(screen.queryByText('SUPERADMIN')).not.toBeInTheDocument();
  });

  it('hides manager controls and the invite button for a VIEWER', async () => {
    render(<MembersManager activeOrg={org('VIEWER')} />);

    await waitFor(() => expect(screen.getByText('bob@x.com')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /invite member/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change role/i })).not.toBeInTheDocument();
    // A VIEWER must not even request the invite list (would 403).
    expect(mockedListInvites).not.toHaveBeenCalled();
  });
});
