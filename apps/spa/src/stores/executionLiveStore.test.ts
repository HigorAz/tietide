import { describe, it, expect, beforeEach } from 'vitest';
import {
  initialExecutionLiveState,
  useExecutionLiveStore,
  type ExecutionLiveStatus,
} from './executionLiveStore';

describe('executionLiveStore', () => {
  beforeEach(() => {
    useExecutionLiveStore.setState({ ...initialExecutionLiveState });
  });

  describe('initial state', () => {
    it('should default status to "idle"', () => {
      expect(useExecutionLiveStore.getState().status).toBe<ExecutionLiveStatus>('idle');
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

  describe('reset', () => {
    it('should return state to the initial defaults', () => {
      const { setStatus, reset } = useExecutionLiveStore.getState();
      setStatus('running');
      reset();
      expect(useExecutionLiveStore.getState().status).toBe<ExecutionLiveStatus>('idle');
    });
  });
});
