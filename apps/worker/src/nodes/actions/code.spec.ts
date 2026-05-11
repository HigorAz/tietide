import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import { CodeAction } from './code';

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext =>
  ({
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
    getSecret: jest.fn(async () => 'secret-value'),
    getConnection: jest.fn(async () => ({
      id: 'conn-stub',
      type: 'OAUTH2',
      provider: 'stub',
      config: {},
    })),
    markConnectionForRefresh: jest.fn(async () => undefined),
    ...overrides,
  }) as unknown as ExecutionContext;

const makeInput = (
  params: Record<string, unknown>,
  data: Record<string, unknown> = {},
): NodeInput => ({
  data,
  params,
});

// Worker thread spin-up is the dominant cost on this suite. Give jest enough
// headroom on slower Windows CI runners.
jest.setTimeout(20_000);

describe('CodeAction', () => {
  describe('interface metadata', () => {
    it('should expose the code type', () => {
      const action = new CodeAction();
      expect(action.type).toBe('code');
    });

    it('should be categorized as an action', () => {
      const action = new CodeAction();
      expect(action.category).toBe('action');
    });

    it('should expose a human-readable name and description', () => {
      const action = new CodeAction();
      expect(action.name).toBe('Code');
      expect(typeof action.description).toBe('string');
      expect(action.description.length).toBeGreaterThan(0);
    });
  });

  describe('execute — happy path', () => {
    it('should run user code with access to input and return the result', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({ code: 'return { doubled: input.value * 2 };' }, { value: 5 }),
        makeContext(),
      );

      expect(result.data.result).toEqual({ doubled: 10 });
      expect(typeof result.data.duration).toBe('number');
      expect(result.data.duration).toBeGreaterThanOrEqual(0);
    });

    it('should support async code (await + Promise)', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput(
          {
            code: 'await new Promise((r) => setTimeout(r, 10)); return { ok: true, n: input.n + 1 };',
          },
          { n: 41 },
        ),
        makeContext(),
      );

      expect(result.data.result).toEqual({ ok: true, n: 42 });
    });

    it('should serialize functions away (JSON-only output)', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({ code: 'return { name: "x", fn: () => 1 };' }),
        makeContext(),
      );

      // JSON.stringify drops function-valued properties.
      expect(result.data.result).toEqual({ name: 'x' });
    });
  });

  describe('execute — error path', () => {
    it('should reject when user code throws', async () => {
      const action = new CodeAction();

      await expect(
        action.execute(
          makeInput({ code: 'throw new Error("boom from user code");' }),
          makeContext(),
        ),
      ).rejects.toThrow(/boom from user code/);
    });

    it('should reject when user code has a syntax error', async () => {
      const action = new CodeAction();

      await expect(
        action.execute(makeInput({ code: 'return ;;; this is not valid;;;' }), makeContext()),
      ).rejects.toThrow(/Code execution failed/);
    });

    it('should reject empty code at validation time without spawning a worker', async () => {
      const action = new CodeAction();

      await expect(action.execute(makeInput({ code: '' }), makeContext())).rejects.toThrow(
        /Code node config invalid/,
      );
    });

    it('should reject when code exceeds the 10,000-character limit', async () => {
      const action = new CodeAction();
      const huge = 'a'.repeat(10_001);

      await expect(action.execute(makeInput({ code: huge }), makeContext())).rejects.toThrow(
        /Code node config invalid/,
      );
    });
  });

  describe('execute — timeout & sandbox', () => {
    it('should terminate the worker when user code runs past the configured timeout', async () => {
      const action = new CodeAction();

      await expect(
        action.execute(makeInput({ code: 'while (true) {}', timeout: 250 }), makeContext()),
      ).rejects.toThrow(/timed out|terminated|exited/i);
    });

    it('should block access to require/process/fs (no Node host APIs leak in)', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({
          code: 'return { require: typeof require, process: typeof process, global: typeof global };',
        }),
        makeContext(),
      );

      expect(result.data.result).toEqual({
        require: 'undefined',
        process: 'undefined',
        global: 'undefined',
      });
    });

    it('should disable dynamic code generation (no eval / new Function)', async () => {
      const action = new CodeAction();

      await expect(
        action.execute(makeInput({ code: 'return eval("1 + 1");' }), makeContext()),
      ).rejects.toThrow(/Code execution failed/);
    });
  });

  describe('execute — dry-run', () => {
    it('should not run user code on dry-run; returns a mock preview', async () => {
      const action = new CodeAction();

      const result = await action.execute(
        makeInput({ code: 'throw new Error("never run");' }),
        makeContext({ isDryRun: true }),
      );

      expect(result.data).toEqual(expect.objectContaining({ mocked: true, mode: 'dry-run' }));
      expect(result.metadata).toEqual(expect.objectContaining({ mocked: true }));
    });
  });
});
