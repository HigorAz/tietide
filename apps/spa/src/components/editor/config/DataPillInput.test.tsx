import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within, act } from '@testing-library/react';
import type { Edge, Node } from 'reactflow';
import { NodeType } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import { DataPillInput } from './DataPillInput';

const TARGET_ID = 'http-2';

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

const seedGraph = (): { nodes: Node<CustomNodeData>[]; edges: Edge[] } => ({
  nodes: [
    mkNode('http-1', NodeType.HTTP_REQUEST, 'First HTTP'),
    mkNode(TARGET_ID, NodeType.HTTP_REQUEST, 'Second HTTP'),
  ],
  edges: [mkEdge('http-1', TARGET_ID)],
});

describe('DataPillInput', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the controlled value via the underlying input', () => {
    render(<DataPillInput nodeId={TARGET_ID} value="hello" onChange={() => {}} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  it('renders {{nodeId.path}} tokens as styled chips in the overlay', () => {
    const { nodes, edges } = seedGraph();
    useEditorStore.setState({ nodes, edges });
    render(
      <DataPillInput
        nodeId={TARGET_ID}
        value="prefix {{http-1.statusCode}} suffix"
        onChange={() => {}}
      />,
    );
    const chips = screen.getAllByTestId('data-pill-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toBe('{{http-1.statusCode}}');
  });

  it('treats manual typing of {{...}} as equivalent state (chip rendered after onChange)', () => {
    const { nodes, edges } = seedGraph();
    useEditorStore.setState({ nodes, edges });

    let value = '';
    const onChange = vi.fn((next: string) => {
      value = next;
    });

    const { rerender } = render(
      <DataPillInput nodeId={TARGET_ID} value={value} onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '{{http-1.statusCode}}' },
    });
    rerender(<DataPillInput nodeId={TARGET_ID} value={value} onChange={onChange} />);

    expect(onChange).toHaveBeenCalledWith('{{http-1.statusCode}}');
    expect(screen.getByTestId('data-pill-chip').textContent).toBe('{{http-1.statusCode}}');
  });

  it('opens the autocomplete listbox after the user types `{{`', () => {
    const { nodes, edges } = seedGraph();
    useEditorStore.setState({ nodes, edges });

    const onChange = vi.fn();
    render(<DataPillInput nodeId={TARGET_ID} value="" onChange={onChange} />);
    const input = screen.getByRole('combobox');

    expect(screen.queryByTestId('data-pill-listbox')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '{{' } });

    expect(screen.getByTestId('data-pill-listbox')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not open the listbox after a single `{` (only after the second one)', () => {
    const { nodes, edges } = seedGraph();
    useEditorStore.setState({ nodes, edges });
    render(<DataPillInput nodeId={TARGET_ID} value="" onChange={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '{' } });
    expect(screen.queryByTestId('data-pill-listbox')).not.toBeInTheDocument();
  });

  it('lists only upstream nodes (not the target itself, not unrelated nodes)', () => {
    const nodes: Node<CustomNodeData>[] = [
      mkNode('upstream', NodeType.HTTP_REQUEST, 'Upstream'),
      mkNode(TARGET_ID, NodeType.HTTP_REQUEST, 'Target'),
      mkNode('unrelated', NodeType.HTTP_REQUEST, 'Unrelated'),
    ];
    const edges = [mkEdge('upstream', TARGET_ID)];
    useEditorStore.setState({ nodes, edges });

    render(<DataPillInput nodeId={TARGET_ID} value="" onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '{{' } });

    const listbox = screen.getByTestId('data-pill-listbox');
    const items = within(listbox).getAllByRole('option');
    const allText = items.map((i) => i.textContent ?? '').join(' ');
    // The dropdown now shows the node's friendly label, not its raw id.
    expect(allText).toContain('Upstream');
    expect(allText).not.toContain('Unrelated');
    expect(allText).not.toContain(TARGET_ID);
  });

  it('inserts the selected token on ArrowDown + Enter and renders it as a chip', () => {
    const { nodes, edges } = seedGraph();
    useEditorStore.setState({ nodes, edges });

    let value = '';
    const onChange = vi.fn((next: string) => {
      value = next;
    });

    const { rerender } = render(
      <DataPillInput nodeId={TARGET_ID} value={value} onChange={onChange} />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '{{' } });
    rerender(<DataPillInput nodeId={TARGET_ID} value={value} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0] as string;
    expect(last.startsWith('{{')).toBe(true);
    expect(last.endsWith('}}')).toBe(true);
    // 'First HTTP' is a non-trigger action → alias slug 'first_http'.
    expect(last).toMatch(/\{\{steps\.first_http\.[^}]+\}\}/);
  });

  it('renders a reference to a missing node as an invalid (red) chip', () => {
    const token = '{{steps.ghost.statusCode}}';
    // The token must live in the node's stored config — that's what the
    // reference validator inspects to decide which pills are broken.
    useEditorStore.setState({
      nodes: [
        mkNode('http-1', NodeType.HTTP_REQUEST, 'First HTTP'),
        {
          ...mkNode(TARGET_ID, NodeType.HTTP_REQUEST, 'Second HTTP'),
          data: {
            label: 'Second HTTP',
            nodeType: NodeType.HTTP_REQUEST,
            config: { url: token },
          },
        },
      ],
      edges: [mkEdge('http-1', TARGET_ID)],
    });
    render(<DataPillInput nodeId={TARGET_ID} value={`x ${token} y`} onChange={() => {}} />);
    expect(screen.getByTestId('data-pill-invalid')).toBeInTheDocument();
    expect(screen.queryByTestId('data-pill-chip')).not.toBeInTheDocument();
  });

  it('renders a multi-line textarea by default with a resize grip', () => {
    render(<DataPillInput nodeId={TARGET_ID} value="some long value" onChange={vi.fn()} />);
    const field = screen.getByRole('combobox') as HTMLTextAreaElement;
    expect(field.tagName).toBe('TEXTAREA');
    expect(field.style.height).toBe('80px');
    expect(screen.getByTestId('data-pill-resize')).toBeInTheDocument();
  });

  it('closes the autocomplete on Escape without inserting', () => {
    const { nodes, edges } = seedGraph();
    useEditorStore.setState({ nodes, edges });

    const onChange = vi.fn();
    render(<DataPillInput nodeId={TARGET_ID} value="" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '{{' } });
    expect(screen.getByTestId('data-pill-listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByTestId('data-pill-listbox')).not.toBeInTheDocument();
    // onChange was called once for the initial change, not for any insertion afterwards
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('closes the autocomplete on click outside', () => {
    const { nodes, edges } = seedGraph();
    useEditorStore.setState({ nodes, edges });

    render(
      <div>
        <button data-testid="outside">outside</button>
        <DataPillInput nodeId={TARGET_ID} value="" onChange={vi.fn()} />
      </div>,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '{{' } });
    expect(screen.getByTestId('data-pill-listbox')).toBeInTheDocument();

    act(() => {
      fireEvent.mouseDown(screen.getByTestId('outside'));
    });

    expect(screen.queryByTestId('data-pill-listbox')).not.toBeInTheDocument();
  });

  it('shows the placeholder when value is empty', () => {
    render(
      <DataPillInput nodeId={TARGET_ID} value="" onChange={vi.fn()} placeholder="Enter a URL" />,
    );
    // Placeholder must be visible inside the overlay (input is text-transparent so its own placeholder would be hidden)
    expect(screen.getByText('Enter a URL')).toBeInTheDocument();
  });

  it('registers the active pill field on focus and clears it on blur', () => {
    render(<DataPillInput nodeId={TARGET_ID} value="" onChange={vi.fn()} />);
    const input = screen.getByRole('combobox');

    expect(useEditorStore.getState().activePillField).toBeNull();

    fireEvent.focus(input);
    expect(useEditorStore.getState().activePillField?.nodeId).toBe(TARGET_ID);
    expect(typeof useEditorStore.getState().activePillField?.insert).toBe('function');

    fireEvent.blur(input);
    expect(useEditorStore.getState().activePillField).toBeNull();
  });

  it('inserts a token at the caret via the registered insert callback (picker path)', () => {
    let value = 'hi ';
    const onChange = vi.fn((next: string) => {
      value = next;
    });
    render(<DataPillInput nodeId={TARGET_ID} value={value} onChange={onChange} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.focus(input);
    input.setSelectionRange(3, 3);

    // Simulate the picker invoking the registered inserter.
    act(() => {
      useEditorStore.getState().activePillField?.insert('{{http-1.statusCode}}');
    });

    expect(onChange).toHaveBeenCalledWith('hi {{http-1.statusCode}}');
  });
});
