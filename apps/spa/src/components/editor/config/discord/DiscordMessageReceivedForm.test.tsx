import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { listProviderSubscriptions } from '@/api/providerSubscriptions';
import { DiscordMessageReceivedForm } from './DiscordMessageReceivedForm';

vi.mock('@/api/providerSubscriptions', () => ({
  listProviderSubscriptions: vi.fn(),
}));

const mockedList = vi.mocked(listProviderSubscriptions);
const NODE_ID = 'node-discord-1';
const URL = 'https://tietide.com/v1/provider-webhooks/discord-bot/sub-1';

// ConnectionPicker fetches when the connections store is idle — mark it ready
// so rendering this form never triggers a real network call.
const readyConnectionsStore = (): void => {
  useConnectionsStore.setState({
    connections: [],
    status: 'ready',
    error: null,
    testingIds: {},
    deletingIds: {},
  });
};

describe('DiscordMessageReceivedForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    readyConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
    mockedList.mockReset();
  });

  it('shows the Interactions Endpoint URL when a subscription exists for this node', async () => {
    useEditorStore.setState({ workflowId: 'wf-1' });
    mockedList.mockResolvedValue([
      { id: 'sub-1', nodeId: NODE_ID, provider: 'discord-bot', callbackUrl: URL, expiresAt: null },
    ]);

    render(<DiscordMessageReceivedForm nodeId={NODE_ID} config={{}} />);

    const input = await screen.findByTestId('discord-interactions-url-input');
    expect(input).toHaveValue(URL);
    expect(screen.getByTestId('discord-interactions-url-copy')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('wf-1');
  });

  it('shows the activate hint when the workflow has no subscription for this node yet', async () => {
    useEditorStore.setState({ workflowId: 'wf-1' });
    mockedList.mockResolvedValue([]);

    render(<DiscordMessageReceivedForm nodeId={NODE_ID} config={{}} />);

    expect(await screen.findByTestId('discord-interactions-url-pending')).toBeInTheDocument();
  });

  it('shows the save hint and does not call the API when the workflow is unsaved', () => {
    // workflowId stays null (initialEditorState)
    render(<DiscordMessageReceivedForm nodeId={NODE_ID} config={{}} />);

    expect(screen.getByTestId('discord-interactions-url-unsaved')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });
});
