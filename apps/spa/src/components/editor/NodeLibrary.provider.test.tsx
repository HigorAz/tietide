import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Shared from '@tietide/shared';
import { Role } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';

// Inject a connector node into the catalog so we can exercise provider/group
// filtering without waiting on Epic E. The mock keeps every other shared
// export pointing at the real module.
vi.mock('@tietide/shared', async (orig) => {
  const mod = await orig<typeof Shared>();
  const extended = [
    ...mod.NODE_CATALOG,
    {
      type: 'slack-send' as unknown as (typeof mod.NodeType)[keyof typeof mod.NodeType],
      name: 'Send Slack Message',
      description: 'Post a message to a Slack channel',
      category: mod.NodeCategory.ACTION,
      group: mod.NodeGroup.COMMUNICATION,
      provider: 'slack',
    },
  ];
  return { ...mod, NODE_CATALOG: extended };
});

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    user: { id: 'user-test', email: 'tester@tietide.dev', name: 'Tester', role: Role.USER },
    token: 'jwt-test',
  });
});

afterEach(() => {
  useAuthStore.setState({ user: null, token: null });
});

describe('NodeLibrary provider filtering', () => {
  it('should show the slack node under its group when the catalog declares one', async () => {
    const { NodeLibrary } = await import('./NodeLibrary');
    render(<NodeLibrary />);

    // Anchor the regex so the "Communication" region matches but the new
    // "Communication Triggers" region added for push triggers does not.
    const communication = screen.getByRole('region', { name: /^communication$/i });
    expect(communication).toBeInTheDocument();
    expect(screen.getByText('Send Slack Message')).toBeInTheDocument();
  });

  it('should filter by provider name', async () => {
    const { NodeLibrary } = await import('./NodeLibrary');
    const user = userEvent.setup();
    render(<NodeLibrary />);

    await user.type(screen.getByPlaceholderText(/search/i), 'slack');

    expect(screen.getByText('Send Slack Message')).toBeInTheDocument();
    expect(screen.queryByText('Manual Trigger')).not.toBeInTheDocument();
    expect(screen.queryByText('HTTP Request')).not.toBeInTheDocument();
  });
});
