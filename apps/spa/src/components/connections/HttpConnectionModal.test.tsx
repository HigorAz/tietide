import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionProvider, ConnectionType } from '@tietide/shared';
import { HttpConnectionModal } from './HttpConnectionModal';

describe('HttpConnectionModal', () => {
  const onClose = vi.fn();
  const onCreate = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    onCreate.mockReset();
  });

  const renderModal = () => render(<HttpConnectionModal onClose={onClose} onCreate={onCreate} />);

  it('defaults to Bearer auth and shows a token field', () => {
    renderModal();
    expect(screen.getByLabelText(/authentication method/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^token$/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/^token$/i) as HTMLInputElement).type).toBe('password');
  });

  it('shows header-name and api-key fields when API key auth is selected', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.selectOptions(screen.getByLabelText(/authentication method/i), 'apiKey');

    expect(screen.getByLabelText(/header name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^token$/i)).not.toBeInTheDocument();
  });

  it('shows username and password fields when Basic auth is selected', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.selectOptions(screen.getByLabelText(/authentication method/i), 'basic');

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('submits a bearer config', async () => {
    const user = userEvent.setup();
    onCreate.mockResolvedValueOnce(undefined);
    renderModal();

    await user.clear(screen.getByLabelText(/connection name/i));
    await user.type(screen.getByLabelText(/connection name/i), 'My API');
    await user.type(screen.getByLabelText(/^token$/i), 'jwt-abc');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toEqual({
      provider: ConnectionProvider.HTTP,
      type: ConnectionType.CUSTOM,
      name: 'My API',
      config: { authType: 'bearer', token: 'jwt-abc' },
    });
  });

  it('submits an apiKey config with header name', async () => {
    const user = userEvent.setup();
    onCreate.mockResolvedValueOnce(undefined);
    renderModal();

    await user.selectOptions(screen.getByLabelText(/authentication method/i), 'apiKey');
    await user.clear(screen.getByLabelText(/header name/i));
    await user.type(screen.getByLabelText(/header name/i), 'X-Api-Key');
    await user.type(screen.getByLabelText(/api key/i), 'key-123');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0].config).toEqual({
      authType: 'apiKey',
      headerName: 'X-Api-Key',
      apiKey: 'key-123',
    });
  });

  it('blocks submit and shows an error when the token is empty', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('calls onClose on Cancel', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
