import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Edge, Node } from 'reactflow';
import { NodeType, PILL_SAMPLE_KEY } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { useEnvVarsStore } from '@/stores/envVarsStore';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import { DataPillPicker } from './DataPillPicker';

vi.mock('@/hooks/useMediaQuery', () => ({ useIsMobile: vi.fn(() => false) }));
// Stub the env-vars API so the picker's lazy load() never hits the network.
vi.mock('@/api/envVars', () => ({
  listUserEnvVars: vi.fn(async () => []),
  listAdminEnvVars: vi.fn(async () => []),
}));
import { useIsMobile } from '@/hooks/useMediaQuery';
const mockUseIsMobile = vi.mocked(useIsMobile);

const mkNode = (id: string, nodeType: NodeType, label = id): Node<CustomNodeData> => ({
  id,
  type: 'custom',
  position: { x: 0, y: 0 },
  data: { label, nodeType },
});

const mkEdge = (source: string, target: string): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
});

const seed = (): void => {
  useEditorStore.setState({
    nodes: [
      mkNode('A', NodeType.HTTP_REQUEST, 'First HTTP'),
      mkNode('B', NodeType.HTTP_REQUEST, 'Second HTTP'),
    ],
    edges: [mkEdge('A', 'B')],
  });
};

describe('DataPillPicker', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    // Mark the env store 'ready' (empty) so load() short-circuits and no env
    // section renders unless a test opts in by seeding keys.
    useEnvVarsStore.setState({ keys: [], status: 'ready', error: null });
    mockUseIsMobile.mockReturnValue(false);
  });

  it('renders nothing when no field is focused', () => {
    seed();
    const { container } = render(<DataPillPicker />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists upstream node output paths for the focused field', () => {
    seed();
    useEditorStore.setState({ activePillField: { nodeId: 'B', insert: vi.fn() } });
    render(<DataPillPicker />);

    const listbox = screen.getByTestId('data-pill-picker');
    const options = within(listbox).getAllByTestId('data-pill-picker-option');
    const text = options.map((o) => o.textContent ?? '').join(' ');
    // A is an http-request upstream of B → its fields appear as humanized pills
    // under A's group; B (the target) is not listed.
    expect(text).toContain('Status Code');
    expect(screen.getByText('First HTTP')).toBeInTheDocument();
    expect(screen.queryByText('Second HTTP')).not.toBeInTheDocument();
  });

  it('inserts the chosen token via the focused field inserter on mousedown', () => {
    seed();
    const insert = vi.fn();
    useEditorStore.setState({ activePillField: { nodeId: 'B', insert } });
    render(<DataPillPicker />);

    const option = screen
      .getAllByTestId('data-pill-picker-option')
      .find((o) => o.textContent?.includes('Status Code'));
    expect(option).toBeDefined();
    fireEvent.mouseDown(option!);

    // A ('First HTTP') is a non-trigger action → alias slug 'first_http'.
    expect(insert).toHaveBeenCalledWith('{{steps.first_http.statusCode}}');
  });

  it('prevents default on mousedown so the focused input does not blur', () => {
    seed();
    useEditorStore.setState({ activePillField: { nodeId: 'B', insert: vi.fn() } });
    render(<DataPillPicker />);

    const option = screen.getAllByTestId('data-pill-picker-option')[0];
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    fireEvent(option, event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows an empty state when there are no upstream nodes', () => {
    useEditorStore.setState({
      nodes: [mkNode('solo', NodeType.HTTP_REQUEST)],
      edges: [],
      activePillField: { nodeId: 'solo', insert: vi.fn() },
    });
    render(<DataPillPicker />);
    expect(screen.getByText(/no upstream outputs/i)).toBeInTheDocument();
  });

  const pickerText = (): string =>
    within(screen.getByTestId('data-pill-picker'))
      .getAllByTestId('data-pill-picker-option')
      .map((o) => o.textContent ?? '')
      .join(' ');

  it('uses a declared __pillSample as the highest-priority pill source', () => {
    useEditorStore.setState({
      nodes: [
        {
          ...mkNode('A', NodeType.HTTP_REQUEST, 'First HTTP'),
          data: {
            label: 'First HTTP',
            nodeType: NodeType.HTTP_REQUEST,
            config: { [PILL_SAMPLE_KEY]: JSON.stringify({ customField: 'x' }) },
          },
        },
        mkNode('B', NodeType.HTTP_REQUEST, 'Second HTTP'),
      ],
      edges: [mkEdge('A', 'B')],
      activePillField: { nodeId: 'B', insert: vi.fn() },
    });
    render(<DataPillPicker />);

    const text = pickerText();
    // The declared sample overrides the concrete http-request schema entirely.
    expect(text).toContain('Custom Field');
    expect(text).not.toContain('Status Code');
  });

  it('ignores an invalid __pillSample and falls back to the node schema', () => {
    useEditorStore.setState({
      nodes: [
        {
          ...mkNode('A', NodeType.HTTP_REQUEST, 'First HTTP'),
          data: {
            label: 'First HTTP',
            nodeType: NodeType.HTTP_REQUEST,
            config: { [PILL_SAMPLE_KEY]: '{not valid json' },
          },
        },
        mkNode('B', NodeType.HTTP_REQUEST, 'Second HTTP'),
      ],
      edges: [mkEdge('A', 'B')],
      activePillField: { nodeId: 'B', insert: vi.fn() },
    });
    render(<DataPillPicker />);

    expect(pickerText()).toContain('Status Code');
  });

  it('renders an Environment variables block from the env store', () => {
    useEnvVarsStore.setState({ keys: ['API_KEY', 'WEBHOOK_SECRET'], status: 'ready', error: null });
    useEditorStore.setState({
      nodes: [mkNode('solo', NodeType.HTTP_REQUEST)],
      edges: [],
      activePillField: { nodeId: 'solo', insert: vi.fn() },
    });
    render(<DataPillPicker />);

    const envGroup = screen.getByTestId('data-pill-env-group');
    expect(within(envGroup).getByText('Environment variables')).toBeInTheDocument();
    const options = within(envGroup).getAllByTestId('data-pill-env-option');
    expect(options.map((o) => o.textContent ?? '').join(' ')).toContain('API_KEY');
    // No upstream nodes, but env vars exist → the empty state is suppressed.
    expect(screen.queryByText(/no upstream outputs/i)).not.toBeInTheDocument();
  });

  it('inserts a single UPPER_SNAKE token for an env var', () => {
    useEnvVarsStore.setState({ keys: ['API_KEY'], status: 'ready', error: null });
    const insert = vi.fn();
    useEditorStore.setState({
      nodes: [mkNode('solo', NodeType.HTTP_REQUEST)],
      edges: [],
      activePillField: { nodeId: 'solo', insert },
    });
    render(<DataPillPicker />);

    fireEvent.mouseDown(screen.getByTestId('data-pill-env-option'));
    expect(insert).toHaveBeenCalledWith('{{API_KEY}}');
  });

  it('renders as a bottom sheet on mobile', () => {
    seed();
    mockUseIsMobile.mockReturnValue(true);
    useEditorStore.setState({ activePillField: { nodeId: 'B', insert: vi.fn() } });
    render(<DataPillPicker />);
    expect(screen.getByTestId('data-pill-picker-sheet')).toBeInTheDocument();
    expect(screen.queryByTestId('data-pill-picker')).not.toBeInTheDocument();
  });
});
