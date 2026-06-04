import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NodeType, PILL_SAMPLE_KEY } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { TestNodeButton } from './TestNodeButton';

vi.mock('@/stores/toastStore', () => ({ useToastStore: () => vi.fn() }));
vi.mock('./serialization', () => ({
  toWorkflowDefinition: () => ({ nodes: [], edges: [] }),
}));
vi.mock('@/api/executions', () => ({
  testNode: vi.fn(),
  getExecution: vi.fn(),
  listExecutionSteps: vi.fn(),
}));
import { testNode, getExecution, listExecutionSteps } from '@/api/executions';

const NODE_ID = 'n2';

const mockedTestNode = vi.mocked(testNode);
const mockedGetExecution = vi.mocked(getExecution);
const mockedListSteps = vi.mocked(listExecutionSteps);

describe('TestNodeButton', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState, workflowId: 'wf-1' });
    vi.clearAllMocks();
  });

  it('captures the node output into __pillSample on a successful run', async () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    mockedTestNode.mockResolvedValue({ id: 'exec-1' } as never);
    mockedGetExecution.mockResolvedValue({ id: 'exec-1', status: 'SUCCESS' } as never);
    mockedListSteps.mockResolvedValue([
      { nodeId: NODE_ID, outputData: { id: 42, ok: true } },
    ] as never);

    render(<TestNodeButton nodeId={NODE_ID} />);
    fireEvent.click(screen.getByTestId('test-node-button'));

    await waitFor(() =>
      expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, {
        [PILL_SAMPLE_KEY]: { id: 42, ok: true },
      }),
    );
    expect(mockedTestNode).toHaveBeenCalledWith('wf-1', NODE_ID, { nodes: [], edges: [] });
  });

  it('shows an error and does not capture when the execution fails', async () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    mockedTestNode.mockResolvedValue({ id: 'exec-2' } as never);
    mockedGetExecution.mockResolvedValue({ id: 'exec-2', status: 'FAILED' } as never);

    render(<TestNodeButton nodeId={NODE_ID} />);
    fireEvent.click(screen.getByTestId('test-node-button'));

    await waitFor(() => expect(screen.getByTestId('test-node-error')).toBeInTheDocument());
    expect(updateNodeConfig).not.toHaveBeenCalled();
  });

  it('rejects an oversized output sample without capturing', async () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    const huge = { blob: 'x'.repeat(40000) };
    mockedTestNode.mockResolvedValue({ id: 'exec-3' } as never);
    mockedGetExecution.mockResolvedValue({ id: 'exec-3', status: 'SUCCESS' } as never);
    mockedListSteps.mockResolvedValue([{ nodeId: NODE_ID, outputData: huge }] as never);

    render(<TestNodeButton nodeId={NODE_ID} />);
    fireEvent.click(screen.getByTestId('test-node-button'));

    await waitFor(() => expect(screen.getByTestId('test-node-error')).toBeInTheDocument());
    expect(updateNodeConfig).not.toHaveBeenCalled();
  });

  it('is disabled when this node has a broken data-pill reference', () => {
    useEditorStore.setState({
      nodes: [
        {
          id: NODE_ID,
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            label: 'Sink',
            nodeType: NodeType.HTTP_REQUEST,
            config: { url: '{{steps.ghost.statusCode}}' },
          },
        },
      ],
      edges: [],
    });

    render(<TestNodeButton nodeId={NODE_ID} />);
    expect(screen.getByTestId('test-node-button')).toBeDisabled();
  });
});
