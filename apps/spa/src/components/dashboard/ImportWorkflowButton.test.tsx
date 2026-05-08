import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Workflow } from '@tietide/shared';

vi.mock('@/api/workflows', () => ({
  createWorkflow: vi.fn(),
}));

import * as workflowsApi from '@/api/workflows';
import { useToastStore } from '@/stores/toastStore';
import { buildExportPayload, serializeExport } from '@/lib/workflowExport';
import { ImportWorkflowButton } from './ImportWorkflowButton';

const createWorkflowMock = vi.mocked(workflowsApi.createWorkflow);

const makeFile = (contents: string, name = 'workflow.tietide.json'): File =>
  new File([contents], name, { type: 'application/json' });

const makeValidExportJson = (workflowName = 'Imported Workflow'): string => {
  const payload = buildExportPayload(
    workflowName,
    {
      nodes: [
        {
          id: 'n1',
          type: 'manual_trigger',
          name: 'Manual Trigger',
          position: { x: 100, y: 100 },
          config: {},
        },
      ],
      edges: [],
    },
    new Date('2026-05-07T10:30:00.000Z'),
  );
  return serializeExport(payload);
};

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-123',
  userId: 'user-1',
  name: 'Imported Workflow',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  executionCount: 0,
  documentation: null,
  folderId: null,
  tags: [],
  ...overrides,
});

describe('ImportWorkflowButton', () => {
  const onImported = vi.fn();
  let toastShow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onImported.mockReset();
    createWorkflowMock.mockReset();
    toastShow = vi.fn();
    useToastStore.setState({ show: toastShow });
  });

  it('should render a button labelled "Import"', () => {
    render(<ImportWorkflowButton onImported={onImported} variant="secondary" />);
    expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
  });

  it('should create a workflow and call onImported when given a valid file', async () => {
    const user = userEvent.setup();
    const created = makeWorkflow();
    createWorkflowMock.mockResolvedValueOnce(created);
    render(<ImportWorkflowButton onImported={onImported} variant="secondary" />);

    const input = screen.getByTestId('import-workflow-file-input') as HTMLInputElement;
    const file = makeFile(makeValidExportJson('Imported Workflow'));
    await user.upload(input, file);

    await waitFor(() => expect(createWorkflowMock).toHaveBeenCalledTimes(1));
    const [body] = createWorkflowMock.mock.calls[0];
    expect(body.name).toBe('Imported Workflow');
    expect(body.definition.nodes).toHaveLength(1);
    expect(body.definition.nodes[0].type).toBe('manual_trigger');

    expect(onImported).toHaveBeenCalledWith(created);
    expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
  });

  it('should show an error toast and not call the API when the file lacks tietideExportVersion', async () => {
    const user = userEvent.setup();
    render(<ImportWorkflowButton onImported={onImported} variant="secondary" />);

    const file = makeFile(JSON.stringify({ name: 'wf', definition: { nodes: [], edges: [] } }));
    const input = screen.getByTestId('import-workflow-file-input') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' })),
    );
    expect(createWorkflowMock).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('should show an error toast on malformed JSON', async () => {
    const user = userEvent.setup();
    render(<ImportWorkflowButton onImported={onImported} variant="secondary" />);

    const file = makeFile('{not json');
    const input = screen.getByTestId('import-workflow-file-input') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' })),
    );
    expect(createWorkflowMock).not.toHaveBeenCalled();
  });

  it('should reset the file input value after a failed import so the same file can be retried', async () => {
    const user = userEvent.setup();
    render(<ImportWorkflowButton onImported={onImported} variant="secondary" />);

    const input = screen.getByTestId('import-workflow-file-input') as HTMLInputElement;
    const file = makeFile('{not json');
    await user.upload(input, file);

    await waitFor(() =>
      expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' })),
    );
    expect(input.value).toBe('');
  });

  it('should show an error toast surfacing the API error message when createWorkflow rejects', async () => {
    const user = userEvent.setup();
    createWorkflowMock.mockRejectedValueOnce(new Error('Server rejected definition'));
    render(<ImportWorkflowButton onImported={onImported} variant="secondary" />);

    const input = screen.getByTestId('import-workflow-file-input') as HTMLInputElement;
    const file = makeFile(makeValidExportJson());
    await user.upload(input, file);

    await waitFor(() => expect(createWorkflowMock).toHaveBeenCalled());
    expect(toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'error',
        message: expect.stringContaining('Server rejected definition'),
      }),
    );
    expect(onImported).not.toHaveBeenCalled();
  });
});
