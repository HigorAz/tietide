import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { DeleteConnectionDialog } from './DeleteConnectionDialog';
import type { ConnectionView } from '@/api/connections';

const sample: ConnectionView = {
  id: 'c-1',
  type: ConnectionType.OAUTH2,
  provider: 'google',
  name: 'My Google',
  status: ConnectionStatus.ACTIVE,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-05-06T00:00:00Z',
  updatedAt: '2026-05-06T00:00:00Z',
};

describe('DeleteConnectionDialog', () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    onConfirm.mockReset();
  });

  it('should show the connection name and a Revoke button', () => {
    render(<DeleteConnectionDialog connection={sample} onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByText(/My Google/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revoke$/i })).toBeInTheDocument();
  });

  it('should call onConfirm with the id when Revoke is clicked', async () => {
    const user = userEvent.setup();
    onConfirm.mockResolvedValueOnce(undefined);
    render(<DeleteConnectionDialog connection={sample} onClose={onClose} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: /revoke$/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('c-1'));
  });

  it('should call onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<DeleteConnectionDialog connection={sample} onClose={onClose} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
