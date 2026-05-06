import { describe, it, expect, beforeEach } from 'vitest';
import type { ExecutionEventEnvelope, ExecutionStep } from '@tietide/shared';
import {
  initialExecutionLiveState,
  useExecutionLiveStore,
  type ExecutionLiveStatus,
} from './executionLiveStore';

const baseEvent = (overrides: Partial<ExecutionEventEnvelope>): ExecutionEventEnvelope => ({
  type: 'step.started',
  executionId: 'exec-1',
  nodeId: 'node-1',
  nodeType: 'http-request',
  status: 'RUNNING',
  startedAt: '2026-05-06T10:00:00.000Z',
  finishedAt: null,
  durationMs: null,
  input: null,
  output: null,
  error: null,
  ...overrides,
});

describe('executionLiveStore', () => {
  beforeEach(() => {
    useExecutionLiveStore.getState().reset();
  });

  describe('initial state', () => {
    it('should default status to "idle"', () => {
      expect(useExecutionLiveStore.getState().status).toBe<ExecutionLiveStatus>('idle');
    });

    it('should default nodes to an empty Map', () => {
      expect(useExecutionLiveStore.getState().nodes.size).toBe(0);
    });

    it('should default executionId to null', () => {
      expect(useExecutionLiveStore.getState().executionId).toBeNull();
    });
  });

  describe('setStatus', () => {
    it('should update status to the provided value', () => {
      useExecutionLiveStore.getState().setStatus('running');
      expect(useExecutionLiveStore.getState().status).toBe<ExecutionLiveStatus>('running');
    });

    it('should support success and error transitions', () => {
      const { setStatus } = useExecutionLiveStore.getState();
      setStatus('running');
      setStatus('success');
      expect(useExecutionLiveStore.getState().status).toBe<ExecutionLiveStatus>('success');
      setStatus('error');
      expect(useExecutionLiveStore.getState().status).toBe<ExecutionLiveStatus>('error');
    });
  });

  describe('setExecutionId', () => {
    it('should set and clear the active execution id', () => {
      const { setExecutionId } = useExecutionLiveStore.getState();
      setExecutionId('exec-1');
      expect(useExecutionLiveStore.getState().executionId).toBe('exec-1');
      setExecutionId(null);
      expect(useExecutionLiveStore.getState().executionId).toBeNull();
    });
  });

  describe('applyEvent', () => {
    it('should mark a node as running on step.started', () => {
      useExecutionLiveStore.getState().applyEvent(baseEvent({ type: 'step.started' }));
      const node = useExecutionLiveStore.getState().nodes.get('node-1');
      expect(node?.status).toBe('running');
      expect(node?.nodeType).toBe('http-request');
      expect(node?.startedAt).toBe('2026-05-06T10:00:00.000Z');
    });

    it('should flip overall status to running on the first event', () => {
      useExecutionLiveStore.getState().applyEvent(baseEvent({ type: 'step.started' }));
      expect(useExecutionLiveStore.getState().status).toBe<ExecutionLiveStatus>('running');
    });

    it('should mark a node as success on step.completed and capture output + duration', () => {
      const { applyEvent } = useExecutionLiveStore.getState();
      applyEvent(baseEvent({ type: 'step.started' }));
      applyEvent(
        baseEvent({
          type: 'step.completed',
          status: 'SUCCESS',
          finishedAt: '2026-05-06T10:00:01.000Z',
          durationMs: 1000,
          input: { url: 'https://example.com' },
          output: { ok: true },
        }),
      );
      const node = useExecutionLiveStore.getState().nodes.get('node-1');
      expect(node?.status).toBe('success');
      expect(node?.durationMs).toBe(1000);
      expect(node?.output).toEqual({ ok: true });
    });

    it('should mark a node as failed on step.failed and capture the error', () => {
      const { applyEvent } = useExecutionLiveStore.getState();
      applyEvent(
        baseEvent({
          type: 'step.failed',
          status: 'FAILED',
          finishedAt: '2026-05-06T10:00:01.000Z',
          durationMs: 200,
          error: { message: 'boom', code: 'E_BOOM' },
        }),
      );
      const node = useExecutionLiveStore.getState().nodes.get('node-1');
      expect(node?.status).toBe('failed');
      expect(node?.error).toEqual({ message: 'boom', code: 'E_BOOM' });
    });

    it('should mark a node as skipped on step.skipped', () => {
      useExecutionLiveStore.getState().applyEvent(
        baseEvent({
          type: 'step.skipped',
          status: 'SKIPPED',
          finishedAt: '2026-05-06T10:00:00.500Z',
          durationMs: 0,
        }),
      );
      expect(useExecutionLiveStore.getState().nodes.get('node-1')?.status).toBe('skipped');
    });

    it('should set overall status to "success" when execution.completed arrives with SUCCESS', () => {
      const { applyEvent } = useExecutionLiveStore.getState();
      applyEvent(baseEvent({ type: 'step.started' }));
      applyEvent(
        baseEvent({
          type: 'execution.completed',
          status: 'SUCCESS',
          nodeId: null,
          nodeType: null,
        }),
      );
      expect(useExecutionLiveStore.getState().status).toBe<ExecutionLiveStatus>('success');
    });

    it('should set overall status to "error" when execution.completed arrives with FAILED', () => {
      const { applyEvent } = useExecutionLiveStore.getState();
      applyEvent(
        baseEvent({
          type: 'execution.completed',
          status: 'FAILED',
          nodeId: null,
          nodeType: null,
          error: { message: 'workflow failed', code: null },
        }),
      );
      expect(useExecutionLiveStore.getState().status).toBe<ExecutionLiveStatus>('error');
    });

    it('should not create a node entry when nodeId is null and type is not execution.completed', () => {
      useExecutionLiveStore
        .getState()
        .applyEvent(baseEvent({ type: 'step.started', nodeId: null }));
      expect(useExecutionLiveStore.getState().nodes.size).toBe(0);
    });

    it('should produce a new nodes Map reference on each update (immutability)', () => {
      const before = useExecutionLiveStore.getState().nodes;
      useExecutionLiveStore.getState().applyEvent(baseEvent({ type: 'step.started' }));
      const after = useExecutionLiveStore.getState().nodes;
      expect(after).not.toBe(before);
    });
  });

  describe('seedFromSteps', () => {
    const step = (overrides: Partial<ExecutionStep>): ExecutionStep => ({
      id: 'step-1',
      executionId: 'exec-1',
      nodeId: 'node-1',
      nodeType: 'http-request',
      nodeName: 'HTTP',
      status: 'SUCCESS',
      inputData: null,
      outputData: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      ...overrides,
    });

    it('should hydrate node states from a list of REST steps', () => {
      useExecutionLiveStore
        .getState()
        .seedFromSteps([
          step({ nodeId: 'a', status: 'SUCCESS', durationMs: 10 }),
          step({ id: 'step-2', nodeId: 'b', status: 'RUNNING' }),
        ]);
      const nodes = useExecutionLiveStore.getState().nodes;
      expect(nodes.get('a')?.status).toBe('success');
      expect(nodes.get('a')?.durationMs).toBe(10);
      expect(nodes.get('b')?.status).toBe('running');
    });

    it('should set overall status to "running" when any seeded step is RUNNING', () => {
      useExecutionLiveStore.getState().seedFromSteps([step({ status: 'RUNNING' })]);
      expect(useExecutionLiveStore.getState().status).toBe<ExecutionLiveStatus>('running');
    });

    it('should map FAILED steps to status "failed" and capture error message', () => {
      useExecutionLiveStore
        .getState()
        .seedFromSteps([step({ status: 'FAILED', error: 'broken pipe' })]);
      const node = useExecutionLiveStore.getState().nodes.get('node-1');
      expect(node?.status).toBe('failed');
      expect(node?.error?.message).toBe('broken pipe');
    });

    it('should map SKIPPED steps to status "skipped"', () => {
      useExecutionLiveStore.getState().seedFromSteps([step({ status: 'SKIPPED' })]);
      expect(useExecutionLiveStore.getState().nodes.get('node-1')?.status).toBe('skipped');
    });
  });

  describe('reset', () => {
    it('should return state to the initial defaults including empty nodes and null executionId', () => {
      const { setStatus, setExecutionId, applyEvent, reset } = useExecutionLiveStore.getState();
      setStatus('running');
      setExecutionId('exec-1');
      applyEvent(baseEvent({ type: 'step.started' }));
      reset();
      const state = useExecutionLiveStore.getState();
      expect(state.status).toBe<ExecutionLiveStatus>('idle');
      expect(state.executionId).toBeNull();
      expect(state.nodes.size).toBe(0);
    });
  });

  describe('initialExecutionLiveState constant', () => {
    it('should expose status, executionId, and an empty nodes Map', () => {
      expect(initialExecutionLiveState.status).toBe<ExecutionLiveStatus>('idle');
      expect(initialExecutionLiveState.executionId).toBeNull();
      expect(initialExecutionLiveState.nodes.size).toBe(0);
    });
  });
});
