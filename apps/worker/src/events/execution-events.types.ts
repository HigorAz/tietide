import type { ExecutionEventStatus, ExecutionEventType } from './execution-events.constants';

export interface ExecutionEventEnvelope {
  type: ExecutionEventType;
  executionId: string;
  nodeId: string | null;
  nodeType: string | null;
  status: ExecutionEventStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  input: unknown;
  output: unknown;
  error: { message: string; code: string | null } | null;
}
