import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider, type NodeProps } from 'reactflow';
import { NodeType } from '@tietide/shared';
import { StickyNode } from './StickyNode';
import type { CustomNodeData } from './CustomNode.types';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';

type Props = Partial<NodeProps<CustomNodeData>> & { data: CustomNodeData };

const renderSticky = (props: Props) => {
  const merged: NodeProps<CustomNodeData> = {
    id: 'sticky-1',
    type: 'sticky',
    data: props.data,
    selected: props.selected ?? false,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    dragging: false,
    targetPosition: undefined,
    sourcePosition: undefined,
  };
  return render(
    <ReactFlowProvider>
      <StickyNode {...merged} />
    </ReactFlowProvider>,
  );
};

const baseData = (config: Record<string, unknown> = {}): CustomNodeData => ({
  label: 'Sticky Note',
  nodeType: NodeType.STICKY,
  status: 'idle',
  config: { text: '', color: 'yellow', width: 220, height: 140, ...config },
});

describe('StickyNode', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  describe('rendering', () => {
    it('should render the text from data.config.text', () => {
      renderSticky({ data: baseData({ text: 'Refactor this branch' }) });
      expect(screen.getByTestId('sticky-node')).toHaveTextContent('Refactor this branch');
    });

    it('should expose the color via a data-color attribute', () => {
      renderSticky({ data: baseData({ color: 'blue' }) });
      expect(screen.getByTestId('sticky-node')).toHaveAttribute('data-color', 'blue');
    });

    it.each(['yellow', 'pink', 'blue', 'green'] as const)('should accept color=%s', (color) => {
      renderSticky({ data: baseData({ color }) });
      expect(screen.getByTestId('sticky-node')).toHaveAttribute('data-color', color);
    });

    it('should fall back to defaults when config fields are missing', () => {
      renderSticky({
        data: { label: 'Sticky Note', nodeType: NodeType.STICKY, status: 'idle', config: {} },
      });
      expect(screen.getByTestId('sticky-node')).toHaveAttribute('data-color', 'yellow');
    });

    it('should not render any react-flow handles', () => {
      const { container } = renderSticky({ data: baseData() });
      expect(container.querySelectorAll('.react-flow__handle').length).toBe(0);
    });

    it('should apply width and height from config to the wrapper', () => {
      renderSticky({ data: baseData({ width: 300, height: 200 }) });
      const root = screen.getByTestId('sticky-node');
      expect(root).toHaveStyle({ width: '300px', height: '200px' });
    });
  });

  describe('edit mode', () => {
    it('should not show a textarea by default', () => {
      renderSticky({ data: baseData({ text: 'hello' }) });
      expect(screen.queryByTestId('sticky-node-textarea')).not.toBeInTheDocument();
    });

    it('should enter edit mode on double-click and show a focused textarea', async () => {
      renderSticky({ data: baseData({ text: 'hello' }) });
      const user = userEvent.setup();
      await user.dblClick(screen.getByTestId('sticky-node'));

      const textarea = screen.getByTestId('sticky-node-textarea') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();
      expect(textarea.value).toBe('hello');
      expect(document.activeElement).toBe(textarea);
    });

    it('should commit text via editorStore.updateNodeConfig on blur', async () => {
      const updateNodeConfig = vi.fn();
      useEditorStore.setState({ updateNodeConfig });

      renderSticky({ data: baseData({ text: 'old' }) });
      const user = userEvent.setup();
      await user.dblClick(screen.getByTestId('sticky-node'));

      const textarea = screen.getByTestId('sticky-node-textarea') as HTMLTextAreaElement;
      await user.clear(textarea);
      await user.type(textarea, 'new note');
      fireEvent.blur(textarea);

      expect(updateNodeConfig).toHaveBeenCalledWith('sticky-1', { text: 'new note' });
      expect(screen.queryByTestId('sticky-node-textarea')).not.toBeInTheDocument();
    });

    it('should commit text and exit edit mode when Enter is pressed', async () => {
      const updateNodeConfig = vi.fn();
      useEditorStore.setState({ updateNodeConfig });

      renderSticky({ data: baseData({ text: 'a' }) });
      const user = userEvent.setup();
      await user.dblClick(screen.getByTestId('sticky-node'));

      const textarea = screen.getByTestId('sticky-node-textarea') as HTMLTextAreaElement;
      await user.clear(textarea);
      await user.type(textarea, 'b');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(updateNodeConfig).toHaveBeenCalledWith('sticky-1', { text: 'b' });
      expect(screen.queryByTestId('sticky-node-textarea')).not.toBeInTheDocument();
    });

    it('should NOT commit on Shift+Enter (allows newline insertion)', async () => {
      const updateNodeConfig = vi.fn();
      useEditorStore.setState({ updateNodeConfig });

      renderSticky({ data: baseData({ text: 'a' }) });
      const user = userEvent.setup();
      await user.dblClick(screen.getByTestId('sticky-node'));

      const textarea = screen.getByTestId('sticky-node-textarea') as HTMLTextAreaElement;
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(updateNodeConfig).not.toHaveBeenCalled();
      expect(screen.getByTestId('sticky-node-textarea')).toBeInTheDocument();
    });

    it('should discard the draft and exit edit mode on Escape', async () => {
      const updateNodeConfig = vi.fn();
      useEditorStore.setState({ updateNodeConfig });

      renderSticky({ data: baseData({ text: 'original' }) });
      const user = userEvent.setup();
      await user.dblClick(screen.getByTestId('sticky-node'));

      const textarea = screen.getByTestId('sticky-node-textarea') as HTMLTextAreaElement;
      await user.clear(textarea);
      await user.type(textarea, 'changed');
      fireEvent.keyDown(textarea, { key: 'Escape' });

      expect(updateNodeConfig).not.toHaveBeenCalled();
      expect(screen.queryByTestId('sticky-node-textarea')).not.toBeInTheDocument();
      expect(screen.getByTestId('sticky-node')).toHaveTextContent('original');
    });
  });

  describe('color picker', () => {
    it('should not render the color picker when not selected', () => {
      renderSticky({ data: baseData(), selected: false });
      expect(screen.queryByTestId('sticky-node-color-picker')).not.toBeInTheDocument();
    });

    it('should render swatches for all four colors when selected', () => {
      renderSticky({ data: baseData(), selected: true });
      expect(screen.getByTestId('sticky-node-color-yellow')).toBeInTheDocument();
      expect(screen.getByTestId('sticky-node-color-pink')).toBeInTheDocument();
      expect(screen.getByTestId('sticky-node-color-blue')).toBeInTheDocument();
      expect(screen.getByTestId('sticky-node-color-green')).toBeInTheDocument();
    });

    it('should commit a color change via updateNodeConfig', async () => {
      const updateNodeConfig = vi.fn();
      useEditorStore.setState({ updateNodeConfig });

      renderSticky({ data: baseData({ color: 'yellow' }), selected: true });
      const user = userEvent.setup();
      await user.click(screen.getByTestId('sticky-node-color-pink'));

      expect(updateNodeConfig).toHaveBeenCalledWith('sticky-1', { color: 'pink' });
    });
  });

  describe('memoization', () => {
    it('should be wrapped in React.memo', () => {
      const memoSymbol = Symbol.for('react.memo');
      expect((StickyNode as unknown as { $$typeof: symbol }).$$typeof).toBe(memoSymbol);
    });

    it('should expose displayName "StickyNode"', () => {
      expect((StickyNode as unknown as { displayName?: string }).displayName).toBe('StickyNode');
    });
  });
});
