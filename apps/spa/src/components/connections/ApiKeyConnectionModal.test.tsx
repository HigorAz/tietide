import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionProvider, ConnectionType } from '@tietide/shared';
import { ApiKeyConnectionModal } from './ApiKeyConnectionModal';

describe('ApiKeyConnectionModal', () => {
  const onClose = vi.fn();
  const onCreate = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    onCreate.mockReset();
  });

  it('should render an apiKey field and an optional organization field for OpenAI', () => {
    render(
      <ApiKeyConnectionModal
        provider={ConnectionProvider.OPENAI}
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/organization/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/organization/i).getAttribute('aria-required')).not.toBe('true');
  });

  it('should render only an apiKey field for Anthropic', () => {
    render(
      <ApiKeyConnectionModal
        provider={ConnectionProvider.ANTHROPIC}
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/organization/i)).not.toBeInTheDocument();
  });

  it('should mark apiKey input as type="password"', () => {
    render(
      <ApiKeyConnectionModal
        provider={ConnectionProvider.OPENAI}
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    const input = screen.getByLabelText(/api key/i) as HTMLInputElement;
    expect(input.type).toBe('password');
  });

  it('should reject submit when apiKey is empty', async () => {
    const user = userEvent.setup();
    render(
      <ApiKeyConnectionModal
        provider={ConnectionProvider.OPENAI}
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('should call onCreate with the typed apiKey, omitting the empty optional field', async () => {
    const user = userEvent.setup();
    onCreate.mockResolvedValueOnce(undefined);
    render(
      <ApiKeyConnectionModal
        provider={ConnectionProvider.OPENAI}
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    await user.type(screen.getByLabelText(/api key/i), 'sk-abc');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const [body] = onCreate.mock.calls[0];
    expect(body).toEqual({
      provider: ConnectionProvider.OPENAI,
      type: ConnectionType.API_KEY,
      name: 'My OpenAI',
      config: { apiKey: 'sk-abc' },
    });
  });

  it('should include the organization when filled', async () => {
    const user = userEvent.setup();
    onCreate.mockResolvedValueOnce(undefined);
    render(
      <ApiKeyConnectionModal
        provider={ConnectionProvider.OPENAI}
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    await user.type(screen.getByLabelText(/api key/i), 'sk-abc');
    await user.type(screen.getByLabelText(/organization/i), 'org-1');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const [body] = onCreate.mock.calls[0];
    expect(body.config).toEqual({ apiKey: 'sk-abc', organization: 'org-1' });
  });

  it('should call onClose on Cancel', async () => {
    const user = userEvent.setup();
    render(
      <ApiKeyConnectionModal
        provider={ConnectionProvider.OPENAI}
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
