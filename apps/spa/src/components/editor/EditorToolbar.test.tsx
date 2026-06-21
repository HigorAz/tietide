import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeType, type Workflow } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';

vi.mock('@/api/workflows', () => ({
  getWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
}));

vi.mock('@/api/executions', () => ({
  executeWorkflow: vi.fn(),
  testWorkflow: vi.fn(),
  getExecution: vi.fn(),
  repeatExecution: vi.fn(),
}));

vi.mock('@/lib/downloadFile', () => ({
  downloadJson: vi.fn(),
}));

const mockNavigate = vi.fn();
const mockSetSearchParams = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
}));

import { updateWorkflow } from '@/api/workflows';
import { executeWorkflow, getExecution, repeatExecution, testWorkflow } from '@/api/executions';
import { downloadJson } from '@/lib/downloadFile';
import { EditorToolbar } from './EditorToolbar';

const mockedUpdate = vi.mocked(updateWorkflow);
const mockedExecute = vi.mocked(executeWorkflow);
const mockedTest = vi.mocked(testWorkflow);
const mockedGetExecution = vi.mocked(getExecution);
const mockedRepeat = vi.mocked(repeatExecution);
const mockedDownload = vi.mocked(downloadJson);

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
  documentation: null,
  folderId: null,
  tags: [],
};

describe('EditorToolbar', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    useToastStore.setState({ ...initialToastState });
    useWorkflowsStore.setState({ workflows: [], status: 'idle', error: null });
    useExecutionLiveStore.setState({ executionId: null });
    mockedUpdate.mockReset();
    mockedExecute.mockReset();
    mockedTest.mockReset();
    mockedGetExecution.mockReset();
    mockedGetExecution.mockResolvedValue({ id: 'exec-1', isDryRun: false } as never);
    mockedRepeat.mockReset();
    mockedRepeat.mockResolvedValue({ id: 'new-1' } as never);
    mockedDownload.mockReset();
    mockNavigate.mockReset();
    mockSetSearchParams.mockReset();
  });

  describe('rendering', () => {
    it('should render Save, Undo, Redo, Run, and Test buttons', () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^test$/i })).toBeInTheDocument();
    });

    it('should render a Back button (issue #104)', () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      expect(screen.getByRole('button', { name: /^back$/i })).toBeInTheDocument();
    });

    it('should render the pan/select interaction-mode toggle', () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      expect(screen.getByTestId('interaction-mode-toggle')).toBeInTheDocument();
    });
  });

  describe('Shortcuts (help)', () => {
    it('renders a Shortcuts button that opens the cheatsheet', async () => {
      const onShowCheatsheet = vi.fn();
      render(
        <EditorToolbar
          workflowId="wf-1"
          entryRoute="/workflows"
          onShowCheatsheet={onShowCheatsheet}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: /shortcuts/i }));

      expect(onShowCheatsheet).toHaveBeenCalledTimes(1);
    });
  });

  describe('Back button (issue #104)', () => {
    it('should navigate to entryRoute when clicked while not dirty', async () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/dashboard" />);

      await userEvent.click(screen.getByRole('button', { name: /^back$/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    it('should navigate to entryRoute even when dirty (the page-level guard intercepts)', async () => {
      // The toolbar itself does not check dirty state — useBlocker at the page
      // level intercepts the navigation. The button always triggers navigate().
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/library" />);

      await userEvent.click(screen.getByRole('button', { name: /^back$/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/library');
    });
  });

  describe('Dirty indicator (issue #104)', () => {
    it('should not render the unsaved-changes indicator when the store is clean', () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      expect(screen.queryByLabelText(/unsaved changes/i)).not.toBeInTheDocument();
    });

    it('should render the unsaved-changes indicator when the store is dirty', () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      expect(screen.getByLabelText(/unsaved changes/i)).toBeInTheDocument();
    });
  });

  describe('Save', () => {
    it('should be disabled when the store is not dirty', () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('should be enabled after a mutation dirties the store', () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
    });

    it('should call updateWorkflow with the serialized definition on click', async () => {
      useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 10, y: 20 });
      mockedUpdate.mockResolvedValueOnce(savedResponse);
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

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
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);
      const saveButton = screen.getByRole('button', { name: /save/i });

      await userEvent.click(saveButton);

      await waitFor(() => expect(useEditorStore.getState().isDirty).toBe(false));
      expect(saveButton).toBeDisabled();
    });

    it('should keep isDirty true when the save request rejects', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      mockedUpdate.mockRejectedValueOnce(new Error('boom'));
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
    });
  });

  describe('Undo and Redo', () => {
    it('should disable Undo when the past stack is empty', () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);
      expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    });

    it('should enable Undo after a mutation pushes a snapshot', () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);
      expect(screen.getByRole('button', { name: /undo/i })).toBeEnabled();
    });

    it('should disable Redo until an undo has occurred', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);
      const redoButton = screen.getByRole('button', { name: /redo/i });
      expect(redoButton).toBeDisabled();

      await userEvent.click(screen.getByRole('button', { name: /undo/i }));

      expect(redoButton).toBeEnabled();
    });

    it('should invoke store.undo and store.redo on click', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

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

    it('should be enabled when the workflow has unsaved changes', () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);
      expect(screen.getByRole('button', { name: /run/i })).toBeEnabled();
    });

    it('should call executeWorkflow and set ?execution=<id> on the URL on success', async () => {
      mockedExecute.mockResolvedValueOnce(executionResponse);
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledWith('wf-1'));
      expect(mockSetSearchParams).toHaveBeenCalledWith({ execution: 'exec-1' });
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should NOT auto-save before executing (runs the saved version)', async () => {
      useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 5, y: 5 });
      mockedExecute.mockResolvedValueOnce(executionResponse);
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).not.toHaveBeenCalled();
      // The draft is left untouched — nothing was persisted.
      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(mockSetSearchParams).toHaveBeenCalledWith({ execution: 'exec-1' });
    });

    it('should warn that it ran the last saved version when the canvas is dirty', async () => {
      useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 5, y: 5 });
      mockedExecute.mockResolvedValueOnce(executionResponse);
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0]).toMatchObject({ tone: 'warning' });
      expect(toasts[0].message).toMatch(/last saved version/i);
    });

    it('should not warn about unsaved edits when the canvas is clean', async () => {
      mockedExecute.mockResolvedValueOnce(executionResponse);
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0]).toMatchObject({ tone: 'success' });
    });

    it('should show an error toast and not change the URL when execution fails to enqueue', async () => {
      mockedExecute.mockRejectedValueOnce(new Error('boom'));
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      expect(mockSetSearchParams).not.toHaveBeenCalled();
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0]).toMatchObject({ tone: 'error' });
    });
  });

  describe('Test', () => {
    const testResponse = {
      id: 'exec-test-1',
      workflowId: 'wf-1',
      status: 'PENDING' as const,
      triggerType: 'test',
      triggerData: null,
      idempotencyKey: null,
      isDryRun: true,
      createdAt: '2026-05-07T00:00:00.000Z',
    };

    it('should be disabled when the canvas is empty (no nodes to test)', () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      expect(screen.getByRole('button', { name: /^test$/i })).toBeDisabled();
    });

    it('should be enabled once at least one node is on the canvas', () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      expect(screen.getByRole('button', { name: /^test$/i })).toBeEnabled();
    });

    it('should call testWorkflow with the in-memory definition (without saving)', async () => {
      useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 12, y: 24 });
      mockedTest.mockResolvedValueOnce(testResponse);
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /^test$/i }));

      await waitFor(() => expect(mockedTest).toHaveBeenCalledTimes(1));
      const [calledId, calledDef] = mockedTest.mock.calls[0];
      expect(calledId).toBe('wf-1');
      expect(calledDef).toEqual(
        expect.objectContaining({
          nodes: [
            expect.objectContaining({
              type: NodeType.HTTP_REQUEST,
              position: { x: 12, y: 24 },
            }),
          ],
          edges: [],
        }),
      );
      expect(mockedUpdate).not.toHaveBeenCalled();
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('should set ?execution=<id> on the URL on success', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      mockedTest.mockResolvedValueOnce(testResponse);
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /^test$/i }));

      await waitFor(() =>
        expect(mockSetSearchParams).toHaveBeenCalledWith({ execution: 'exec-test-1' }),
      );
    });

    it('should show an error toast when the test request fails', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      mockedTest.mockRejectedValueOnce(new Error('boom'));
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /^test$/i }));

      await waitFor(() => expect(mockedTest).toHaveBeenCalledTimes(1));
      expect(mockSetSearchParams).not.toHaveBeenCalled();
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0]).toMatchObject({ tone: 'error' });
    });
  });

  describe('toast feedback', () => {
    it('should push a success toast when save succeeds', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      mockedUpdate.mockResolvedValueOnce(savedResponse);
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

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
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

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
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts).toHaveLength(1);
        expect(toasts[0]).toMatchObject({ tone: 'success' });
      });
    });

    it('should not attach a navigation action to the run-success toast (replay opens in-place)', async () => {
      mockedExecute.mockResolvedValueOnce({
        id: 'exec-3',
        workflowId: 'wf-1',
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: '2026-05-03T15:39:00.997Z',
      });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      await waitFor(() => {
        const [toast] = useToastStore.getState().toasts;
        expect(toast?.message).toBe('Execution started');
        expect(toast?.action).toBeUndefined();
      });
    });
  });

  describe('Export (issue #134)', () => {
    const seedWorkflow = (overrides: Partial<Workflow> = {}): void => {
      const wf: Workflow = {
        id: 'wf-1',
        name: 'My Workflow',
        description: null,
        definition: { nodes: [], edges: [] },
        isActive: false,
        version: 1,
        userId: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        executionCount: 0,
        documentation: null,
        folderId: null,
        tags: [],
        ...overrides,
      };
      useWorkflowsStore.setState({ workflows: [wf], status: 'ready', error: null });
    };

    it('should render an Export button', () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    it('should be disabled when the canvas is empty', () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);
      expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
    });

    it('should call downloadJson with a filename derived from the workflow name and a valid envelope', async () => {
      seedWorkflow({ name: 'Invoice Automation' });
      useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 10, y: 20 });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      await waitFor(() => expect(mockedDownload).toHaveBeenCalledTimes(1));
      const [filename, jsonString] = mockedDownload.mock.calls[0];
      expect(filename).toBe('Invoice Automation.tietide.json');

      const parsed = JSON.parse(jsonString) as Record<string, unknown>;
      expect(parsed.tietideExportVersion).toBe(1);
      expect(parsed.name).toBe('Invoice Automation');
      const definition = parsed.definition as { nodes: Array<{ type: string }> };
      expect(definition.nodes).toHaveLength(1);
      expect(definition.nodes[0].type).toBe(NodeType.HTTP_REQUEST);
    });

    it('should fall back to "workflow" filename when the workflow is not found in the store', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      render(<EditorToolbar workflowId="wf-unknown" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      await waitFor(() => expect(mockedDownload).toHaveBeenCalledTimes(1));
      const [filename] = mockedDownload.mock.calls[0];
      expect(filename).toBe('workflow.tietide.json');
    });
  });

  describe('loading state', () => {
    it('should render the shared Spinner inside the Save button while saving', async () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      mockedUpdate.mockReturnValueOnce(new Promise(() => {}));
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /save/i }));

      const saveButton = screen.getByRole('button', { name: /saving/i });
      expect(saveButton.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
    });

    it('should render the shared Spinner inside the Run button while running', async () => {
      mockedExecute.mockReturnValueOnce(new Promise(() => {}));
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      await userEvent.click(screen.getByRole('button', { name: /run/i }));

      const runButton = screen.getByRole('button', { name: /running/i });
      expect(runButton.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
    });
  });

  describe('referential integrity', () => {
    const brokenGraph = () => {
      useEditorStore.setState({
        isDirty: true,
        nodes: [
          {
            id: 't',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { label: 'Trigger', nodeType: NodeType.MANUAL_TRIGGER, config: {} },
          },
          {
            id: 'b',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
              label: 'Sink',
              nodeType: NodeType.HTTP_REQUEST,
              config: { url: '{{steps.ghost.statusCode}}' },
            },
          },
        ],
        edges: [{ id: 't->b', source: 't', target: 'b' }],
      });
    };

    it('disables Save/Run/Test and shows a warning when a reference is broken', () => {
      brokenGraph();
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);

      expect(screen.getByTestId('invalid-refs-warning')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /test/i })).toBeDisabled();
    });
  });

  describe('Repeat run (Result view only)', () => {
    const renderResult = (): void => {
      useExecutionLiveStore.setState({ executionId: 'exec-1' });
      useEditorStore.setState({ viewMode: 'result' });
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);
    };

    it('is hidden in Configure view (no loaded execution)', () => {
      render(<EditorToolbar workflowId="wf-1" entryRoute="/workflows" />);
      expect(screen.queryByRole('button', { name: /repeat run/i })).not.toBeInTheDocument();
    });

    it('is shown in Result view when an execution is loaded', () => {
      renderResult();
      expect(screen.getByRole('button', { name: /repeat run/i })).toBeInTheDocument();
    });

    it('is disabled for a dry-run (test) execution', async () => {
      mockedGetExecution.mockResolvedValue({ id: 'exec-1', isDryRun: true } as never);
      renderResult();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /repeat run/i })).toBeDisabled(),
      );
    });

    it('repeats the loaded execution and toasts on click', async () => {
      const user = userEvent.setup();
      renderResult();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /repeat run/i })).toBeEnabled(),
      );
      await user.click(screen.getByRole('button', { name: /repeat run/i }));
      expect(mockedRepeat).toHaveBeenCalledWith('wf-1', 'exec-1');
    });
  });
});
