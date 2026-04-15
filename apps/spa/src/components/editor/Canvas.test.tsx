import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { NodeType } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';

const { screenToFlowPositionMock } = vi.hoisted(() => ({
  screenToFlowPositionMock: vi.fn((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
}));

vi.mock('reactflow/dist/style.css', () => ({}));

vi.mock('reactflow', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="reactflow-stub">{children}</div>
  ),
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

describe('Canvas', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    screenToFlowPositionMock.mockClear();
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
});
