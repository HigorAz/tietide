// Interfaces
export type {
  INodeExecutor,
  NodeInput,
  NodeOutput,
  OutputSchema,
} from './interfaces/node.interface.js';
export type {
  ExecutionContext,
  Logger,
  DecryptedConnection,
} from './interfaces/context.interface.js';
export type {
  ActivationContext,
  ActivationResult,
  DeactivationContext,
  SignatureInput,
  PollContext,
  PollResult,
} from './interfaces/lifecycle.interface.js';

// Base classes
export { BaseTrigger } from './base/base-trigger.js';
export { BaseAction } from './base/base-action.js';
export { BaseConnectorAction } from './base/connector-action.js';
export { BasePushTrigger } from './base/push-trigger.js';
export { BasePollTrigger } from './base/poll-trigger.js';

// Errors
export {
  ConnectionAuthError,
  ConnectorMisconfiguredError,
} from './errors/connection-auth-error.js';
export type { ConnectionAuthErrorOptions } from './errors/connection-auth-error.js';
