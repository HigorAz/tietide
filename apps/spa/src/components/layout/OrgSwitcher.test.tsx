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
import { useAuthStore, ACTIVE_ORG_STORAGE_KEY } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { OrgSwitcher } from './OrgSwitcher';

const mockedCreate = vi.mocked(orgsApi.createOrganization);
const mockedList = vi.mocked(orgsApi.listOrganizations);

const org = (id: string, name: string): OrganizationSummary => ({
  id,
  name,
  slug: id,
  role: 'MEMBER',
});

const renderSwitcher = (collapsed = false) =>
  render(
    <MemoryRouter>
      <OrgSwitcher collapsed={collapsed} />
    </MemoryRouter>,
  );

describe('OrgSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
    useToastStore.setState({ toasts: [] });
    mockedCreate.mockReset();
    mockedList.mockReset();
    useAuthStore.setState({
      organizations: [org('a', 'Acme'), org('b', 'Beta')],
      activeOrganization: org('a', 'Acme'),
    });
  });

  it('shows the active workspace name', () => {
    renderSwitcher();
    expect(screen.getByRole('button', { name: /acme/i })).toBeInTheDocument();
  });

  it('switches and persists the active workspace when another org is chosen', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole('button', { name: /acme/i }));
    await user.click(screen.getByRole('menuitem', { name: /beta/i }));

    expect(useAuthStore.getState().activeOrganization?.id).toBe('b');
    expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBe('b');
  });

  it('renders a compact workspaces link when collapsed', () => {
    renderSwitcher(true);
    expect(screen.getByRole('link', { name: /workspaces/i })).toBeInTheDocument();
  });

  it('no longer offers a Workspace settings item in the dropdown', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole('button', { name: /acme/i }));
    expect(screen.getByRole('menuitem', { name: /new workspace/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /workspace settings/i })).not.toBeInTheDocument();
  });

  it('creates a new workspace from the switcher and switches to it', async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValueOnce(org('new', 'New Team'));
    mockedList.mockResolvedValueOnce([org('a', 'Acme'), org('b', 'Beta'), org('new', 'New Team')]);

    renderSwitcher();

    await user.click(screen.getByRole('button', { name: /acme/i }));
    await user.click(screen.getByRole('menuitem', { name: /new workspace/i }));

    await user.type(screen.getByLabelText(/name/i), 'New Team');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('New Team'));
    await waitFor(() => expect(useAuthStore.getState().activeOrganization?.id).toBe('new'));
  });
});
