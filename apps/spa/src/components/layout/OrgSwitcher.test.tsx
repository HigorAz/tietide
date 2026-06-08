import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { OrganizationSummary } from '@/api/organizations';
import { useAuthStore, ACTIVE_ORG_STORAGE_KEY } from '@/stores/authStore';
import { OrgSwitcher } from './OrgSwitcher';

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
});
