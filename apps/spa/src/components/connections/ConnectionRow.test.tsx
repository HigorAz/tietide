import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { ConnectionRow } from './ConnectionRow';
import type { ConnectionView } from '@/api/connections';

const make = (overrides: Partial<ConnectionView> = {}): ConnectionView => ({
  id: 'c-1',
  type: ConnectionType.API_KEY,
  provider: 'openai',
  name: 'My OpenAI',
  status: ConnectionStatus.ACTIVE,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-05-06T00:00:00Z',
  updatedAt: '2026-05-06T00:00:00Z',
  ...overrides,
});

describe('ConnectionRow', () => {
  const onTest = vi.fn();
  const onRevoke = vi.fn();
  const onRename = vi.fn(async () => undefined);

  beforeEach(() => {
    onTest.mockReset();
    onRevoke.mockReset();
    onRename.mockReset();
    onRename.mockResolvedValue(undefined);
  });

  it('should render the connection name, provider label, and active status', () => {
    render(
      <ConnectionRow
        connection={make()}
        isTesting={false}
        isDeleting={false}
        onTest={onTest}
        onRevoke={onRevoke}
        onRename={onRename}
      />,
    );

    expect(screen.getByText('My OpenAI')).toBeInTheDocument();
    expect(screen.getByText(/OpenAI · last used/)).toBeInTheDocument();
    expect(screen.getByText(/Active/i)).toBeInTheDocument();
  });

  it('should render Expired badge for expired status', () => {
    render(
      <ConnectionRow
        connection={make({ status: ConnectionStatus.EXPIRED })}
        isTesting={false}
        isDeleting={false}
        onTest={onTest}
        onRevoke={onRevoke}
        onRename={onRename}
      />,
    );

    expect(screen.getByText(/Expired/i)).toBeInTheDocument();
  });

  it('should call onTest with the id when Test is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ConnectionRow
        connection={make()}
        isTesting={false}
        isDeleting={false}
        onTest={onTest}
        onRevoke={onRevoke}
        onRename={onRename}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^test$/i }));

    expect(onTest).toHaveBeenCalledWith('c-1');
  });

  it('should call onRevoke with the connection when Revoke is clicked', async () => {
    const user = userEvent.setup();
    const conn = make();
    render(
      <ConnectionRow
        connection={conn}
        isTesting={false}
        isDeleting={false}
        onTest={onTest}
        onRevoke={onRevoke}
        onRename={onRename}
      />,
    );

    await user.click(screen.getByRole('button', { name: /revoke/i }));

    expect(onRevoke).toHaveBeenCalledWith(conn);
  });

  it('should disable both buttons while deleting', () => {
    render(
      <ConnectionRow
        connection={make()}
        isTesting={false}
        isDeleting={true}
        onTest={onTest}
        onRevoke={onRevoke}
        onRename={onRename}
      />,
    );

    expect(screen.getByRole('button', { name: /^test$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /revoke/i })).toBeDisabled();
  });

  it('should show "Testing…" label while isTesting is true', () => {
    render(
      <ConnectionRow
        connection={make()}
        isTesting={true}
        isDeleting={false}
        onTest={onTest}
        onRevoke={onRevoke}
        onRename={onRename}
      />,
    );

    expect(screen.getByRole('button', { name: /testing/i })).toBeInTheDocument();
  });

  it('should format lastUsedAt relatively when set', () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    render(
      <ConnectionRow
        connection={make({ lastUsedAt: recent })}
        isTesting={false}
        isDeleting={false}
        onTest={onTest}
        onRevoke={onRevoke}
        onRename={onRename}
      />,
    );

    expect(screen.getByText(/last used 5m ago/i)).toBeInTheDocument();
  });

  it('should fall back to "never" when lastUsedAt is null', () => {
    render(
      <ConnectionRow
        connection={make()}
        isTesting={false}
        isDeleting={false}
        onTest={onTest}
        onRevoke={onRevoke}
        onRename={onRename}
      />,
    );

    expect(screen.getByText(/last used never/i)).toBeInTheDocument();
  });
});
