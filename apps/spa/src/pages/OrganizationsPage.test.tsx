import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/organizations', () => ({
  createOrganization: vi.fn(),
  listOrganizations: vi.fn(),
}));

import * as orgsApi from '@/api/organizations';
import type { OrganizationSummary } from '@/api/organizations';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { OrganizationsPage } from './OrganizationsPage';

const mockedCreate = vi.mocked(orgsApi.createOrganization);
const mockedList = vi.mocked(orgsApi.listOrganizations);

const org = (id: string, name: string): OrganizationSummary => ({
  id,
  name,
  slug: id,
  role: 'SUPERADMIN',
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <OrganizationsPage />
    </MemoryRouter>,
  );

describe('OrganizationsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useToastStore.setState({ toasts: [] });
    useAuthStore.setState({
      organizations: [org('a', 'Acme')],
      activeOrganization: org('a', 'Acme'),
    });
    mockedCreate.mockReset();
    mockedList.mockReset();
  });

  it('lists the workspaces the user belongs to', () => {
    renderPage();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('creates a workspace and switches to it', async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValueOnce(org('new', 'New Team'));
    mockedList.mockResolvedValueOnce([org('a', 'Acme'), org('new', 'New Team')]);

    renderPage();

    await user.type(screen.getByLabelText(/name/i), 'New Team');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('New Team'));
    await waitFor(() => expect(useAuthStore.getState().activeOrganization?.id).toBe('new'));
  });
});
