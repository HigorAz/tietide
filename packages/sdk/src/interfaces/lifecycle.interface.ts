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
  // The inbound request's query string, parsed server-side by the webhook
  // controller (NOT derived from any client-supplied header). Providers whose
  // verification depends on a URL secret — e.g. Mailchimp's `?secret=` token —
  // must read it from here so the trust anchor cannot be spoofed by the caller.
  query?: Record<string, string | string[] | undefined>;
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

// Some providers (e.g. Microsoft Graph) gate notification-URL ownership with a
// one-shot challenge that arrives BEFORE any subscription row exists in our
// DB: the provider sends `?validationToken=<token>` and expects a 200
// text/plain echo within seconds. The webhook controller invokes
// `BasePushTrigger.handleValidation` ahead of the normal lookup flow so the
// trigger can answer the challenge without consulting persisted state.
export interface ValidationInput {
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Uint8Array;
}

export interface ValidationResponse {
  body: string;
  contentType: string;
}
