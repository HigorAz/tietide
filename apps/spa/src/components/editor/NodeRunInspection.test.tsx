import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Node } from 'reactflow';
import { NodeType, TRIGGER_ALIAS } from '@tietide/shared';
import { NodeRunInspection } from './NodeRunInspection';
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

describe('NodeRunInspection', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    useExecutionLiveStore.setState({ ...initialExecutionLiveState, nodes: new Map() });
  });

  it('should show the empty state when the node was not executed in this run', () => {
    render(<NodeRunInspection nodeId="node-a" config={{}} />);
    expect(screen.getByTestId('node-run-inspection')).toHaveTextContent(
      'This node was not executed in this run.',
    );
  });

  it('should still render a Configuration section with a copy-json button when not executed', () => {
    render(<NodeRunInspection nodeId="node-a" config={{ url: 'https://x' }} />);
    const cfg = screen.getByTestId('run-section-card-configuration');
    // Configuration is collapsed by default — its copy button lives in the header.
    expect(within(cfg).getByRole('button', { name: /copy json/i })).toBeInTheDocument();
  });

  it('should render Configuration collapsed and Input/Output open by default', () => {
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([['node-a', runState({ input: { url: 'https://x' }, output: { ok: true } })]]),
    });
    render(<NodeRunInspection nodeId="node-a" config={{ url: 'https://x' }} />);
    // Configuration collapsed → its ConfigFieldList body is not rendered.
    expect(screen.queryByTestId('config-field-list')).not.toBeInTheDocument();
    // Input + Output viewers visible by default.
    expect(screen.getByTestId('node-run-input')).toBeInTheDocument();
    expect(screen.getByTestId('node-run-output')).toBeInTheDocument();
  });

  it('should render Error before Output for a failed step', () => {
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([
        [
          'node-a',
          runState({
            status: 'failed',
            output: null,
            error: { message: 'boom', code: 'E_BOOM' },
          }),
        ],
      ]),
    });
    render(<NodeRunInspection nodeId="node-a" config={{}} />);
    const errorCard = screen.getByTestId('run-section-card-error');
    const outputCard = screen.getByTestId('run-section-card-output');
    // Error precedes Output in the DOM.
    expect(errorCard.compareDocumentPosition(outputCard)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('should show the failed-output message when status is failed and output is null', () => {
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([
        [
          'node-a',
          runState({ status: 'failed', output: null, error: { message: 'x', code: null } }),
        ],
      ]),
    });
    render(<NodeRunInspection nodeId="node-a" config={{}} />);
    expect(screen.getByTestId('node-run-inspection')).toHaveTextContent(
      'No output — the node failed before producing data.',
    );
  });

  it('should set viewMode to configure when Fix in Configure is clicked', async () => {
    const user = userEvent.setup();
    useEditorStore.setState({ ...initialEditorState, viewMode: 'result' });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([
        [
          'node-a',
          runState({
            status: 'failed',
            output: null,
            error: { message: 'boom', code: null },
          }),
        ],
      ]),
    });
    render(<NodeRunInspection nodeId="node-a" config={{}} />);
    await user.click(screen.getByRole('button', { name: /fix in configure/i }));
    expect(useEditorStore.getState().viewMode).toBe('configure');
  });

  it('should carry a copy-json header button on BOTH Input and Output sections', () => {
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([['node-a', runState({ input: { a: 1 }, output: { b: 2 } })]]),
    });
    render(<NodeRunInspection nodeId="node-a" config={{}} />);
    const inputCard = screen.getByTestId('run-section-card-input');
    const outputCard = screen.getByTestId('run-section-card-output');
    expect(within(inputCard).getByRole('button', { name: /copy json/i })).toBeInTheDocument();
    expect(within(outputCard).getByRole('button', { name: /copy json/i })).toBeInTheDocument();
  });

  it('should emit a steps.<alias> path copy from the Output tree for an aliased node', async () => {
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('node-a', 'Fetch', 'fetch')],
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([['node-a', runState({ output: { id: 'abc' } })]]),
    });
    const user = userEvent.setup();
    // MUST install the clipboard spy AFTER userEvent.setup() — setup installs its
    // own stub that would otherwise clobber ours (see JsonTree.test.tsx).
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<NodeRunInspection nodeId="node-a" config={{}} />);
    const outputCard = screen.getByTestId('run-section-card-output');
    // Hover the tree row to reveal the path-copy action, then click it.
    const pathButtons = within(outputCard).getAllByRole('button', { name: /copy path/i });
    await user.click(pathButtons[0]);
    expect(writeText).toHaveBeenCalled();
    expect(writeText.mock.calls[0][0]).toContain('{{steps.fetch');
  });

  it('should derive the trigger ref for a TRIGGER_ALIAS node', async () => {
    useEditorStore.setState({
      ...initialEditorState,
      nodes: [editorNode('node-a', 'Trigger', TRIGGER_ALIAS)],
    });
    useExecutionLiveStore.setState({
      ...initialExecutionLiveState,
      nodes: new Map([['node-a', runState({ output: { id: 'abc' } })]]),
    });
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<NodeRunInspection nodeId="node-a" config={{}} />);
    const outputCard = screen.getByTestId('run-section-card-output');
    const pathButtons = within(outputCard).getAllByRole('button', { name: /copy path/i });
    await user.click(pathButtons[0]);
    expect(writeText.mock.calls[0][0]).toContain(`{{${TRIGGER_ALIAS}`);
  });
});
