import type { ExecutionEventEnvelope } from '@tietide/shared';

export const EXECUTION_EVENTS_SUBSCRIBER = Symbol('EXECUTION_EVENTS_SUBSCRIBER');

export type ExecutionEventHandler = (envelope: ExecutionEventEnvelope) => void;

export interface ExecutionEventsSubscriber {
  subscribe(executionId: string, handler: ExecutionEventHandler): Promise<void>;
  unsubscribe(executionId: string, handler: ExecutionEventHandler): Promise<void>;
}
