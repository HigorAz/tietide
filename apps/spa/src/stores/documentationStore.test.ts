import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError } from 'axios';
import type { WorkflowDocumentationResponse } from '@/api/ai';

vi.mock('@/api/ai', () => ({
  generateWorkflowDocs: vi.fn(),
}));

import { generateWorkflowDocs } from '@/api/ai';
import { useDocumentationStore } from './documentationStore';

const mockedGenerate = vi.mocked(generateWorkflowDocs);

const sample: WorkflowDocumentationResponse = {
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

describe('documentationStore', () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
    useDocumentationStore.setState({ status: 'idle', docs: null, error: null });
  });

  describe('initial state', () => {
    it('should expose idle status, no docs, no error', () => {
      const state = useDocumentationStore.getState();
      expect(state.status).toBe('idle');
      expect(state.docs).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('generate', () => {
    it('should set loading then ready when API resolves', async () => {
      let resolveFn: (v: WorkflowDocumentationResponse) => void = () => {};
      mockedGenerate.mockReturnValue(
        new Promise<WorkflowDocumentationResponse>((resolve) => {
          resolveFn = resolve;
        }),
      );

      const promise = useDocumentationStore.getState().generate('wf-1');
      expect(useDocumentationStore.getState().status).toBe('loading');
      resolveFn(sample);
      await promise;

      const state = useDocumentationStore.getState();
      expect(state.status).toBe('ready');
      expect(state.docs).toEqual(sample);
      expect(state.error).toBeNull();
    });

    it('should set error status with friendly message on AI service unavailable (503)', async () => {
      const axiosErr = new AxiosError('Service Unavailable');
      axiosErr.response = {
        status: 503,
        data: { message: 'AI service temporarily unavailable' },
        statusText: 'Service Unavailable',
        headers: {},
        config: { headers: {} as never },
      };
      mockedGenerate.mockRejectedValueOnce(axiosErr);

      await useDocumentationStore.getState().generate('wf-1');
      const state = useDocumentationStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toMatch(/temporarily unavailable/i);
      expect(state.docs).toBeNull();
    });

    it('should set generic error message for unknown failures', async () => {
      mockedGenerate.mockRejectedValueOnce(new Error('boom'));
      await useDocumentationStore.getState().generate('wf-1');
      const state = useDocumentationStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('boom');
    });
  });

  describe('reset', () => {
    it('should restore state to idle/null/null', () => {
      useDocumentationStore.setState({
        status: 'ready',
        docs: sample,
        error: null,
      });
      useDocumentationStore.getState().reset();
      const state = useDocumentationStore.getState();
      expect(state.status).toBe('idle');
      expect(state.docs).toBeNull();
      expect(state.error).toBeNull();
    });
  });
});
