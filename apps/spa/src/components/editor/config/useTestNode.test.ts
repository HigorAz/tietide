import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { NodeType, PILL_SAMPLE_KEY } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { useTestNode } from './useTestNode';

const toast = vi.fn();
vi.mock('@/stores/toastStore', () => ({ useToastStore: () => toast }));
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

describe('useTestNode', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState, workflowId: 'wf-1' });
    vi.clearAllMocks();
  });

  it('flows idle → running → success and captures output as a pill sample', async () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    mockedTestNode.mockResolvedValue({ id: 'exec-1', status: 'PENDING' } as never);
    mockedGetExecution.mockResolvedValue({ id: 'exec-1', status: 'SUCCESS' } as never);
    mockedListSteps.mockResolvedValue([
      { nodeId: NODE_ID, outputData: { id: 42, ok: true } },
    ] as never);

    const { result } = renderHook(() => useTestNode(NODE_ID));
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.status).toBe('success');
    expect(result.current.result.output).toEqual({ id: 42, ok: true });
    expect(result.current.result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.current.result.error).toBeNull();
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, {
      [PILL_SAMPLE_KEY]: { id: 42, ok: true },
    });
    expect(toast).toHaveBeenCalledWith({
      tone: 'success',
      message: 'Output captured as a data-pill sample.',
    });
  });

  it('reports an error result and skips capture when the execution fails', async () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    mockedTestNode.mockResolvedValue({ id: 'exec-2', status: 'PENDING' } as never);
    mockedGetExecution.mockResolvedValue({ id: 'exec-2', status: 'FAILED' } as never);
    mockedListSteps.mockResolvedValue([
      { nodeId: NODE_ID, outputData: null, error: 'Gmail API returned 401' },
    ] as never);

    const { result } = renderHook(() => useTestNode(NODE_ID));
    await act(async () => {
      await result.current.run();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.result.error).not.toBeNull();
    expect(result.current.result.error?.message).toBe('Gmail API returned 401');
    expect(result.current.result.error?.code).toBeNull();
    expect(updateNodeConfig).not.toHaveBeenCalled();
  });

  it('falls back to a generic failure message when the step exposes no error text', async () => {
    mockedTestNode.mockResolvedValue({ id: 'exec-2b', status: 'PENDING' } as never);
    mockedGetExecution.mockResolvedValue({ id: 'exec-2b', status: 'FAILED' } as never);
    mockedListSteps.mockResolvedValue([{ nodeId: NODE_ID, outputData: null }] as never);

    const { result } = renderHook(() => useTestNode(NODE_ID));
    await act(async () => {
      await result.current.run();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.result.error?.message).toBe(
      'Node test did not succeed. Check the run for details.',
    );
    expect(result.current.result.error?.code).toBeNull();
  });

  it('errors with the no-output message when nothing is captured', async () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    mockedTestNode.mockResolvedValue({ id: 'exec-3', status: 'PENDING' } as never);
    mockedGetExecution.mockResolvedValue({ id: 'exec-3', status: 'SUCCESS' } as never);
    mockedListSteps.mockResolvedValue([{ nodeId: NODE_ID, outputData: null }] as never);

    const { result } = renderHook(() => useTestNode(NODE_ID));
    await act(async () => {
      await result.current.run();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.result.error?.message).toBe('No output was captured for this node.');
    expect(updateNodeConfig).not.toHaveBeenCalled();
  });

  it('errors with the oversized message when the output exceeds the byte cap', async () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    const huge = { blob: 'x'.repeat(40000) };
    mockedTestNode.mockResolvedValue({ id: 'exec-4', status: 'PENDING' } as never);
    mockedGetExecution.mockResolvedValue({ id: 'exec-4', status: 'SUCCESS' } as never);
    mockedListSteps.mockResolvedValue([{ nodeId: NODE_ID, outputData: huge }] as never);

    const { result } = renderHook(() => useTestNode(NODE_ID));
    await act(async () => {
      await result.current.run();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.result.error?.message).toBe(
      'Output is too large to capture as a sample.',
    );
    expect(updateNodeConfig).not.toHaveBeenCalled();
  });

  it('canRun is false when the workflow id is missing', () => {
    useEditorStore.setState({ workflowId: null });
    const { result } = renderHook(() => useTestNode(NODE_ID));
    expect(result.current.canRun).toBe(false);
  });

  it('canRun is false and blockedReason set when the node has an invalid pill token', () => {
    useEditorStore.setState({
      workflowId: 'wf-1',
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
    const { result } = renderHook(() => useTestNode(NODE_ID));
    expect(result.current.canRun).toBe(false);
    expect(result.current.blockedReason).toBe('Fix the red data pills on this node first.');
  });

  it('reset() returns to idle and clears the result', async () => {
    mockedTestNode.mockResolvedValue({ id: 'exec-5', status: 'PENDING' } as never);
    mockedGetExecution.mockResolvedValue({ id: 'exec-5', status: 'SUCCESS' } as never);
    mockedListSteps.mockResolvedValue([{ nodeId: NODE_ID, outputData: { ok: true } }] as never);

    const { result } = renderHook(() => useTestNode(NODE_ID));
    await act(async () => {
      await result.current.run();
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.result.output).toBeNull();
    expect(result.current.result.error).toBeNull();
  });
});
