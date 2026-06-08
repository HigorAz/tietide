import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Shared from '@tietide/shared';
import { Role } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';

// Inject a connector node into the catalog so we can exercise app-grouping
// of unknown nodes via the prefix fallback. The mock keeps every other shared
// export pointing at the real module.
vi.mock('@tietide/shared', async (orig) => {
  const mod = await orig<typeof Shared>();
  const extended = [
    ...mod.NODE_CATALOG,
    {
      type: 'slack-send-future' as unknown as (typeof mod.NodeType)[keyof typeof mod.NodeType],
      name: 'Send Slack Message (Future)',
      description: 'Post a message to a Slack channel',
      category: mod.NodeCategory.ACTION,
      provider: 'slack',
    },
  ];
  return { ...mod, NODE_CATALOG: extended };
});

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    user: {
      id: 'user-test',
      email: 'tester@tietide.dev',
      name: 'Tester',
      role: Role.USER,
      emailVerified: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    token: 'jwt-test',
  });
});

afterEach(() => {
  useAuthStore.setState({ user: null, token: null });
});

describe('NodeLibrary provider filtering', () => {
  it('should bucket an unknown slack-* node under the Slack app via prefix fallback', async () => {
    const { NodeLibrary } = await import('./NodeLibrary');
    const user = userEvent.setup();
    render(<NodeLibrary />);

    const slackApp = screen.getByTestId('node-library-app-actions-slack');
    const toggle = within(slackApp).getByRole('button');
    if (toggle.getAttribute('aria-expanded') === 'false') {
      await user.click(toggle);
    }

    expect(within(slackApp).getByText('Send Slack Message (Future)')).toBeInTheDocument();
  });

  it('should filter by provider name', async () => {
    const { NodeLibrary } = await import('./NodeLibrary');
    const user = userEvent.setup();
    render(<NodeLibrary />);

    await user.type(screen.getByPlaceholderText(/search/i), 'slack');

    expect(screen.getByText('Send Slack Message (Future)')).toBeInTheDocument();
    expect(screen.queryByText('Manual Trigger')).not.toBeInTheDocument();
    expect(screen.queryByText('HTTP Request')).not.toBeInTheDocument();
  });
});
