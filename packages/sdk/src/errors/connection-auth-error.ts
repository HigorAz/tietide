export interface ConnectionAuthErrorOptions {
  connectionId: string;
  provider: string;
  cause?: unknown;
}

export class ConnectionAuthError extends Error {
  readonly connectionId: string;
  readonly provider: string;

  constructor(message: string, options: ConnectionAuthErrorOptions) {
    super(message);
    this.name = 'ConnectionAuthError';
    this.connectionId = options.connectionId;
    this.provider = options.provider;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class ConnectorMisconfiguredError extends Error {
  readonly nodeType: string;

  constructor(message: string, nodeType: string) {
    super(message);
    this.name = 'ConnectorMisconfiguredError';
    this.nodeType = nodeType;
  }
}
