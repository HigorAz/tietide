import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeType, type Workflow, type WorkflowDefinition } from '@tietide/shared';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from './client';
import {
  getWorkflow,
  updateWorkflow,
  listWorkflows,
  createWorkflow,
  toggleWorkflowActive,
  deleteWorkflow,
} from './workflows';

const sampleWorkflow: Workflow = {
  id: 'wf-1',
  name: 'Example',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: true,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  executionCount: 0,
};

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);
const mockedPatch = vi.mocked(api.patch);
const mockedDelete = vi.mocked(api.delete);

describe('workflows API client', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
    mockedPatch.mockReset();
    mockedDelete.mockReset();
  });

  describe('listWorkflows', () => {
    it('should GET /workflows and return the array payload', async () => {
      mockedGet.mockResolvedValueOnce({ data: [sampleWorkflow] });

      const result = await listWorkflows();

      expect(mockedGet).toHaveBeenCalledWith('/workflows');
      expect(result).toEqual([sampleWorkflow]);
    });

    it('should propagate axios errors', async () => {
      const error = new Error('boom');
      mockedGet.mockRejectedValueOnce(error);

      await expect(listWorkflows()).rejects.toBe(error);
    });
  });

  describe('getWorkflow', () => {
    it('should GET /workflows/:id and return the workflow payload', async () => {
      mockedGet.mockResolvedValueOnce({ data: sampleWorkflow });

      const result = await getWorkflow('wf-1');

      expect(mockedGet).toHaveBeenCalledWith('/workflows/wf-1');
      expect(result).toEqual(sampleWorkflow);
    });

    it('should propagate axios errors', async () => {
      const error = new Error('not found');
      mockedGet.mockRejectedValueOnce(error);

      await expect(getWorkflow('missing')).rejects.toBe(error);
    });
  });

  describe('createWorkflow', () => {
    it('should POST /workflows with the body and return the created workflow', async () => {
      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: 'trigger-1',
            type: NodeType.MANUAL_TRIGGER,
            name: 'Start',
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      };
      mockedPost.mockResolvedValueOnce({ data: sampleWorkflow });

      const result = await createWorkflow({ name: 'New', definition });

      expect(mockedPost).toHaveBeenCalledWith('/workflows', { name: 'New', definition });
      expect(result).toEqual(sampleWorkflow);
    });

    it('should forward description when provided', async () => {
      mockedPost.mockResolvedValueOnce({ data: sampleWorkflow });

      await createWorkflow({
        name: 'Named',
        description: 'Some notes',
        definition: { nodes: [], edges: [] },
      });

      expect(mockedPost).toHaveBeenCalledWith('/workflows', {
        name: 'Named',
        description: 'Some notes',
        definition: { nodes: [], edges: [] },
      });
    });

    it('should propagate axios errors', async () => {
      const error = new Error('bad request');
      mockedPost.mockRejectedValueOnce(error);

      await expect(
        createWorkflow({ name: 'x', definition: { nodes: [], edges: [] } }),
      ).rejects.toBe(error);
    });
  });

  describe('updateWorkflow', () => {
    it('should PATCH /workflows/:id with { definition } and return the workflow', async () => {
      const definition: WorkflowDefinition = {
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
      };
      mockedPatch.mockResolvedValueOnce({ data: sampleWorkflow });

      const result = await updateWorkflow('wf-1', { definition });

      expect(mockedPatch).toHaveBeenCalledWith('/workflows/wf-1', { definition });
      expect(result).toEqual(sampleWorkflow);
    });

    it('should forward an optional name field in the PATCH body when provided', async () => {
      mockedPatch.mockResolvedValueOnce({ data: sampleWorkflow });

      await updateWorkflow('wf-1', {
        definition: { nodes: [], edges: [] },
        name: 'Renamed',
      });

      expect(mockedPatch).toHaveBeenCalledWith('/workflows/wf-1', {
        definition: { nodes: [], edges: [] },
        name: 'Renamed',
      });
    });

    it('should propagate axios errors', async () => {
      const error = new Error('conflict');
      mockedPatch.mockRejectedValueOnce(error);

      await expect(updateWorkflow('wf-1', { definition: { nodes: [], edges: [] } })).rejects.toBe(
        error,
      );
    });
  });

  describe('toggleWorkflowActive', () => {
    it('should PATCH /workflows/:id with { isActive } and return the workflow', async () => {
      mockedPatch.mockResolvedValueOnce({ data: { ...sampleWorkflow, isActive: false } });

      const result = await toggleWorkflowActive('wf-1', false);

      expect(mockedPatch).toHaveBeenCalledWith('/workflows/wf-1', { isActive: false });
      expect(result.isActive).toBe(false);
    });

    it('should propagate axios errors', async () => {
      const error = new Error('forbidden');
      mockedPatch.mockRejectedValueOnce(error);

      await expect(toggleWorkflowActive('wf-1', true)).rejects.toBe(error);
    });
  });

  describe('deleteWorkflow', () => {
    it('should DELETE /workflows/:id and resolve with no value', async () => {
      mockedDelete.mockResolvedValueOnce({ data: undefined });

      await expect(deleteWorkflow('wf-1')).resolves.toBeUndefined();
      expect(mockedDelete).toHaveBeenCalledWith('/workflows/wf-1');
    });

    it('should propagate axios errors', async () => {
      const error = new Error('not found');
      mockedDelete.mockRejectedValueOnce(error);

      await expect(deleteWorkflow('missing')).rejects.toBe(error);
    });
  });
});
