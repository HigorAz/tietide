// DI token for the Redis publisher client (worker-internal). The wire-level
// contract — channel name, envelope shape, event types — lives in
// `@tietide/shared` so the API gateway can consume the same definitions.
export const EXECUTION_EVENTS_PUBLISHER = Symbol('EXECUTION_EVENTS_PUBLISHER');

export {
  EXECUTION_EVENT_TYPES,
  executionChannel,
  type ExecutionEventType,
  type ExecutionEventStatus,
} from '@tietide/shared';
