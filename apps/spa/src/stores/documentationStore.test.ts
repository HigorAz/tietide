import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError } from 'axios';
import type { WorkflowDocumentationResponse } from '@/api/ai';

vi.mock('@/api/ai', () => ({
  getWorkflowDocs: vi.fn(),
  startWorkflowDocsRegeneration: vi.fn(),
  saveWorkflowDocs: vi.fn(),
}));

import { getWorkflowDocs, saveWorkflowDocs, startWorkflowDocsRegeneration } from '@/api/ai';
import {
  DOC_POLL_INTERVAL_MS,
  DOC_POLL_MAX_ATTEMPTS,
  useDocumentationStore,
} from './documentationStore';

const mockedGet = vi.mocked(getWorkflowDocs);
const mockedStart = vi.mocked(startWorkflowDocsRegeneration);
const mockedSave = vi.mocked(saveWorkflowDocs);

const doc = (generatedAt = '2026-04-26T01:00:00Z'): WorkflowDocumentationResponse => ({
  workflowId: 'wf-1',
  version: 3,
  documentation: '# Demo\nGenerated text',
  sections: { overview: 'ov', walkthrough: 'wt' },
  model: 'llama3.1:8b',
  generatedAt,
});

describe('documentationStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedGet.mockReset();
    mockedStart.mockReset();
    mockedSave.mockReset();
    mockedStart.mockResolvedValue({ workflowId: 'wf-1', status: 'pending' });
    useDocumentationStore.setState({ status: 'idle', docs: null, error: null });
  });

  afterEach(() => {
    // Cancel any in-flight poll loop before restoring real timers.
    useDocumentationStore.getState().reset();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should expose idle status, no docs, no error', () => {
      const state = useDocumentationStore.getState();
      expect(state.status).toBe('idle');
      expect(state.docs).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('save', () => {
    it('persists the edited body and sets status ready with the saved doc', async () => {
      const saved = { ...doc(), documentation: '# Edited', model: 'manual' };
      mockedSave.mockResolvedValueOnce(saved);

      await useDocumentationStore.getState().save('wf-1', '# Edited');

      expect(mockedSave).toHaveBeenCalledWith('wf-1', '# Edited');
      const state = useDocumentationStore.getState();
      expect(state.status).toBe('ready');
      expect(state.docs).toEqual(saved);
    });

    it('rejects and leaves existing docs untouched when the API fails', async () => {
      const existing = doc();
      useDocumentationStore.setState({ status: 'ready', docs: existing, error: null });
      mockedSave.mockRejectedValueOnce(new AxiosError('Network down'));

      await expect(useDocumentationStore.getState().save('wf-1', '# Edited')).rejects.toThrow();
      expect(useDocumentationStore.getState().docs).toEqual(existing);
    });
  });

  describe('fetch', () => {
    it('should set status to ready with docs when the API returns a body', async () => {
      const sample = doc();
      mockedGet.mockResolvedValueOnce(sample);

      await useDocumentationStore.getState().fetch('wf-1');

      const state = useDocumentationStore.getState();
      expect(state.status).toBe('ready');
      expect(state.docs).toEqual(sample);
      expect(state.error).toBeNull();
    });

    it('should remain idle with null docs when the API returns null (no docs yet)', async () => {
      mockedGet.mockResolvedValueOnce(null);

      await useDocumentationStore.getState().fetch('wf-1');

      const state = useDocumentationStore.getState();
      expect(state.status).toBe('idle');
      expect(state.docs).toBeNull();
    });

    it('should set error status when the API throws', async () => {
      mockedGet.mockRejectedValueOnce(new Error('network down'));

      await useDocumentationStore.getState().fetch('wf-1');

      const state = useDocumentationStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('network down');
      expect(state.docs).toBeNull();
    });
  });

  describe('regenerate (async + polling)', () => {
    it('should stay loading until a fresh doc appears, then become ready', async () => {
      const fresh = doc('2026-05-01T00:00:00Z');
      mockedGet.mockResolvedValueOnce(null).mockResolvedValueOnce(fresh);

      const p = useDocumentationStore.getState().regenerate('wf-1');

      // POST resolves + immediate first poll returns null.
      await vi.advanceTimersByTimeAsync(0);
      expect(useDocumentationStore.getState().status).toBe('loading');

      // Next poll, after one interval, returns the fresh doc.
      await vi.advanceTimersByTimeAsync(DOC_POLL_INTERVAL_MS);
      await p;

      const state = useDocumentationStore.getState();
      expect(state.status).toBe('ready');
      expect(state.docs).toEqual(fresh);
    });

    it('should ignore a stale doc and wait until generatedAt advances', async () => {
      const old = doc('2026-05-01T00:00:00Z');
      const newer = doc('2026-05-02T00:00:00Z');
      useDocumentationStore.setState({ status: 'ready', docs: old, error: null });
      mockedGet.mockResolvedValueOnce(old).mockResolvedValueOnce(newer);

      const p = useDocumentationStore.getState().regenerate('wf-1');

      await vi.advanceTimersByTimeAsync(0);
      expect(useDocumentationStore.getState().status).toBe('loading'); // stale ignored

      await vi.advanceTimersByTimeAsync(DOC_POLL_INTERVAL_MS);
      await p;

      expect(useDocumentationStore.getState().docs).toEqual(newer);
      expect(useDocumentationStore.getState().status).toBe('ready');
    });

    it('should surface a friendly message when starting generation fails (503)', async () => {
      const axiosErr = new AxiosError('Service Unavailable');
      axiosErr.response = {
        status: 503,
        data: { message: 'AI service temporarily unavailable' },
        statusText: 'Service Unavailable',
        headers: {},
        config: { headers: {} as never },
      };
      mockedStart.mockRejectedValueOnce(axiosErr);

      await useDocumentationStore.getState().regenerate('wf-1');

      const state = useDocumentationStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toMatch(/temporarily unavailable/i);
      expect(mockedGet).not.toHaveBeenCalled();
    });

    it('should error out after exhausting the poll budget', async () => {
      mockedGet.mockResolvedValue(null); // generation never lands a doc

      const p = useDocumentationStore.getState().regenerate('wf-1');
      await vi.advanceTimersByTimeAsync(DOC_POLL_INTERVAL_MS * DOC_POLL_MAX_ATTEMPTS);
      await p;

      const state = useDocumentationStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toMatch(/taking longer/i);
    });
  });

  describe('reset', () => {
    it('should restore state to idle/null/null', () => {
      useDocumentationStore.setState({ status: 'ready', docs: doc(), error: null });
      useDocumentationStore.getState().reset();
      const state = useDocumentationStore.getState();
      expect(state.status).toBe('idle');
      expect(state.docs).toBeNull();
      expect(state.error).toBeNull();
    });
  });
});
