import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeType, type Workflow, type WorkflowDefinition } from '@tietide/shared';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import { api } from './client';
import { getWorkflow, updateWorkflow } from './workflows';

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
};

const mockedGet = vi.mocked(api.get);
const mockedPatch = vi.mocked(api.patch);

describe('workflows API client', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPatch.mockReset();
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
});
