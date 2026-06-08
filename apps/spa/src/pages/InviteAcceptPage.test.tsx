import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@/api/organizations', () => ({
  acceptInvite: vi.fn(),
  listOrganizations: vi.fn(),
}));

import * as orgsApi from '@/api/organizations';
import type { OrganizationSummary } from '@/api/organizations';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { InviteAcceptPage } from './InviteAcceptPage';

const mockedAccept = vi.mocked(orgsApi.acceptInvite);
const mockedList = vi.mocked(orgsApi.listOrganizations);

const org = (id: string, name: string): OrganizationSummary => ({
  id,
  name,
  slug: id,
  role: 'MEMBER',
});

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/organizations/accept-invite" element={<InviteAcceptPage />} />
        <Route path="/organizations/members" element={<div>Members page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('InviteAcceptPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useToastStore.setState({ toasts: [] });
    useAuthStore.setState({ organizations: [], activeOrganization: null });
    mockedAccept.mockReset();
    mockedList.mockReset();
  });

  it('accepts the invite, activates the org, and navigates to members', async () => {
    mockedAccept.mockResolvedValueOnce(org('org-9', 'Joined Org'));
    mockedList.mockResolvedValueOnce([org('org-9', 'Joined Org')]);

    renderAt('/organizations/accept-invite?token=raw-token');

    await waitFor(() => expect(screen.getByText('Members page')).toBeInTheDocument());
    expect(mockedAccept).toHaveBeenCalledWith('raw-token');
    expect(useAuthStore.getState().activeOrganization?.id).toBe('org-9');
  });

  it('shows an error when the token is missing', () => {
    renderAt('/organizations/accept-invite');
    expect(screen.getByText(/missing its token/i)).toBeInTheDocument();
    expect(mockedAccept).not.toHaveBeenCalled();
  });

  it('shows a generic error when the invite is invalid', async () => {
    mockedAccept.mockRejectedValueOnce(new Error('This invitation is invalid or has expired.'));

    renderAt('/organizations/accept-invite?token=bad');

    await waitFor(() =>
      expect(screen.getByText(/invitation is invalid or has expired/i)).toBeInTheDocument(),
    );
  });
});
