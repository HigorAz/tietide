import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

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

vi.mock('@/api/billing', () => ({
  getBilling: vi.fn().mockResolvedValue({
    plan: 'FREE',
    status: 'ACTIVE',
    seats: { used: 1, included: 2, max: 2 },
    runs: { used: 0, included: 1000, hardCap: 1000 },
    workflows: { used: 0, max: 10 },
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    configured: false,
  }),
  startCheckout: vi.fn(),
  openBillingPortal: vi.fn(),
}));

import * as orgsApi from '@/api/organizations';
import type { OrganizationSummary } from '@/api/organizations';
import { useAuthStore, ACTIVE_ORG_STORAGE_KEY } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { resetMembersStore } from '@/stores/membersStore';
import { WorkspaceSettingsPage } from './WorkspaceSettingsPage';

const org = (id: string, name: string, role: OrganizationSummary['role']): OrganizationSummary => ({
  id,
  name,
  slug: id,
  role,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <WorkspaceSettingsPage />
    </MemoryRouter>,
  );

describe('WorkspaceSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMembersStore();
    useToastStore.setState({ toasts: [] });
    vi.mocked(orgsApi.listMembers).mockResolvedValue([]);
    vi.mocked(orgsApi.listInvites).mockResolvedValue([]);
  });

  it('renders the General tab with the workspaces list by default', () => {
    useAuthStore.setState({
      organizations: [org('a', 'Acme', 'SUPERADMIN'), org('b', 'Beta', 'MEMBER')],
      activeOrganization: org('a', 'Acme', 'SUPERADMIN'),
    });
    renderPage();

    expect(
      screen.getByRole('heading', { name: /workspace settings/i, level: 1 }),
    ).toBeInTheDocument();
    const list = screen.getByRole('region', { name: /your workspaces/i });
    expect(list).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('exposes General, Members and Plan & billing tabs for a SUPERADMIN', () => {
    useAuthStore.setState({
      organizations: [org('a', 'Acme', 'SUPERADMIN')],
      activeOrganization: org('a', 'Acme', 'SUPERADMIN'),
    });
    renderPage();

    expect(screen.getByRole('tab', { name: /general/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /members/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /plan & billing/i })).toBeInTheDocument();
  });

  it('shows the SUPERADMIN rename/delete card on the General tab', async () => {
    useAuthStore.setState({
      organizations: [org('a', 'Acme', 'SUPERADMIN')],
      activeOrganization: org('a', 'Acme', 'SUPERADMIN'),
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('region', { name: /workspace settings/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /delete workspace/i })).toBeInTheDocument();
  });

  it('switches to the Members tab and renders the members manager', async () => {
    useAuthStore.setState({
      organizations: [org('a', 'Acme', 'SUPERADMIN')],
      activeOrganization: org('a', 'Acme', 'SUPERADMIN'),
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('tab', { name: /members/i }));
    expect(await screen.findByRole('region', { name: /^members$/i })).toBeInTheDocument();
  });

  it('shows the billing usage meters on the Plan & billing tab', async () => {
    useAuthStore.setState({
      organizations: [org('a', 'Acme', 'SUPERADMIN')],
      activeOrganization: org('a', 'Acme', 'SUPERADMIN'),
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('tab', { name: /plan & billing/i }));
    expect(await screen.findByRole('region', { name: /plan & billing/i })).toBeInTheDocument();
    // The usage meters live inside Plan & billing.
    expect(await screen.findByText(/runs this period/i)).toBeInTheDocument();
  });

  it('hides the Plan & billing tab and rename/delete card for a non-SUPERADMIN', () => {
    useAuthStore.setState({
      organizations: [org('a', 'Acme', 'ADMIN')],
      activeOrganization: org('a', 'Acme', 'ADMIN'),
    });
    renderPage();

    expect(screen.queryByRole('tab', { name: /plan & billing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /workspace settings/i })).not.toBeInTheDocument();
    // ADMIN can still reach the Members tab.
    expect(screen.getByRole('tab', { name: /members/i })).toBeInTheDocument();
  });

  it('still lets the user switch workspaces from the General tab', async () => {
    useAuthStore.setState({
      organizations: [org('a', 'Acme', 'SUPERADMIN'), org('b', 'Beta', 'MEMBER')],
      activeOrganization: org('a', 'Acme', 'SUPERADMIN'),
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /switch/i }));
    expect(useAuthStore.getState().activeOrganization?.id).toBe('b');
    expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBe('b');
  });
});
