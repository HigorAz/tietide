import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NodeType } from '@tietide/shared';
import { NodeHeaderEditable } from './NodeHeaderEditable';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';

const seedNode = (overrides?: { label?: string; description?: string }): string => {
  useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
  const id = useEditorStore.getState().nodes[0].id;
  useEditorStore.setState((s) => ({
    nodes: s.nodes.map((n) =>
      n.id === id
        ? {
            ...n,
            data: {
              ...n.data,
              label: overrides?.label ?? n.data.label,
              description: overrides?.description ?? n.data.description,
            },
          }
        : n,
    ),
    isDirty: false,
    past: [],
    future: [],
  }));
  return id;
};

const renderHeader = (id: string) => {
  const node = useEditorStore.getState().nodes.find((n) => n.id === id)!;
  return render(
    <NodeHeaderEditable
      nodeId={id}
      label={node.data.label}
      description={node.data.description ?? ''}
      descriptionPlaceholder="catalog default"
    />,
  );
};

describe('NodeHeaderEditable', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the title and description', () => {
    const id = seedNode({ label: 'My Call', description: 'Does a thing' });
    renderHeader(id);
    expect(screen.getByTestId('node-header-title')).toHaveTextContent('My Call');
    expect(screen.getByTestId('node-header-description')).toHaveTextContent('Does a thing');
  });

  it('renames the node on title edit + Enter', () => {
    const id = seedNode({ label: 'Old name' });
    renderHeader(id);
    fireEvent.click(screen.getByTestId('node-header-title'));
    const input = screen.getByTestId('node-header-title-input');
    fireEvent.change(input, { target: { value: 'Fetch orders' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useEditorStore.getState().nodes.find((n) => n.id === id)!.data.label).toBe(
      'Fetch orders',
    );
  });

  it('cancels a title edit on Escape without changing the label', () => {
    const id = seedNode({ label: 'Keep me' });
    renderHeader(id);
    fireEvent.click(screen.getByTestId('node-header-title'));
    const input = screen.getByTestId('node-header-title-input');
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useEditorStore.getState().nodes.find((n) => n.id === id)!.data.label).toBe('Keep me');
  });

  it('edits the description on click + Enter', () => {
    const id = seedNode({ description: 'before' });
    renderHeader(id);
    fireEvent.click(screen.getByTestId('node-header-description'));
    const input = screen.getByTestId('node-header-description-input');
    fireEvent.change(input, { target: { value: 'Nightly report' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useEditorStore.getState().nodes.find((n) => n.id === id)!.data.description).toBe(
      'Nightly report',
    );
  });

  it('auto-enters title edit mode when pendingHeaderEdit fires', () => {
    const id = seedNode();
    renderHeader(id);
    expect(screen.queryByTestId('node-header-title-input')).toBeNull();
    act(() => {
      useEditorStore.getState().beginNodeRename(id);
    });
    expect(screen.getByTestId('node-header-title-input')).toBeInTheDocument();
    expect(useEditorStore.getState().pendingHeaderEdit).toBeNull();
  });
});
