import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

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
  getWorkflowDocs,
  startWorkflowDocsRegeneration,
  type WorkflowDocumentationResponse,
} from './ai';

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

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
  generatedAt: '2026-04-26T01:00:00Z',
};

const make404 = (): AxiosError => {
  const headers = new AxiosHeaders();
  return new AxiosError('Not Found', 'ERR_BAD_REQUEST', undefined, null, {
    status: 404,
    statusText: 'Not Found',
    data: { message: 'not found' },
    headers,
    config: { headers },
  });
};

const make500 = (): AxiosError => {
  const headers = new AxiosHeaders();
  return new AxiosError('Server Error', 'ERR_BAD_RESPONSE', undefined, null, {
    status: 500,
    statusText: 'Server Error',
    data: { message: 'oops' },
    headers,
    config: { headers },
  });
};

describe('ai API client', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
  });

  describe('getWorkflowDocs', () => {
    it('should GET /workflows/:id/documentation and return the body', async () => {
      mockedGet.mockResolvedValueOnce({ data: sampleResponse });

      const result = await getWorkflowDocs('wf-1');

      expect(mockedGet).toHaveBeenCalledWith('/workflows/wf-1/documentation');
      expect(result).toEqual(sampleResponse);
    });

    it('should return null when the API responds with 404', async () => {
      mockedGet.mockRejectedValueOnce(make404());

      const result = await getWorkflowDocs('wf-1');

      expect(result).toBeNull();
    });

    it('should rethrow errors that are not 404s', async () => {
      mockedGet.mockRejectedValueOnce(make500());

      await expect(getWorkflowDocs('wf-1')).rejects.toBeInstanceOf(AxiosError);
    });
  });

  describe('startWorkflowDocsRegeneration', () => {
    it('should POST /workflows/:id/documentation/regenerate and return the accepted body', async () => {
      const accepted = { workflowId: 'wf-1', status: 'pending' as const };
      mockedPost.mockResolvedValueOnce({ data: accepted });

      const result = await startWorkflowDocsRegeneration('wf-1');

      expect(mockedPost).toHaveBeenCalledWith('/workflows/wf-1/documentation/regenerate');
      expect(result).toEqual(accepted);
    });

    it('should propagate errors from the underlying client', async () => {
      mockedPost.mockRejectedValueOnce(new Error('boom'));

      await expect(startWorkflowDocsRegeneration('wf-1')).rejects.toThrow('boom');
    });
  });
});
