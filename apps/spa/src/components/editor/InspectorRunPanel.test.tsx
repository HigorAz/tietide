import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Node } from 'reactflow';
import { NodeType } from '@tietide/shared';
import { InspectorRunPanel } from './InspectorRunPanel';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import {
  initialExecutionLiveState,
  useExecutionLiveStore,
  type NodeRunState,
} from '@/stores/executionLiveStore';
import type { CustomNodeData } from './nodes/CustomNode.types';

const editorNode = (id: string, label: string, alias?: string): Node<CustomNodeData> => ({
  id,
  type: 'custom',
  position: { x: 0, y: 0 },
  data: { label, nodeType: NodeType.HTTP_REQUEST, ...(alias ? { alias } : {}) },
});

const runState = (overrides: Partial<NodeRunState> = {}): NodeRunState => ({
  status: 'success',
  nodeType: 'http-request',
  startedAt: '2026-05-06T10:00:00.000Z',
  finishedAt: '2026-05-06T10:00:01.000Z',
  durationMs: 1000,
  input: null,
  output: null,
  error: null,
  ...overrides,
});

describe('InspectorRunPanel', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    useExecutionLiveStore.setState({ ...initialExecutionLiveState, nodes: new Map() });
  });

  it('should render an empty state when no nodes have run yet', () => {
    render(<InspectorRunPanel />);
    expect(screen.getByTestId('inspector-run-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('inspector-run-panel')).not.toBeInTheDocument();
  });

  it('should list one tab per node from the live store, labelled from the editor store', () => {
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('node-a', 'Fetch'), editorNode('node-b', 'Save')],
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([
        ['node-a', runState({ startedAt: '2026-05-06T10:00:00.000Z' })],
        ['node-b', runState({ startedAt: '2026-05-06T10:00:01.000Z' })],
      ]),
    });

    render(<InspectorRunPanel />);
    expect(screen.getByTestId('run-node-tab-node-a')).toHaveTextContent('Fetch');
    expect(screen.getByTestId('run-node-tab-node-b')).toHaveTextContent('Save');
  });

  it('should sort tabs by startedAt ascending', () => {
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('a', 'A'), editorNode('b', 'B')],
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([
        ['a', runState({ startedAt: '2026-05-06T10:00:02.000Z' })],
        ['b', runState({ startedAt: '2026-05-06T10:00:01.000Z' })],
      ]),
    });

    render(<InspectorRunPanel />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('data-testid', 'run-node-tab-b');
    expect(tabs[1]).toHaveAttribute('data-testid', 'run-node-tab-a');
  });

  it('should show input and output data for the first selected node', () => {
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('node-a', 'Fetch')],
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([
        [
          'node-a',
          runState({
            input: { url: 'https://example.com' },
            output: { ok: true, status: 200 },
          }),
        ],
      ]),
    });

    render(<InspectorRunPanel />);
    expect(screen.getByTestId('run-node-input')).toHaveTextContent('https://example.com');
    expect(screen.getByTestId('run-node-output')).toHaveTextContent('200');
  });

  it('should switch detail view when a different node tab is selected', async () => {
    const user = userEvent.setup();
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('a', 'A'), editorNode('b', 'B')],
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([
        ['a', runState({ output: { from: 'a' }, startedAt: '2026-05-06T10:00:00.000Z' })],
        ['b', runState({ output: { from: 'b' }, startedAt: '2026-05-06T10:00:01.000Z' })],
      ]),
    });

    render(<InspectorRunPanel />);
    expect(screen.getByTestId('run-node-output')).toHaveTextContent('a');

    await user.click(screen.getByTestId('run-node-tab-b'));
    expect(screen.getByTestId('run-node-output')).toHaveTextContent('b');
  });

  it('should render the ErrorCard only when state.error is set', () => {
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('node-a', 'Fetch')],
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([
        ['node-a', runState({ status: 'failed', error: { message: 'boom', code: 'E_BOOM' } })],
      ]),
    });

    render(<InspectorRunPanel />);
    const errorBlock = screen.getByTestId('run-node-error');
    expect(errorBlock).toHaveTextContent('boom');
    expect(errorBlock).toHaveTextContent('E_BOOM');
    expect(errorBlock).toHaveTextContent(/node failed/i);
  });

  it('should not render the ErrorCard when there is no error', () => {
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('node-a', 'Fetch')],
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([['node-a', runState({ output: { ok: true } })]]),
    });
    render(<InspectorRunPanel />);
    expect(screen.queryByTestId('run-node-error')).not.toBeInTheDocument();
  });

  it('should select the node and switch to configure when Fix in Configure is clicked', async () => {
    const user = userEvent.setup();
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('node-a', 'Fetch')],
      viewMode: 'result',
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([
        ['node-a', runState({ status: 'failed', error: { message: 'boom', code: null } })],
      ]),
    });

    render(<InspectorRunPanel />);
    await user.click(screen.getByRole('button', { name: /fix in configure/i }));
    expect(useEditorStore.getState().selectedNodeId).toBe('node-a');
    expect(useEditorStore.getState().viewMode).toBe('configure');
  });

  it('should render a copy-json button on BOTH the Input and Output panes', () => {
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('node-a', 'Fetch')],
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([['node-a', runState({ input: { x: 1 }, output: { y: 2 } })]]),
    });

    render(<InspectorRunPanel />);
    const inputPane = screen.getByTestId('run-node-input-pane');
    const outputPane = screen.getByTestId('run-node-output-pane');
    expect(within(inputPane).getByRole('button', { name: /copy json/i })).toBeInTheDocument();
    expect(within(outputPane).getByRole('button', { name: /copy json/i })).toBeInTheDocument();
  });

  it('should not throw when the clipboard API rejects', async () => {
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('node-a', 'Fetch')],
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([['node-a', runState({ input: { x: 1 } })]]),
    });

    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<InspectorRunPanel />);
    const inputPane = screen.getByTestId('run-node-input-pane');
    await expect(
      user.click(within(inputPane).getByRole('button', { name: /copy json/i })),
    ).resolves.not.toThrow();
  });

  it('should display a node id as fallback label when editor has no entry', () => {
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([['orphan-1', runState()]]),
    });

    render(<InspectorRunPanel />);
    expect(screen.getByTestId('run-node-tab-orphan-1')).toHaveTextContent('orphan-1');
  });

  describe('iterator iterations view', () => {
    it('should render the iterations list when the selected node has iterations', () => {
      useEditorStore.setState({
        ...initialEditorState,
        nodes: [editorNode('iter-1', 'Loop')],
      });
      useExecutionLiveStore.setState({
        ...initialExecutionLiveState,
        nodes: new Map([
          [
            'iter-1',
            runState({
              status: 'success',
              iterations: [
                {
                  index: 0,
                  total: 2,
                  childExecutionId: 'child-1',
                  status: 'success',
                  durationMs: 12,
                  error: null,
                },
                {
                  index: 1,
                  total: 2,
                  childExecutionId: 'child-2',
                  status: 'failed',
                  durationMs: 9,
                  error: { message: 'boom', code: null },
                },
              ],
            }),
          ],
        ]),
      });

      render(<InspectorRunPanel />);
      expect(screen.getByTestId('run-node-iterations')).toBeInTheDocument();
      expect(screen.getByTestId('run-iteration-0')).toHaveAttribute('data-status', 'success');
      expect(screen.getByTestId('run-iteration-1')).toHaveAttribute('data-status', 'failed');
    });

    it('should not render the iterations block for non-iterator nodes (no iterations field)', () => {
      useEditorStore.setState({
        ...initialEditorState,
        nodes: [editorNode('http-1', 'Fetch')],
      });
      useExecutionLiveStore.setState({
        ...initialExecutionLiveState,
        nodes: new Map([['http-1', runState()]]),
      });

      render(<InspectorRunPanel />);
      expect(screen.queryByTestId('run-node-iterations')).not.toBeInTheDocument();
    });
  });
});
