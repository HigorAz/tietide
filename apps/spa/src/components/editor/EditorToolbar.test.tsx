import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeType, type Workflow } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';

vi.mock('@/api/workflows', () => ({
  getWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
}));

vi.mock('@/api/executions', () => ({
  executeWorkflow: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

import { updateWorkflow } from '@/api/workflows';
import { executeWorkflow } from '@/api/executions';
import { EditorToolbar } from './EditorToolbar';

const mockedUpdate = vi.mocked(updateWorkflow);
const mockedExecute = vi.mocked(executeWorkflow);

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
    useToastStore.setState({ ...initialToastState });
    mockedUpdate.mockReset();
    mockedExecute.mockReset();
    mockNavigate.mockReset();
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
    const executionResponse = {
      id: 'exec-1',
      workflowId: 'wf-1',
      status: 'PENDING' as const,
      triggerType: 'manual',
      triggerData: null,
      idempotencyKey: null,
      createdAt: '2026-05-03T15:39:00.997Z',
    };

    it('should be enabled when the workflow has unsaved changes (auto-saves on click)', () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" />);
      expect(screen.getByRole('button', { name: /run/i })).toBeEnabled();
    });

    it('should call executeWorkflow and navigate to execution detail on success', async () => {
      mockedExecute.mockResolvedValueOnce(executionResponse);
      render(<EditorToolbar workflowId="wf-1" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledWith('wf-1'));
      expect(mockNavigate).toHaveBeenCalledWith('/executions/exec-1');
    });

    it('should save before executing when the workflow is dirty', async () => {
      useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 5, y: 5 });
      mockedUpdate.mockResolvedValueOnce(savedResponse);
      mockedExecute.mockResolvedValueOnce(executionResponse);
      render(<EditorToolbar workflowId="wf-1" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledTimes(1);
      expect(useEditorStore.getState().isDirty).toBe(false);
      expect(mockNavigate).toHaveBeenCalledWith('/executions/exec-1');
    });

    it('should not call executeWorkflow when the auto-save fails', async () => {
      useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 5, y: 5 });
      mockedUpdate.mockRejectedValueOnce(new Error('save boom'));
      render(<EditorToolbar workflowId="wf-1" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedExecute).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should show an error toast and not navigate when execution fails to enqueue', async () => {
      mockedExecute.mockRejectedValueOnce(new Error('boom'));
      render(<EditorToolbar workflowId="wf-1" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      expect(mockNavigate).not.toHaveBeenCalled();
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0]).toMatchObject({ tone: 'error' });
    });
  });

  describe('toast feedback', () => {
    it('should push a success toast when save succeeds', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      mockedUpdate.mockResolvedValueOnce(savedResponse);
      render(<EditorToolbar workflowId="wf-1" />);

      await userEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts).toHaveLength(1);
        expect(toasts[0]).toMatchObject({ tone: 'success' });
        expect(toasts[0].message).toMatch(/saved/i);
      });
    });

    it('should push an error toast when save fails', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      mockedUpdate.mockRejectedValueOnce(new Error('boom'));
      render(<EditorToolbar workflowId="wf-1" />);

      await userEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts).toHaveLength(1);
        expect(toasts[0]).toMatchObject({ tone: 'error' });
      });
    });

    it('should push a success toast when an execution is enqueued', async () => {
      mockedExecute.mockResolvedValueOnce({
        id: 'exec-2',
        workflowId: 'wf-1',
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: '2026-05-03T15:39:00.997Z',
      });
      render(<EditorToolbar workflowId="wf-1" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts).toHaveLength(1);
        expect(toasts[0]).toMatchObject({ tone: 'success' });
      });
    });
  });
});
