import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OLLAMA_TEXT_MODELS } from '@tietide/shared';
import { OllamaModelSelect } from './OllamaModelSelect';

vi.mock('@/api/connections', () => ({
  listOllamaModels: vi.fn(),
  pullOllamaModel: vi.fn(),
}));

import { listOllamaModels, pullOllamaModel } from '@/api/connections';

const mockedList = vi.mocked(listOllamaModels);
const mockedPull = vi.mocked(pullOllamaModel);

const CONNECTION_ID = '44444444-4444-4444-8444-444444444444';

describe('OllamaModelSelect', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedPull.mockReset();
  });

  it('shows only curated options and no pull control when the server is unreachable', async () => {
    mockedList.mockResolvedValueOnce({ models: [], reachable: false });

    render(
      <OllamaModelSelect
        connectionId={CONNECTION_ID}
        value=""
        onChange={vi.fn()}
        curated={OLLAMA_TEXT_MODELS}
        allowBlank
      />,
    );

    await waitFor(() => expect(screen.getByTestId('ollama-model-unreachable')).toBeInTheDocument());

    const select = screen.getByTestId('ollama-model-select');
    // No "Installed" optgroup when unreachable.
    expect(within(select).queryByRole('group', { name: 'Installed' })).not.toBeInTheDocument();
    // Curated models are present.
    expect(
      within(select).getByRole('group', { name: 'Available (needs pull)' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('ollama-model-pull-button')).not.toBeInTheDocument();
  });

  it('lists installed models under an Installed group when reachable', async () => {
    mockedList.mockResolvedValueOnce({ models: ['llama3.1:8b'], reachable: true });

    render(
      <OllamaModelSelect
        connectionId={CONNECTION_ID}
        value="llama3.1:8b"
        onChange={vi.fn()}
        curated={OLLAMA_TEXT_MODELS}
        allowBlank
      />,
    );

    const installedGroup = await screen.findByRole('group', { name: 'Installed' });
    expect(within(installedGroup).getByRole('option', { name: 'llama3.1:8b' })).toBeInTheDocument();
  });

  it('shows a Pull button for a not-installed model and re-fetches after a successful pull', async () => {
    // First probe: server reachable, model not installed yet.
    mockedList.mockResolvedValueOnce({ models: [], reachable: true });
    // After the pull, the re-fetch reports the model as installed.
    mockedList.mockResolvedValueOnce({ models: ['mistral:7b'], reachable: true });
    mockedPull.mockImplementationOnce(async (_input, onProgress) => {
      onProgress({ status: 'pulling', completed: 50, total: 100 });
      onProgress({ status: 'success' });
    });

    render(
      <OllamaModelSelect
        connectionId={CONNECTION_ID}
        value="mistral:7b"
        onChange={vi.fn()}
        curated={OLLAMA_TEXT_MODELS}
        allowBlank
      />,
    );

    const pullBtn = await screen.findByTestId('ollama-model-pull-button');
    expect(pullBtn).toBeInTheDocument();

    fireEvent.click(pullBtn);

    await waitFor(() => expect(mockedPull).toHaveBeenCalledTimes(1));
    expect(mockedPull.mock.calls[0][0]).toMatchObject({
      connectionId: CONNECTION_ID,
      model: 'mistral:7b',
    });

    // After the pull resolves the installed list is re-fetched and the model is
    // now installed, so the pull note disappears.
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByTestId('ollama-model-pull-button')).not.toBeInTheDocument(),
    );
  });

  it('reveals a custom text input when "Other…" is selected and forwards typing', async () => {
    mockedList.mockResolvedValueOnce({ models: [], reachable: true });
    const onChange = vi.fn();

    render(
      <OllamaModelSelect
        connectionId={CONNECTION_ID}
        value=""
        onChange={onChange}
        curated={OLLAMA_TEXT_MODELS}
        allowBlank
      />,
    );

    const select = await screen.findByTestId('ollama-model-select');
    fireEvent.change(select, { target: { value: '__custom__' } });

    const input = await screen.findByTestId('ollama-model-custom-input');
    fireEvent.change(input, { target: { value: 'my-model:latest' } });
    expect(onChange).toHaveBeenCalledWith('my-model:latest');
  });
});
