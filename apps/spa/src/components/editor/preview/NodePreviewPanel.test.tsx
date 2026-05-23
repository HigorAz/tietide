import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NodeType } from '@tietide/shared';
import type { Node } from 'reactflow';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import {
  initialExecutionLiveState,
  useExecutionLiveStore,
  type NodeRunState,
} from '@/stores/executionLiveStore';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import { NodePreviewPanel } from './NodePreviewPanel';

const triggerNode = (config: Record<string, unknown> = {}): Node<CustomNodeData> => ({
  id: 'trigger',
  type: 'custom',
  position: { x: 0, y: 0 },
  data: {
    label: 'Manual',
    description: '',
    nodeType: NodeType.MANUAL_TRIGGER,
    status: 'idle',
    config,
  },
});

const httpNode = (config: Record<string, unknown> = {}): Node<CustomNodeData> => ({
  id: 'http',
  type: 'custom',
  position: { x: 0, y: 0 },
  data: {
    label: 'HTTP',
    description: '',
    nodeType: NodeType.HTTP_REQUEST,
    status: 'idle',
    config,
  },
});

const runState = (output: unknown): NodeRunState => ({
  status: 'success',
  nodeType: null,
  startedAt: '2026-05-23T12:00:00.000Z',
  finishedAt: '2026-05-23T12:00:01.000Z',
  durationMs: 1000,
  input: null,
  output,
  error: null,
});

const seed = (config: Record<string, unknown>, live?: Map<string, NodeRunState>): void => {
  useEditorStore.setState({
    ...initialEditorState,
    nodes: [triggerNode(), httpNode(config)],
    edges: [{ id: 'e1', source: 'trigger', target: 'http' }],
    selectedNodeId: 'http',
  });
  useExecutionLiveStore.setState({
    ...initialExecutionLiveState,
    nodes: live ?? new Map(),
  });
};

describe('NodePreviewPanel', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    useExecutionLiveStore.setState({ ...initialExecutionLiveState, nodes: new Map() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render a collapsed toggle by default', () => {
    seed({ url: 'https://api.example.com' });
    render(<NodePreviewPanel nodeId="http" />);

    expect(screen.getByTestId('node-preview-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('node-preview-output')).not.toBeInTheDocument();
  });

  it('should expand the preview when the toggle is clicked', () => {
    vi.useFakeTimers();
    seed({ url: 'https://api.example.com' });
    render(<NodePreviewPanel nodeId="http" />);

    fireEvent.click(screen.getByTestId('node-preview-toggle'));
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByTestId('node-preview-output')).toBeInTheDocument();
  });

  it('should render the config unchanged when there are no templates', () => {
    vi.useFakeTimers();
    seed({ url: 'https://api.example.com', method: 'GET' });
    render(<NodePreviewPanel nodeId="http" />);

    fireEvent.click(screen.getByTestId('node-preview-toggle'));
    act(() => {
      vi.advanceTimersByTime(250);
    });

    const output = screen.getByTestId('node-preview-output');
    expect(output.textContent).toContain('https://api.example.com');
    expect(output.textContent).toContain('GET');
  });

  it('should resolve a template against the upstream live output', () => {
    vi.useFakeTimers();
    const live = new Map<string, NodeRunState>();
    live.set('trigger', runState({ triggeredBy: 'live@example.com' }));
    seed({ url: 'https://api/{{trigger.triggeredBy}}' }, live);
    render(<NodePreviewPanel nodeId="http" />);

    fireEvent.click(screen.getByTestId('node-preview-toggle'));
    act(() => {
      vi.advanceTimersByTime(250);
    });

    const output = screen.getByTestId('node-preview-output');
    expect(output.textContent).toContain('https://api/live@example.com');
  });

  it('should fall back to the curated example when the upstream has no live output', () => {
    vi.useFakeTimers();
    // Manual trigger example has triggeredBy = 'user@example.com'
    seed({ to: '{{trigger.triggeredBy}}' });
    render(<NodePreviewPanel nodeId="http" />);

    fireEvent.click(screen.getByTestId('node-preview-toggle'));
    act(() => {
      vi.advanceTimersByTime(250);
    });

    const output = screen.getByTestId('node-preview-output');
    expect(output.textContent).toContain('user@example.com');
  });

  it('should render an inline error for a missing template path', () => {
    vi.useFakeTimers();
    seed({ url: '{{ghost.field}}' });
    render(<NodePreviewPanel nodeId="http" />);

    fireEvent.click(screen.getByTestId('node-preview-toggle'));
    act(() => {
      vi.advanceTimersByTime(250);
    });

    const error = screen.getByTestId('node-preview-error');
    expect(error.textContent).toContain('ghost.field');
    expect(screen.queryByTestId('node-preview-output')).not.toBeInTheDocument();
  });

  it('should debounce rapid config changes into a single resolution', () => {
    vi.useFakeTimers();
    seed({ url: 'a' });
    const { rerender } = render(<NodePreviewPanel nodeId="http" />);
    fireEvent.click(screen.getByTestId('node-preview-toggle'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByTestId('node-preview-output').textContent).toContain('"a"');

    // Rapid edits within the debounce window
    act(() => {
      useEditorStore.getState().updateNodeConfig('http', { url: 'b' });
    });
    rerender(<NodePreviewPanel nodeId="http" />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      useEditorStore.getState().updateNodeConfig('http', { url: 'c' });
    });
    rerender(<NodePreviewPanel nodeId="http" />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Not yet — only 100ms since last edit
    expect(screen.getByTestId('node-preview-output').textContent).toContain('"a"');

    act(() => {
      vi.advanceTimersByTime(150);
    });
    // Now coalesced — final value 'c' renders, intermediate 'b' was discarded
    expect(screen.getByTestId('node-preview-output').textContent).toContain('"c"');
    expect(screen.getByTestId('node-preview-output').textContent).not.toContain('"b"');
  });
});
