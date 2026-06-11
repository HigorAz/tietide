import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import {
  NodeType,
  type ExecutionStep,
  type Workflow,
  type WorkflowExecution,
} from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { initialExecutionLiveState, useExecutionLiveStore } from '@/stores/executionLiveStore';
import { useAuthStore } from '@/stores/authStore';

vi.mock('reactflow/dist/style.css', () => ({}));
vi.mock('reactflow', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="reactflow-stub">{children}</div>
  ),
  Background: () => null,
  BackgroundVariant: { Lines: 'lines', Dots: 'dots', Cross: 'cross' },
  Controls: () => null,
  MiniMap: () => null,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({ screenToFlowPosition: (p: { x: number; y: number }) => p }),
}));

vi.mock('@/api/workflows', () => ({
  getWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
}));

vi.mock('@/api/ai', () => ({
  getWorkflowDocs: vi.fn().mockResolvedValue(null),
  startWorkflowDocsRegeneration: vi.fn().mockResolvedValue({ workflowId: 'wf', status: 'pending' }),
}));

vi.mock('@/api/executions', () => ({
  getExecution: vi.fn(),
  listExecutionSteps: vi.fn(),
  executeWorkflow: vi.fn(),
  // The Overview dock panel calls listExecutions(workflowId, { pageSize: 1 })
  // on mount. Stub it with an empty page so the WorkflowEditorPage tests stay
  // focused on routing / hydration behavior rather than dashboard data.
  listExecutions: vi.fn(async () => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 1,
    nextCursor: null,
  })),
}));

vi.mock('@/lib/execution-socket', () => ({
  executionSocket: {
    connect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
    onEvent: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
    isConnected: vi.fn(() => false),
  },
}));

import { getWorkflow, updateWorkflow } from '@/api/workflows';
import { getExecution, listExecutionSteps } from '@/api/executions';
import { executionSocket } from '@/lib/execution-socket';
import { WorkflowEditorPage } from './WorkflowEditorPage';

const mockedGet = vi.mocked(getWorkflow);
const mockedUpdate = vi.mocked(updateWorkflow);
const mockedGetExecution = vi.mocked(getExecution);
const mockedListSteps = vi.mocked(listExecutionSteps);
const mockedSocket = vi.mocked(executionSocket);

const sampleWorkflow: Workflow = {
  id: 'wf-abc',
  name: 'Sample',
  description: null,
  definition: {
    nodes: [
      {
        id: 'n-1',
        type: NodeType.MANUAL_TRIGGER,
        name: 'Start',
        position: { x: 0, y: 0 },
        config: {},
      },
    ],
    edges: [],
  },
  isActive: true,
  version: 1,
  userId: 'user-1',
  folderId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  executionCount: 0,
  documentation: null,
  tags: [],
};

const sampleExecution = (status: WorkflowExecution['status']): WorkflowExecution => ({
  id: 'exec-1',
  workflowId: 'wf-abc',
  status,
  triggerType: 'manual',
  triggerData: null,
  startedAt: new Date('2026-05-06T10:00:00Z'),
  finishedAt: null,
  error: null,
  createdAt: new Date('2026-05-06T10:00:00Z'),
});

const sampleStep = (overrides: Partial<ExecutionStep> = {}): ExecutionStep => ({
  id: 'step-1',
  executionId: 'exec-1',
  nodeId: 'n-1',
  nodeType: 'manual-trigger',
  nodeName: 'Start',
  status: 'SUCCESS',
  inputData: null,
  outputData: { ok: true },
  error: null,
  startedAt: new Date('2026-05-06T10:00:00Z'),
  finishedAt: new Date('2026-05-06T10:00:01Z'),
  durationMs: 1000,
  ...overrides,
});

interface RenderOptions {
  id?: string;
  state?: unknown;
  search?: string;
}

const buildRouter = ({ id = 'wf-abc', state, search }: RenderOptions = {}) => {
  const routes: RouteObject[] = [
    { path: '/workflows/:id', element: <WorkflowEditorPage /> },
    { path: '/dashboard', element: <div data-testid="dashboard">Dashboard</div> },
    { path: '/workflows', element: <div data-testid="workflows-list">Workflows</div> },
    { path: '/library', element: <div data-testid="library">Library</div> },
  ];
  return createMemoryRouter(routes, {
    initialEntries: [{ pathname: `/workflows/${id}`, search, state }],
  });
};

const renderAtId = (id: string, state?: unknown, search?: string) => {
  const router = buildRouter({ id, state, search });
  const view = render(<RouterProvider router={router} />);
  return { ...view, router };
};

describe('WorkflowEditorPage', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    useExecutionLiveStore.setState({ ...initialExecutionLiveState, nodes: new Map() });
    useAuthStore.setState({ user: null, token: null });
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedGetExecution.mockReset();
    mockedListSteps.mockReset();
    mockedSocket.connect.mockReset();
    mockedSocket.subscribe.mockReset();
    mockedSocket.unsubscribe.mockReset();
    mockedSocket.disconnect.mockReset();
    mockedSocket.onEvent.mockReset();
    mockedSocket.onEvent.mockReturnValue(() => {});
    mockedSocket.onError.mockReset();
    mockedSocket.onError.mockReturnValue(() => {});
  });

  it('should show a loading state while the workflow request is in flight', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));

    renderAtId('wf-abc');

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should render the canvas, node library, config panel, and toolbar after loading', async () => {
    mockedGet.mockResolvedValueOnce(sampleWorkflow);

    renderAtId('wf-abc');

    await waitFor(() => expect(screen.getByTestId('editor-toolbar')).toBeInTheDocument());
    expect(screen.getByTestId('node-library')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-dropzone')).toBeInTheDocument();

    const state = useEditorStore.getState();
    expect(state.workflowId).toBe('wf-abc');
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].data.nodeType).toBe(NodeType.MANUAL_TRIGGER);
    expect(state.isDirty).toBe(false);
  });

  it('should render an error state when the workflow fetch rejects', async () => {
    mockedGet.mockRejectedValueOnce(new Error('not found'));

    renderAtId('wf-abc');

    await waitFor(() => expect(screen.getByText(/failed to load workflow/i)).toBeInTheDocument());
  });

  it('should default entryRoute to /workflows when no location state is supplied', async () => {
    mockedGet.mockResolvedValueOnce(sampleWorkflow);

    renderAtId('wf-abc');

    await waitFor(() => expect(useEditorStore.getState().workflowId).toBe('wf-abc'));
    expect(useEditorStore.getState().entryRoute).toBe('/workflows');
  });

  it('should use location.state.from as entryRoute when present', async () => {
    mockedGet.mockResolvedValueOnce(sampleWorkflow);

    renderAtId('wf-abc', { from: '/dashboard' });

    await waitFor(() => expect(useEditorStore.getState().workflowId).toBe('wf-abc'));
    expect(useEditorStore.getState().entryRoute).toBe('/dashboard');
  });

  it('should fall back to /workflows when location.state.from is not a valid path', async () => {
    mockedGet.mockResolvedValueOnce(sampleWorkflow);

    renderAtId('wf-abc', { from: 'not-a-path' });

    await waitFor(() => expect(useEditorStore.getState().workflowId).toBe('wf-abc'));
    expect(useEditorStore.getState().entryRoute).toBe('/workflows');
  });

  it('should reset the editor store on unmount', async () => {
    mockedGet.mockResolvedValueOnce(sampleWorkflow);

    const { unmount } = renderAtId('wf-abc');
    await waitFor(() => expect(useEditorStore.getState().nodes).toHaveLength(1));

    unmount();

    const state = useEditorStore.getState();
    expect(state.nodes).toHaveLength(0);
    expect(state.workflowId).toBeNull();
  });

  describe('live execution overlay (issue #118)', () => {
    it('should NOT call the WS singleton when no ?execution param is present', async () => {
      mockedGet.mockResolvedValueOnce(sampleWorkflow);

      renderAtId('wf-abc');

      await waitFor(() => expect(useEditorStore.getState().workflowId).toBe('wf-abc'));
      expect(mockedSocket.connect).not.toHaveBeenCalled();
      expect(mockedSocket.subscribe).not.toHaveBeenCalled();
      expect(mockedListSteps).not.toHaveBeenCalled();
    });

    it('should connect WS and subscribe when opened with ?execution=<runningId>', async () => {
      useAuthStore.setState({ token: 'jwt-token', user: null });
      mockedGet.mockResolvedValueOnce(sampleWorkflow);
      mockedGetExecution.mockResolvedValueOnce(sampleExecution('RUNNING'));
      mockedListSteps.mockResolvedValueOnce([]);

      renderAtId('wf-abc', undefined, '?execution=exec-1');

      await waitFor(() => expect(mockedSocket.connect).toHaveBeenCalledWith('jwt-token'));
      expect(mockedSocket.subscribe).toHaveBeenCalledWith('exec-1');
      expect(useExecutionLiveStore.getState().mode).toBe('live');
    });

    it('should seed the live store with the steps returned by the REST endpoint', async () => {
      useAuthStore.setState({ token: 'jwt-token', user: null });
      mockedGet.mockResolvedValueOnce(sampleWorkflow);
      mockedGetExecution.mockResolvedValueOnce(sampleExecution('RUNNING'));
      mockedListSteps.mockResolvedValueOnce([sampleStep({ status: 'RUNNING' })]);

      renderAtId('wf-abc', undefined, '?execution=exec-1');

      await waitFor(() => {
        const node = useExecutionLiveStore.getState().nodes.get('n-1');
        expect(node?.status).toBe('running');
      });
    });

    it('should hydrate replay-only state and skip WS for terminal executions (SUCCESS)', async () => {
      useAuthStore.setState({ token: 'jwt-token', user: null });
      mockedGet.mockResolvedValueOnce(sampleWorkflow);
      mockedGetExecution.mockResolvedValueOnce(sampleExecution('SUCCESS'));
      mockedListSteps.mockResolvedValueOnce([sampleStep({ status: 'SUCCESS' })]);

      renderAtId('wf-abc', undefined, '?execution=exec-1');

      await waitFor(() => {
        expect(useExecutionLiveStore.getState().nodes.get('n-1')?.status).toBe('success');
      });
      expect(mockedSocket.connect).not.toHaveBeenCalled();
      expect(mockedSocket.subscribe).not.toHaveBeenCalled();
      expect(useExecutionLiveStore.getState().mode).toBe('replay');
    });

    it('should NOT connect WS when the user has no auth token even if execution is RUNNING', async () => {
      // token already null from beforeEach
      mockedGet.mockResolvedValueOnce(sampleWorkflow);
      mockedGetExecution.mockResolvedValueOnce(sampleExecution('RUNNING'));
      mockedListSteps.mockResolvedValueOnce([]);

      renderAtId('wf-abc', undefined, '?execution=exec-1');

      await waitFor(() => expect(mockedListSteps).toHaveBeenCalled());
      expect(mockedSocket.connect).not.toHaveBeenCalled();
    });

    it('should unsubscribe and disconnect on unmount', async () => {
      useAuthStore.setState({ token: 'jwt-token', user: null });
      mockedGet.mockResolvedValueOnce(sampleWorkflow);
      mockedGetExecution.mockResolvedValueOnce(sampleExecution('RUNNING'));
      mockedListSteps.mockResolvedValueOnce([]);

      const { unmount } = renderAtId('wf-abc', undefined, '?execution=exec-1');
      await waitFor(() => expect(mockedSocket.subscribe).toHaveBeenCalled());

      unmount();

      expect(mockedSocket.unsubscribe).toHaveBeenCalledWith('exec-1');
      expect(mockedSocket.disconnect).toHaveBeenCalled();
    });

    it('should register an onEvent listener so events route to the live store', async () => {
      mockedGet.mockResolvedValueOnce(sampleWorkflow);
      renderAtId('wf-abc');
      await waitFor(() => expect(useEditorStore.getState().workflowId).toBe('wf-abc'));
      expect(mockedSocket.onEvent).toHaveBeenCalled();
    });
  });

  describe('historical execution replay mode (issue #119)', () => {
    it.each(['FAILED', 'CANCELLED'] as const)(
      'should hydrate replay-only state and skip WS for terminal executions (%s)',
      async (status) => {
        useAuthStore.setState({ token: 'jwt-token', user: null });
        mockedGet.mockResolvedValueOnce(sampleWorkflow);
        mockedGetExecution.mockResolvedValueOnce(sampleExecution(status));
        mockedListSteps.mockResolvedValueOnce([sampleStep({ status })]);

        renderAtId('wf-abc', undefined, '?execution=exec-1');

        await waitFor(() => {
          expect(useExecutionLiveStore.getState().nodes.get('n-1')?.status).toBe('failed');
        });
        expect(mockedSocket.connect).not.toHaveBeenCalled();
        expect(mockedSocket.subscribe).not.toHaveBeenCalled();
      },
    );

    it('should populate the InspectorDock Run tab with historical input/output for a terminal execution', async () => {
      const user = userEvent.setup();
      useAuthStore.setState({ token: 'jwt-token', user: null });
      mockedGet.mockResolvedValueOnce(sampleWorkflow);
      mockedGetExecution.mockResolvedValueOnce(sampleExecution('SUCCESS'));
      mockedListSteps.mockResolvedValueOnce([
        sampleStep({
          status: 'SUCCESS',
          inputData: { url: 'https://example.com' },
          outputData: { ok: true, status: 200 },
        }),
      ]);

      renderAtId('wf-abc', undefined, '?execution=exec-1');

      await waitFor(() =>
        expect(useExecutionLiveStore.getState().nodes.get('n-1')?.status).toBe('success'),
      );

      await user.click(screen.getByRole('tab', { name: /run/i }));

      expect(screen.getByTestId('run-node-input')).toHaveTextContent('https://example.com');
      // Run tab now renders via the shared DataViewer (Tree mode) rather than a raw JSON blob.
      expect(screen.getByTestId('run-node-output')).toHaveTextContent('200');
    });
  });

  describe('global view mode (configure/result)', () => {
    it('should stay in configure view when no execution is loaded', async () => {
      mockedGet.mockResolvedValueOnce(sampleWorkflow);

      renderAtId('wf-abc');

      await waitFor(() => expect(useEditorStore.getState().workflowId).toBe('wf-abc'));
      expect(useEditorStore.getState().viewMode).toBe('configure');
      expect(screen.queryByTestId('editor-view-tabs')).not.toBeInTheDocument();
    });

    it('should switch to result view and show the view tabs when opened with ?execution', async () => {
      useAuthStore.setState({ token: 'jwt-token', user: null });
      mockedGet.mockResolvedValueOnce(sampleWorkflow);
      mockedGetExecution.mockResolvedValueOnce(sampleExecution('SUCCESS'));
      mockedListSteps.mockResolvedValueOnce([sampleStep({ status: 'SUCCESS' })]);

      renderAtId('wf-abc', undefined, '?execution=exec-1');

      await waitFor(() => expect(useEditorStore.getState().viewMode).toBe('result'));
      expect(screen.getByTestId('editor-view-tabs')).toBeInTheDocument();
    });
  });

  describe('unsaved changes guard (issue #104)', () => {
    const mountAndDirty = async () => {
      mockedGet.mockResolvedValueOnce(sampleWorkflow);
      const view = renderAtId('wf-abc');
      await waitFor(() => expect(useEditorStore.getState().workflowId).toBe('wf-abc'));
      useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 50, y: 50 });
      expect(useEditorStore.getState().isDirty).toBe(true);
      return view;
    };

    it('should not block in-app navigation when the editor is clean', async () => {
      mockedGet.mockResolvedValueOnce(sampleWorkflow);
      const { router } = renderAtId('wf-abc');
      await waitFor(() => expect(useEditorStore.getState().workflowId).toBe('wf-abc'));

      await router.navigate('/dashboard');

      await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument());
      expect(screen.queryByRole('heading', { name: /unsaved changes/i })).not.toBeInTheDocument();
    });

    it('should open the modal when navigating in-app while dirty', async () => {
      const { router } = await mountAndDirty();

      void router.navigate('/dashboard');

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: /unsaved changes/i })).toBeInTheDocument(),
      );
      // The page is still the editor — navigation was blocked.
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    });

    it('Stay should close the modal and keep the user on the editor', async () => {
      const { router } = await mountAndDirty();

      void router.navigate('/dashboard');
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: /unsaved changes/i })).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByRole('button', { name: /^stay$/i }));

      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: /unsaved changes/i })).not.toBeInTheDocument(),
      );
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('Discard should proceed with the navigation without saving', async () => {
      const { router } = await mountAndDirty();

      void router.navigate('/dashboard');
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: /unsaved changes/i })).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByRole('button', { name: /^discard$/i }));

      await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument());
      expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it('Save should call updateWorkflow then proceed with the navigation', async () => {
      const { router } = await mountAndDirty();
      mockedUpdate.mockResolvedValueOnce({ ...sampleWorkflow, version: 2 });

      void router.navigate('/dashboard');
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: /unsaved changes/i })).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument());
      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('Save failure should keep the modal open and surface an error', async () => {
      const { router } = await mountAndDirty();
      mockedUpdate.mockRejectedValueOnce(new Error('boom'));

      void router.navigate('/dashboard');
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: /unsaved changes/i })).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/save failed/i));
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('after a successful save the next navigation is unblocked (markSaved releases the guard)', async () => {
      const { router } = await mountAndDirty();
      mockedUpdate.mockResolvedValueOnce({ ...sampleWorkflow, version: 2 });

      // First navigation — modal opens, Save resolves, we proceed.
      void router.navigate('/dashboard');
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: /unsaved changes/i })).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
      await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument());

      // Now navigate elsewhere — clean store, no modal.
      await router.navigate('/library');
      await waitFor(() => expect(screen.getByTestId('library')).toBeInTheDocument());
      expect(screen.queryByRole('heading', { name: /unsaved changes/i })).not.toBeInTheDocument();
    });

    it('should attach a beforeunload listener that prevents the event when dirty', async () => {
      await mountAndDirty();

      const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('should detach the beforeunload listener after markSaved', async () => {
      await mountAndDirty();

      useEditorStore.getState().markSaved();
      // Allow the effect cleanup to run.
      await waitFor(() => expect(useEditorStore.getState().isDirty).toBe(false));

      const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });
});
