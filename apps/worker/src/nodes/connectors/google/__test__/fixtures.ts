import type { DecryptedConnection, ExecutionContext, NodeInput } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import type { GoogleAuthService, GoogleClientFactories } from '../google-auth';

export const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

export const makeAuthService = (): jest.Mocked<Pick<GoogleAuthService, 'buildClient'>> => ({
  buildClient: jest.fn().mockReturnValue({} as never),
});

export const makeContext = (
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext & { markConnectionForRefresh: jest.Mock } => {
  const ctx = {
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn().mockResolvedValue(makeConnection()),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return ctx as unknown as ExecutionContext & { markConnectionForRefresh: jest.Mock };
};

export const makeConnection = (
  overrides: Partial<DecryptedConnection<GoogleOAuth2Config>> = {},
): DecryptedConnection<GoogleOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'google',
  config: {
    accessToken: 'at',
    refreshToken: 'rt',
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    tokenType: 'Bearer',
  },
  refreshToken: 'rt',
  ...overrides,
});

export const makeInput = (params: Record<string, unknown> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, ...params },
});

export const authError = (status: number, message = 'auth failure'): Error =>
  Object.assign(new Error(message), {
    response: { status, data: { error: { message } } },
  });

export const userError = (status: number, message = 'user error'): Error =>
  Object.assign(new Error(message), {
    response: { status, data: { error: { message } } },
  });

/**
 * Build a GoogleClientFactories that returns SDK stubs for the requested
 * service. The caller's `clients` object can be a partial — unspecified
 * services return empty objects.
 */
export const makeClients = (
  clients: Partial<Record<keyof GoogleClientFactories, unknown>>,
): GoogleClientFactories => ({
  gmail: () => (clients.gmail ?? {}) as never,
  drive: () => (clients.drive ?? {}) as never,
  sheets: () => (clients.sheets ?? {}) as never,
  docs: () => (clients.docs ?? {}) as never,
  calendar: () => (clients.calendar ?? {}) as never,
});
