import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/api/organizations', () => ({
  renameOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
}));

import * as orgsApi from '@/api/organizations';
import type { OrganizationSummary } from '@/api/organizations';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { WorkspaceAdminSection } from './WorkspaceAdminSection';

const org = (id: string, name: string): OrganizationSummary => ({
  id,
  name,
  slug: id,
  role: 'SUPERADMIN',
});

describe('WorkspaceAdminSection', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.mocked(orgsApi.renameOrganization).mockReset();
    vi.mocked(orgsApi.deleteOrganization).mockReset();
    useAuthStore.setState({
      organizations: [org('a', 'Acme')],
      activeOrganization: org('a', 'Acme'),
      loadOrganizations: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('disables Save until the name actually changes, then renames', async () => {
    vi.mocked(orgsApi.renameOrganization).mockResolvedValue({
      id: 'a',
      name: 'Acme Inc',
      slug: 'a',
      createdAt: '2026-01-01T00:00:00Z',
    });
    const user = userEvent.setup();
    render(<WorkspaceAdminSection activeOrg={org('a', 'Acme')} />);

    expect(screen.getByRole('button', { name: /save name/i })).toBeDisabled();

    const input = screen.getByLabelText(/workspace name/i);
    await user.clear(input);
    await user.type(input, 'Acme Inc');
    await user.click(screen.getByRole('button', { name: /save name/i }));

    await waitFor(() => expect(orgsApi.renameOrganization).toHaveBeenCalledWith('a', 'Acme Inc'));
    expect(useAuthStore.getState().loadOrganizations).toHaveBeenCalled();
  });

  it('deletes the workspace and reconciles memberships', async () => {
    vi.mocked(orgsApi.deleteOrganization).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<WorkspaceAdminSection activeOrg={org('a', 'Acme')} />);

    await user.click(screen.getByRole('button', { name: /^delete workspace$/i }));
    const dialog = screen.getByRole('dialog', { name: /delete workspace/i });
    await user.click(within(dialog).getByRole('button', { name: /delete workspace/i }));

    await waitFor(() => expect(orgsApi.deleteOrganization).toHaveBeenCalledWith('a'));
    expect(useAuthStore.getState().loadOrganizations).toHaveBeenCalled();
  });
});
