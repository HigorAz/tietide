import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeType, type Workflow } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';

vi.mock('@/api/workflows', () => ({
  getWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
}));

import { updateWorkflow } from '@/api/workflows';
import { EditorToolbar } from './EditorToolbar';

const mockedUpdate = vi.mocked(updateWorkflow);

const savedResponse: Workflow = {
  id: 'wf-1',
  name: 'Example',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: true,
  version: 2,
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  executionCount: 0,
};

describe('EditorToolbar', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    mockedUpdate.mockReset();
  });

  describe('rendering', () => {
    it('should render Save, Undo, Redo, and Run buttons', () => {
      render(<EditorToolbar workflowId="wf-1" />);

      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
    });
  });

  describe('Save', () => {
    it('should be disabled when the store is not dirty', () => {
      render(<EditorToolbar workflowId="wf-1" />);
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('should be enabled after a mutation dirties the store', () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" />);

      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
    });

    it('should call updateWorkflow with the serialized definition on click', async () => {
      useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 10, y: 20 });
      mockedUpdate.mockResolvedValueOnce(savedResponse);
      render(<EditorToolbar workflowId="wf-1" />);

      await userEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith('wf-1', {
        definition: {
          nodes: [
            expect.objectContaining({
              type: NodeType.HTTP_REQUEST,
              name: 'HTTP Request',
              position: { x: 10, y: 20 },
              config: {},
            }),
          ],
          edges: [],
        },
      });
    });

    it('should clear isDirty and re-disable Save after a successful save', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      mockedUpdate.mockResolvedValueOnce(savedResponse);
      render(<EditorToolbar workflowId="wf-1" />);
      const saveButton = screen.getByRole('button', { name: /save/i });

      await userEvent.click(saveButton);

      await waitFor(() => expect(useEditorStore.getState().isDirty).toBe(false));
      expect(saveButton).toBeDisabled();
    });

    it('should keep isDirty true when the save request rejects', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      mockedUpdate.mockRejectedValueOnce(new Error('boom'));
      render(<EditorToolbar workflowId="wf-1" />);

      await userEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
    });
  });

  describe('Undo and Redo', () => {
    it('should disable Undo when the past stack is empty', () => {
      render(<EditorToolbar workflowId="wf-1" />);
      expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    });

    it('should enable Undo after a mutation pushes a snapshot', () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" />);
      expect(screen.getByRole('button', { name: /undo/i })).toBeEnabled();
    });

    it('should disable Redo until an undo has occurred', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" />);
      const redoButton = screen.getByRole('button', { name: /redo/i });
      expect(redoButton).toBeDisabled();

      await userEvent.click(screen.getByRole('button', { name: /undo/i }));

      expect(redoButton).toBeEnabled();
    });

    it('should invoke store.undo and store.redo on click', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" />);

      await userEvent.click(screen.getByRole('button', { name: /undo/i }));
      expect(useEditorStore.getState().nodes).toHaveLength(0);

      await userEvent.click(screen.getByRole('button', { name: /redo/i }));
      expect(useEditorStore.getState().nodes).toHaveLength(1);
    });
  });

  describe('Run', () => {
    it('should render the Run button enabled and not call updateWorkflow', async () => {
      render(<EditorToolbar workflowId="wf-1" />);
      const runButton = screen.getByRole('button', { name: /run/i });
      expect(runButton).toBeEnabled();

      await userEvent.click(runButton);

      expect(mockedUpdate).not.toHaveBeenCalled();
    });
  });

  describe('feedback timer cleanup', () => {
    it('should clear the pending feedback timer when the component unmounts', async () => {
      const FEEDBACK_TIMEOUT_MS = 3000;
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      try {
        const { unmount } = render(<EditorToolbar workflowId="wf-1" />);

        await userEvent.click(screen.getByRole('button', { name: /run/i }));
        expect(screen.getByRole('status')).toBeInTheDocument();

        const feedbackCallIndex = setTimeoutSpy.mock.calls.findIndex(
          ([, delay]) => delay === FEEDBACK_TIMEOUT_MS,
        );
        expect(feedbackCallIndex).toBeGreaterThanOrEqual(0);
        const timerId = setTimeoutSpy.mock.results[feedbackCallIndex].value;

        unmount();

        expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId);
      } finally {
        setTimeoutSpy.mockRestore();
        clearTimeoutSpy.mockRestore();
      }
    });

    it('should not invoke setFeedback after unmount when the timer would have fired', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { unmount } = render(<EditorToolbar workflowId="wf-1" />);

        await userEvent.click(screen.getByRole('button', { name: /run/i }));
        unmount();

        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('should clear the previous timer when feedback is shown twice in succession', async () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      try {
        render(<EditorToolbar workflowId="wf-1" />);
        const runButton = screen.getByRole('button', { name: /run/i });

        await userEvent.click(runButton);
        const clearsAfterFirstClick = clearTimeoutSpy.mock.calls.length;

        await userEvent.click(runButton);

        expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearsAfterFirstClick);
      } finally {
        clearTimeoutSpy.mockRestore();
      }
    });
  });
});
