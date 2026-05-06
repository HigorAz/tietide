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

// Base classes
export { BaseTrigger } from './base/base-trigger.js';
export { BaseAction } from './base/base-action.js';
export { BaseConnectorAction } from './base/connector-action.js';

// Errors
export {
  ConnectionAuthError,
  ConnectorMisconfiguredError,
} from './errors/connection-auth-error.js';
export type { ConnectionAuthErrorOptions } from './errors/connection-auth-error.js';
