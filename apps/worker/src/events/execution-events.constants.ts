export const EXECUTION_EVENTS_PUBLISHER = Symbol('EXECUTION_EVENTS_PUBLISHER');

export function executionChannel(executionId: string): string {
  return `exec:${executionId}`;
}

export const EXECUTION_EVENT_TYPES = [
  'step.started',
  'step.completed',
  'step.failed',
  'step.skipped',
  'execution.completed',
] as const;

export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

export type ExecutionEventStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
