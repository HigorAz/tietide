import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/api/organizations', () => ({
  listMembers: vi.fn(),
  listInvites: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  renameOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
}));

import * as orgsApi from '@/api/organizations';
import type { OrganizationSummary } from '@/api/organizations';
import { useAuthStore, ACTIVE_ORG_STORAGE_KEY } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { resetMembersStore } from '@/stores/membersStore';
import { WorkspacesSettings } from './WorkspacesSettings';

const org = (id: string, name: string, role: OrganizationSummary['role']): OrganizationSummary => ({
  id,
  name,
  slug: id,
  role,
});

describe('WorkspacesSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMembersStore();
    useToastStore.setState({ toasts: [] });
    vi.mocked(orgsApi.listMembers).mockResolvedValue([]);
    vi.mocked(orgsApi.listInvites).mockResolvedValue([]);
  });

  it('lists workspaces and switches without offering a create form', async () => {
    useAuthStore.setState({
      organizations: [org('a', 'Acme', 'SUPERADMIN'), org('b', 'Beta', 'MEMBER')],
      activeOrganization: org('a', 'Acme', 'SUPERADMIN'),
    });
    const user = userEvent.setup();
    render(<WorkspacesSettings />);

    const list = screen.getByRole('region', { name: /your workspaces/i });
    expect(within(list).getByText('Acme')).toBeInTheDocument();
    expect(within(list).getByText('Beta')).toBeInTheDocument();
    // No workspace-creation affordance lives in the management area.
    expect(screen.queryByRole('button', { name: /create workspace/i })).not.toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: /switch/i }));
    expect(useAuthStore.getState().activeOrganization?.id).toBe('b');
    expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBe('b');
  });

  it('shows the SUPERADMIN-only workspace settings card for a SUPERADMIN', async () => {
    useAuthStore.setState({
      organizations: [org('a', 'Acme', 'SUPERADMIN')],
      activeOrganization: org('a', 'Acme', 'SUPERADMIN'),
    });
    render(<WorkspacesSettings />);

    await waitFor(() =>
      expect(screen.getByRole('region', { name: /workspace settings/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /delete workspace/i })).toBeInTheDocument();
  });

  it('hides the workspace settings card for a non-SUPERADMIN', () => {
    useAuthStore.setState({
      organizations: [org('a', 'Acme', 'ADMIN')],
      activeOrganization: org('a', 'Acme', 'ADMIN'),
    });
    render(<WorkspacesSettings />);

    expect(screen.queryByRole('region', { name: /workspace settings/i })).not.toBeInTheDocument();
    // ADMIN still manages members.
    expect(screen.getByRole('region', { name: /^members$/i })).toBeInTheDocument();
  });
});
