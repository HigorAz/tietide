import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionProvider, ConnectionType } from '@tietide/shared';
import { OllamaConnectionModal } from './OllamaConnectionModal';

vi.mock('@/api/connections', () => ({
  listOllamaModels: vi.fn(),
  pullOllamaModel: vi.fn(),
}));

import { listOllamaModels } from '@/api/connections';

const mockedList = vi.mocked(listOllamaModels);

describe('OllamaConnectionModal', () => {
  const onClose = vi.fn();
  const onCreate = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    onCreate.mockReset();
    mockedList.mockReset();
    // baseUrl defaults to a valid URL, so the model select probes on mount.
    mockedList.mockResolvedValue({ models: [], reachable: true });
  });

  const renderModal = () => render(<OllamaConnectionModal onClose={onClose} onCreate={onCreate} />);

  it('renders with the default name, server URL and model select', () => {
    renderModal();
    expect((screen.getByLabelText(/connection name/i) as HTMLInputElement).value).toBe(
      'Local Ollama',
    );
    expect((screen.getByLabelText(/server url/i) as HTMLInputElement).value).toBe(
      'http://localhost:11434',
    );
    expect(screen.getByTestId('ollama-model-select')).toBeInTheDocument();
  });

  it('submits an ollama config with the chosen model', async () => {
    onCreate.mockResolvedValueOnce(undefined);
    renderModal();

    // Pick a curated model from the select.
    fireEvent.change(screen.getByTestId('ollama-model-select'), {
      target: { value: 'qwen2.5:7b' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toEqual({
      provider: ConnectionProvider.OLLAMA,
      type: ConnectionType.CUSTOM,
      name: 'Local Ollama',
      config: { baseUrl: 'http://localhost:11434', model: 'qwen2.5:7b' },
    });
  });

  it('blocks submit and shows an error when no model is selected', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

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
