import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Edge, Node } from 'reactflow';
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NodeType } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import {
  buildClipboardPayload,
  CLIPBOARD_VERSION,
  serializeClipboardPayload,
} from '@/lib/clipboard';
import type { CustomNodeData } from './nodes/CustomNode.types';

const { screenToFlowPositionMock, lastReactFlowProps } = vi.hoisted(() => ({
  screenToFlowPositionMock: vi.fn((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
  lastReactFlowProps: { current: null as Record<string, unknown> | null },
}));

vi.mock('reactflow/dist/style.css', () => ({}));

interface MockReactFlowProps {
  children?: React.ReactNode;
  onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
  onPaneClick?: (event: React.MouseEvent) => void;
  fitView?: boolean;
  fitViewOptions?: { padding?: number; minZoom?: number; maxZoom?: number };
}

vi.mock('reactflow', () => ({
  __esModule: true,
  default: (props: MockReactFlowProps) => {
    lastReactFlowProps.current = props as unknown as Record<string, unknown>;
    const { children, onNodeClick, onPaneClick } = props;
    return (
      <div data-testid="reactflow-stub">
        <button
          type="button"
          data-testid="trigger-node-click"
          onClick={(e) => onNodeClick?.(e, { id: 'node-mock-123' })}
        >
          click node
        </button>
        <button type="button" data-testid="trigger-pane-click" onClick={(e) => onPaneClick?.(e)}>
          click pane
        </button>
        {children}
      </div>
    );
  },
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({ screenToFlowPosition: screenToFlowPositionMock }),
}));

import { Canvas, CANVAS_DROP_MIME } from './Canvas';

const fireDrop = (
  node: HTMLElement,
  init: { clientX: number; clientY: number; dataTransfer: object },
): void => {
  const event = createEvent.drop(node, { dataTransfer: init.dataTransfer });
  Object.defineProperty(event, 'clientX', { value: init.clientX, configurable: true });
  Object.defineProperty(event, 'clientY', { value: init.clientY, configurable: true });
  fireEvent(node, event);
};

interface ClipboardMock {
  writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
  readText: ReturnType<typeof vi.fn<() => Promise<string>>>;
}

const installClipboardMock = (): ClipboardMock => {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  const readText = vi.fn<() => Promise<string>>().mockResolvedValue('');
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText, readText },
    configurable: true,
  });
  return { writeText, readText };
};

describe('Canvas', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    useToastStore.setState({ ...initialToastState });
    screenToFlowPositionMock.mockClear();
    lastReactFlowProps.current = null;
  });

  describe('viewport configuration', () => {
    it('should pass fitView with padding 0.4 and minZoom 0.5 to React Flow', () => {
      render(<Canvas />);
      expect(lastReactFlowProps.current).not.toBeNull();
      expect(lastReactFlowProps.current?.fitView).toBe(true);
      expect(lastReactFlowProps.current?.fitViewOptions).toEqual({
        padding: 0.4,
        minZoom: 0.5,
      });
    });
  });

  describe('dragOver', () => {
    it('should call preventDefault and request the copy drop effect', () => {
      render(<Canvas />);
      const dropzone = screen.getByTestId('canvas-dropzone');
      const dataTransfer = { dropEffect: 'none' };

      const notPrevented = fireEvent.dragOver(dropzone, { dataTransfer });

      expect(notPrevented).toBe(false);
      expect(dataTransfer.dropEffect).toBe('copy');
    });
  });

  describe('drop', () => {
    it('should add a node at the projected flow position when a node type is in dataTransfer', () => {
      render(<Canvas />);
      const dropzone = screen.getByTestId('canvas-dropzone');

      fireDrop(dropzone, {
        dataTransfer: {
          getData: (type: string) => (type === CANVAS_DROP_MIME ? NodeType.CRON_TRIGGER : ''),
          types: [CANVAS_DROP_MIME],
        },
        clientX: 250,
        clientY: 480,
      });

      expect(screenToFlowPositionMock).toHaveBeenCalledWith({ x: 250, y: 480 });

      const { nodes } = useEditorStore.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].data.nodeType).toBe(NodeType.CRON_TRIGGER);
      expect(nodes[0].position).toEqual({ x: 250, y: 480 });
    });

    it('should ignore the drop when no node type is present in dataTransfer', () => {
      render(<Canvas />);
      const dropzone = screen.getByTestId('canvas-dropzone');

      fireEvent.drop(dropzone, {
        dataTransfer: {
          getData: () => '',
          types: [],
        },
        clientX: 0,
        clientY: 0,
      });

      expect(screenToFlowPositionMock).not.toHaveBeenCalled();
      expect(useEditorStore.getState().nodes).toHaveLength(0);
    });
  });

  describe('rendering', () => {
    it('should render the React Flow surface inside the dropzone', () => {
      render(<Canvas />);
      const dropzone = screen.getByTestId('canvas-dropzone');
      expect(dropzone).toContainElement(screen.getByTestId('reactflow-stub'));
    });
  });

  describe('drag-over visual feedback (issue #41)', () => {
    it('should mark the dropzone as drag-active while a node is being dragged over', () => {
      render(<Canvas />);
      const dropzone = screen.getByTestId('canvas-dropzone');
      expect(dropzone.dataset.dragActive).toBe('false');

      fireEvent.dragEnter(dropzone, { dataTransfer: { types: [CANVAS_DROP_MIME] } });

      expect(dropzone.dataset.dragActive).toBe('true');
    });

    it('should clear the drag-active state on dragLeave', () => {
      render(<Canvas />);
      const dropzone = screen.getByTestId('canvas-dropzone');
      fireEvent.dragEnter(dropzone, { dataTransfer: { types: [CANVAS_DROP_MIME] } });

      fireEvent.dragLeave(dropzone);

      expect(dropzone.dataset.dragActive).toBe('false');
    });

    it('should clear the drag-active state after a successful drop', () => {
      render(<Canvas />);
      const dropzone = screen.getByTestId('canvas-dropzone');
      fireEvent.dragEnter(dropzone, { dataTransfer: { types: [CANVAS_DROP_MIME] } });

      fireDrop(dropzone, {
        dataTransfer: {
          getData: (type: string) => (type === CANVAS_DROP_MIME ? NodeType.MANUAL_TRIGGER : ''),
          types: [CANVAS_DROP_MIME],
        },
        clientX: 0,
        clientY: 0,
      });

      expect(dropzone.dataset.dragActive).toBe('false');
    });
  });

  describe('selection', () => {
    it('should select a node in the editor store when a node is clicked', () => {
      render(<Canvas />);
      expect(useEditorStore.getState().selectedNodeId).toBeNull();

      fireEvent.click(screen.getByTestId('trigger-node-click'));

      expect(useEditorStore.getState().selectedNodeId).toBe('node-mock-123');
    });

    it('should clear the selection when the empty pane is clicked', () => {
      useEditorStore.setState({ selectedNodeId: 'node-existing' });
      render(<Canvas />);

      fireEvent.click(screen.getByTestId('trigger-pane-click'));

      expect(useEditorStore.getState().selectedNodeId).toBeNull();
    });
  });

  describe('multi-selection configuration', () => {
    it('should pass cross-platform multi-selection keys (Meta, Control, Shift) to React Flow', () => {
      render(<Canvas />);
      expect(lastReactFlowProps.current?.multiSelectionKeyCode).toEqual([
        'Meta',
        'Control',
        'Shift',
      ]);
    });
  });

  describe('copy/paste keyboard shortcuts (issue #114)', () => {
    const seedTwoSelectedConnectedNodes = (): void => {
      // Set state directly: the test's reactflow mock omits addEdge/applyNodeChanges,
      // so addNode/onConnect/onNodesChange would crash here.
      const a: Node<CustomNodeData> = {
        id: 'node-a',
        type: 'custom',
        position: { x: 0, y: 0 },
        selected: true,
        data: {
          label: 'Manual Trigger',
          nodeType: NodeType.MANUAL_TRIGGER,
          status: 'idle',
          config: {},
        },
      };
      const b: Node<CustomNodeData> = {
        id: 'node-b',
        type: 'custom',
        position: { x: 200, y: 0 },
        selected: true,
        data: {
          label: 'HTTP Request',
          nodeType: NodeType.HTTP_REQUEST,
          status: 'idle',
          config: {},
        },
      };
      const edge: Edge = {
        id: 'edge-1',
        source: 'node-a',
        target: 'node-b',
        type: 'livingInk',
      };
      useEditorStore.setState({ nodes: [a, b], edges: [edge] });
    };

    it('should write selected nodes to the clipboard with the tietideClipboard marker on Cmd+C', async () => {
      const { writeText } = installClipboardMock();
      seedTwoSelectedConnectedNodes();
      render(<Canvas />);

      fireEvent.keyDown(window, { key: 'c', metaKey: true });

      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      const json = writeText.mock.calls[0][0];
      const parsed = JSON.parse(json) as { tietideClipboard: number; nodes: unknown[] };
      expect(parsed.tietideClipboard).toBe(CLIPBOARD_VERSION);
      expect(parsed.nodes).toHaveLength(2);
    });

    it('should be a no-op on Ctrl+C when nothing is selected', async () => {
      const { writeText } = installClipboardMock();
      const unselected: Node<CustomNodeData> = {
        id: 'node-x',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          label: 'HTTP',
          nodeType: NodeType.HTTP_REQUEST,
          status: 'idle',
          config: {},
        },
      };
      useEditorStore.setState({ nodes: [unselected], edges: [] });
      render(<Canvas />);

      fireEvent.keyDown(window, { key: 'c', ctrlKey: true });

      await Promise.resolve();
      expect(writeText).not.toHaveBeenCalled();
    });

    it('should paste a valid clipboard payload via the store action on Cmd+V', async () => {
      const { readText } = installClipboardMock();
      const seed: Node<CustomNodeData> = {
        id: 'node-seed',
        type: 'custom',
        position: { x: 50, y: 60 },
        data: {
          label: 'HTTP',
          nodeType: NodeType.HTTP_REQUEST,
          status: 'idle',
          config: {},
        },
      };
      const payload = buildClipboardPayload([seed], []);
      readText.mockResolvedValueOnce(serializeClipboardPayload(payload));
      render(<Canvas />);

      fireEvent.keyDown(window, { key: 'v', metaKey: true });

      await waitFor(() => expect(useEditorStore.getState().nodes).toHaveLength(1));
      expect(useEditorStore.getState().nodes[0].selected).toBe(true);
      expect(useEditorStore.getState().nodes[0].id).not.toBe('node-seed');
    });

    it('should show an error toast on Cmd+V when the clipboard contains invalid JSON (AC #7)', async () => {
      const { readText } = installClipboardMock();
      readText.mockResolvedValueOnce('{}');
      render(<Canvas />);

      fireEvent.keyDown(window, { key: 'v', metaKey: true });

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some((t) => t.tone === 'error' && /TieTide/.test(t.message))).toBe(true);
      });
    });

    it('should show an error toast when navigator.clipboard.readText rejects on Cmd+V', async () => {
      const { readText } = installClipboardMock();
      readText.mockRejectedValueOnce(new Error('denied'));
      render(<Canvas />);

      fireEvent.keyDown(window, { key: 'v', metaKey: true });

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some((t) => t.tone === 'error' && /Paste from JSON/.test(t.message))).toBe(
          true,
        );
      });
    });

    it('should not intercept Cmd+C when focus is in an <input> (default browser copy proceeds)', async () => {
      const { writeText } = installClipboardMock();
      seedTwoSelectedConnectedNodes();
      render(
        <>
          <Canvas />
          <input data-testid="text-field" />
        </>,
      );
      const input = screen.getByTestId('text-field');

      fireEvent.keyDown(input, { key: 'c', metaKey: true });

      await Promise.resolve();
      expect(writeText).not.toHaveBeenCalled();
    });
  });
});
