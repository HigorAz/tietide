import type { DecryptedConnection, Logger } from './context.interface.js';

export interface ActivationContext {
  workflowId: string;
  nodeId: string;
  callbackUrl: string;
  connection: DecryptedConnection;
  config: Record<string, unknown>;
  logger: Logger;
}

export interface ActivationResult {
  providerSubId: string;
  signingSecret: string;
  expiresAt?: Date;
}

export interface DeactivationContext {
  workflowId: string;
  nodeId: string;
  providerSubId: string;
  connection: DecryptedConnection;
  config: Record<string, unknown>;
  logger: Logger;
}

export interface SignatureInput {
  rawBody: Uint8Array;
  headers: Record<string, string | string[] | undefined>;
  signingSecret: string;
}

export interface PollContext {
  workflowId: string;
  nodeId: string;
  connection: DecryptedConnection;
  config: Record<string, unknown>;
  cursor: string | null;
  logger: Logger;
}

export interface PollResult {
  items: Record<string, unknown>[];
  newCursor: string;
}
