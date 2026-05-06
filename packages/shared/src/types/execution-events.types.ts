export const EXECUTION_EVENT_TYPES = [
  'step.started',
  'step.completed',
  'step.failed',
  'step.skipped',
  'execution.completed',
] as const;

export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

export type ExecutionEventStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

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

export const EXECUTION_CHANNEL_PREFIX = 'exec:';

export function executionChannel(executionId: string): string {
  return `${EXECUTION_CHANNEL_PREFIX}${executionId}`;
}

export function parseExecutionChannel(channel: string): string | null {
  if (!channel.startsWith(EXECUTION_CHANNEL_PREFIX)) return null;
  const id = channel.slice(EXECUTION_CHANNEL_PREFIX.length);
  return id.length > 0 ? id : null;
}
