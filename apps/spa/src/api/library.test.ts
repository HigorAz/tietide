import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workflow } from '@tietide/shared';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from './client';
import { listTemplates, instantiateTemplate, type WorkflowTemplate } from './library';

const sampleTemplate: WorkflowTemplate = {
  slug: 'cron-fetch-process',
  name: 'Demo: Cron → Fetch → Archive',
  description: 'Cron fixture',
  category: 'Schedule',
  nodeTypes: ['cron-trigger', 'http-request'],
};

const sampleWorkflow: Workflow = {
  id: 'wf-new',
  name: 'Demo: Cron → Fetch → Archive',
  description: 'Cron fixture',
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-05-04T10:00:00Z'),
  updatedAt: new Date('2026-05-04T10:00:00Z'),
  executionCount: 0,
  documentation: null,
  folderId: null,
  tags: [],
};

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

describe('library API client', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
  });

  describe('listTemplates', () => {
    it('should GET /library/templates and return the array payload', async () => {
      mockedGet.mockResolvedValueOnce({ data: [sampleTemplate] });

      const result = await listTemplates();

      expect(mockedGet).toHaveBeenCalledWith('/library/templates');
      expect(result).toEqual([sampleTemplate]);
    });

    it('should propagate axios errors', async () => {
      const error = new Error('boom');
      mockedGet.mockRejectedValueOnce(error);

      await expect(listTemplates()).rejects.toBe(error);
    });
  });

  describe('instantiateTemplate', () => {
    it('should POST /library/templates/:slug/instantiate and return the new workflow', async () => {
      mockedPost.mockResolvedValueOnce({ data: sampleWorkflow });

      const result = await instantiateTemplate('cron-fetch-process');

      expect(mockedPost).toHaveBeenCalledWith('/library/templates/cron-fetch-process/instantiate');
      expect(result).toEqual(sampleWorkflow);
    });

    it('should URL-encode slug components defensively', async () => {
      mockedPost.mockResolvedValueOnce({ data: sampleWorkflow });

      await instantiateTemplate('weird/slug with space');

      // Slug is part of the path, so callers should rely on encoding to avoid injection.
      expect(mockedPost).toHaveBeenCalledWith(
        '/library/templates/weird%2Fslug%20with%20space/instantiate',
      );
    });

    it('should propagate axios errors (e.g., 404 unknown slug)', async () => {
      const error = new Error('not found');
      mockedPost.mockRejectedValueOnce(error);

      await expect(instantiateTemplate('no-such')).rejects.toBe(error);
    });
  });
});
