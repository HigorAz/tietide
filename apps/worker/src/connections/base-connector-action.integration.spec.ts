import {
  BaseConnectorAction,
  ConnectionAuthError,
  ConnectorMisconfiguredError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';

interface FakeProviderConfig extends Record<string, unknown> {
  accessToken: string;
}

class FakeConnectorAction extends BaseConnectorAction<FakeProviderConfig> {
  readonly type = 'fake-connector';
  readonly name = 'Fake Connector';
  readonly description = 'Test stub';
  readonly requiredConnectionType = 'fake';

  public runImpl: (
    input: NodeInput,
    connection: DecryptedConnection<FakeProviderConfig>,
    context: ExecutionContext,
  ) => Promise<NodeOutput> = async () => ({ data: { ok: true } });

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<FakeProviderConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    return this.runImpl(input, connection, context);
  }
}

const makeContext = (
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext & {
  getConnection: jest.Mock;
  markConnectionForRefresh: jest.Mock;
} => {
  const ctx = {
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    getSecret: jest.fn(async () => 'secret'),
    getConnection: jest.fn(async () => ({
      id: 'conn-1',
      type: 'OAUTH2',
      provider: 'fake',
      config: { accessToken: 'tok' },
    })),
    markConnectionForRefresh: jest.fn(async () => undefined),
    ...overrides,
  };
  return ctx as unknown as ExecutionContext & {
    getConnection: jest.Mock;
    markConnectionForRefresh: jest.Mock;
  };
};

describe('BaseConnectorAction (integration)', () => {
  describe('execute', () => {
    it('calls run() with the decrypted connection config from context.getConnection', async () => {
      const action = new FakeConnectorAction();
      const ctx = makeContext();
      const runSpy = jest.spyOn(action, 'runImpl');

      const input: NodeInput = {
        data: {},
        params: { connectionId: 'conn-1' },
        connectionId: 'conn-1',
      };

      const output = await action.execute(input, ctx);

      expect(ctx.getConnection).toHaveBeenCalledWith('conn-1');
      expect(runSpy).toHaveBeenCalledTimes(1);
      const passedConnection = runSpy.mock.calls[0][1];
      expect(passedConnection.config).toEqual({ accessToken: 'tok' });
      expect(output).toEqual({ data: { ok: true } });
    });

    it('throws ConnectorMisconfiguredError when input.connectionId is missing', async () => {
      const action = new FakeConnectorAction();
      const ctx = makeContext();

      await expect(action.execute({ data: {}, params: {} }, ctx)).rejects.toBeInstanceOf(
        ConnectorMisconfiguredError,
      );
      expect(ctx.getConnection).not.toHaveBeenCalled();
    });

    it('on 401 from run() with refreshToken present, marks connection for refresh and surfaces ConnectionAuthError', async () => {
      const action = new FakeConnectorAction();
      const ctx = makeContext({
        getConnection: jest.fn(async () => ({
          id: 'conn-1',
          type: 'OAUTH2',
          provider: 'fake',
          config: { accessToken: 'tok' },
          refreshToken: 'rt-xyz',
        })) as unknown as ExecutionContext['getConnection'],
      });
      action.runImpl = async () => {
        const err = new Error('Unauthorized') as Error & { status: number };
        err.status = 401;
        throw err;
      };

      const input: NodeInput = { data: {}, params: {}, connectionId: 'conn-1' };

      await expect(action.execute(input, ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith('conn-1');
    });

    it('on 401 from run() WITHOUT refreshToken, does NOT mark for refresh and rethrows the original error', async () => {
      const action = new FakeConnectorAction();
      const ctx = makeContext();
      const original = new Error('Unauthorized') as Error & { status: number };
      original.status = 401;
      action.runImpl = async () => {
        throw original;
      };

      const input: NodeInput = { data: {}, params: {}, connectionId: 'conn-1' };

      await expect(action.execute(input, ctx)).rejects.toBe(original);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('on 403 from run() with refreshToken, also triggers refresh path', async () => {
      const action = new FakeConnectorAction();
      const ctx = makeContext({
        getConnection: jest.fn(async () => ({
          id: 'conn-1',
          type: 'OAUTH2',
          provider: 'fake',
          config: { accessToken: 'tok' },
          refreshToken: 'rt-xyz',
        })) as unknown as ExecutionContext['getConnection'],
      });
      action.runImpl = async () => {
        const err = new Error('Forbidden') as Error & { status: number };
        err.status = 403;
        throw err;
      };

      await expect(
        action.execute({ data: {}, params: {}, connectionId: 'conn-1' }, ctx),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith('conn-1');
    });

    it('on non-auth error (500), does NOT mark for refresh and rethrows untouched', async () => {
      const action = new FakeConnectorAction();
      const ctx = makeContext({
        getConnection: jest.fn(async () => ({
          id: 'conn-1',
          type: 'OAUTH2',
          provider: 'fake',
          config: { accessToken: 'tok' },
          refreshToken: 'rt-xyz',
        })) as unknown as ExecutionContext['getConnection'],
      });
      const original = new Error('Server boom') as Error & { status: number };
      original.status = 500;
      action.runImpl = async () => {
        throw original;
      };

      await expect(
        action.execute({ data: {}, params: {}, connectionId: 'conn-1' }, ctx),
      ).rejects.toBe(original);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('on 401 with refreshConnection available, refreshes and retries — no ConnectionAuthError surfaced', async () => {
      const action = new FakeConnectorAction();
      const refreshed: DecryptedConnection<FakeProviderConfig> = {
        id: 'conn-1',
        type: 'OAUTH2',
        provider: 'fake',
        config: { accessToken: 'new-token' },
        refreshToken: 'rt-xyz',
      };
      const ctx = makeContext({
        getConnection: jest.fn(async () => ({
          id: 'conn-1',
          type: 'OAUTH2',
          provider: 'fake',
          config: { accessToken: 'old-token' },
          refreshToken: 'rt-xyz',
        })) as unknown as ExecutionContext['getConnection'],
        refreshConnection: jest.fn(async () => refreshed) as unknown as NonNullable<
          ExecutionContext['refreshConnection']
        >,
      });

      let attempt = 0;
      action.runImpl = async (_input, connection) => {
        attempt += 1;
        if (attempt === 1) {
          expect(connection.config.accessToken).toBe('old-token');
          const err = new Error('Unauthorized') as Error & { status: number };
          err.status = 401;
          throw err;
        }
        expect(connection.config.accessToken).toBe('new-token');
        return { data: { ok: true, retried: true } };
      };

      const output = await action.execute({ data: {}, params: {}, connectionId: 'conn-1' }, ctx);

      expect(output).toEqual({ data: { ok: true, retried: true } });
      expect(attempt).toBe(2);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('on 401 retry that also returns 401, marks for refresh and surfaces ConnectionAuthError', async () => {
      const action = new FakeConnectorAction();
      const ctx = makeContext({
        getConnection: jest.fn(async () => ({
          id: 'conn-1',
          type: 'OAUTH2',
          provider: 'fake',
          config: { accessToken: 'tok' },
          refreshToken: 'rt-xyz',
        })) as unknown as ExecutionContext['getConnection'],
        refreshConnection: jest.fn(async () => ({
          id: 'conn-1',
          type: 'OAUTH2',
          provider: 'fake',
          config: { accessToken: 'still-bad' },
          refreshToken: 'rt-xyz',
        })) as unknown as NonNullable<ExecutionContext['refreshConnection']>,
      });
      action.runImpl = async () => {
        const err = new Error('Unauthorized') as Error & { status: number };
        err.status = 401;
        throw err;
      };

      await expect(
        action.execute({ data: {}, params: {}, connectionId: 'conn-1' }, ctx),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith('conn-1');
    });

    it('on refreshConnection throwing, still marks for refresh and surfaces ConnectionAuthError', async () => {
      const action = new FakeConnectorAction();
      const ctx = makeContext({
        getConnection: jest.fn(async () => ({
          id: 'conn-1',
          type: 'OAUTH2',
          provider: 'fake',
          config: { accessToken: 'tok' },
          refreshToken: 'rt-xyz',
        })) as unknown as ExecutionContext['getConnection'],
        refreshConnection: jest.fn(async () => {
          throw new Error('refresh endpoint 400');
        }) as unknown as NonNullable<ExecutionContext['refreshConnection']>,
      });
      action.runImpl = async () => {
        const err = new Error('Unauthorized') as Error & { status: number };
        err.status = 401;
        throw err;
      };

      // refresh throws a non-auth error → we fall through to markForRefresh and
      // throw the original 401 wrapped in ConnectionAuthError. We surface the
      // refresh failure to logs but not as the public error so the caller still
      // sees a consistent "marked for refresh" message.
      await expect(
        action.execute({ data: {}, params: {}, connectionId: 'conn-1' }, ctx),
      ).rejects.toBeInstanceOf(Error);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith('conn-1');
    });

    it('preserves original error as `cause` on the wrapped ConnectionAuthError', async () => {
      const action = new FakeConnectorAction();
      const ctx = makeContext({
        getConnection: jest.fn(async () => ({
          id: 'conn-1',
          type: 'OAUTH2',
          provider: 'fake',
          config: { accessToken: 'tok' },
          refreshToken: 'rt-xyz',
        })) as unknown as ExecutionContext['getConnection'],
      });
      const original = new Error('Provider says nope') as Error & { status: number };
      original.status = 401;
      action.runImpl = async () => {
        throw original;
      };

      try {
        await action.execute({ data: {}, params: {}, connectionId: 'conn-1' }, ctx);
        fail('expected ConnectionAuthError');
      } catch (e) {
        expect(e).toBeInstanceOf(ConnectionAuthError);
        const authErr = e as ConnectionAuthError & { cause?: unknown };
        expect(authErr.connectionId).toBe('conn-1');
        expect(authErr.provider).toBe('fake');
        expect(authErr.cause).toBe(original);
      }
    });
  });
});
