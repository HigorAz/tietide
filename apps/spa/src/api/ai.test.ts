import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from './client';
import { generateWorkflowDocs, type WorkflowDocumentationResponse } from './ai';

const mockedPost = vi.mocked(api.post);

describe('ai API client', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  describe('generateWorkflowDocs', () => {
    const sampleResponse: WorkflowDocumentationResponse = {
      workflowId: 'wf-1',
      version: 3,
      documentation: '# Demo\nGenerated text',
      sections: {
        objective: 'obj',
        triggers: 'trig',
        actions: 'act',
        dataFlow: 'flow',
        decisions: 'dec',
      },
      model: 'llama3.1:8b',
      cached: false,
      generatedAt: '2026-04-26T01:00:00Z',
    };

    it('should POST /workflows/:id/generate-docs and return the response', async () => {
      mockedPost.mockResolvedValueOnce({ data: sampleResponse });

      const result = await generateWorkflowDocs('wf-1');

      expect(mockedPost).toHaveBeenCalledWith('/workflows/wf-1/generate-docs');
      expect(result).toEqual(sampleResponse);
    });

    it('should propagate errors from the underlying client', async () => {
      mockedPost.mockRejectedValueOnce(new Error('boom'));

      await expect(generateWorkflowDocs('wf-1')).rejects.toThrow('boom');
    });
  });
});
