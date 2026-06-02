import {
  buildRunnerHarness,
  makeExecutor,
  node,
  edge,
  type RunnerHarness,
} from './__test__/fixtures';
import { PILL_SAMPLE_KEY, type WorkflowDefinition } from '@tietide/shared';

describe('WorkflowRunner', () => {
  let runner: RunnerHarness['runner'];
  let registry: RunnerHarness['registry'];
  let prisma: RunnerHarness['prisma'];
  let secretResolver: RunnerHarness['secretResolver'];
  let connectionResolver: RunnerHarness['connectionResolver'];
  let events: RunnerHarness['events'];
  let loggerMock: RunnerHarness['loggerMock'];
  let childLogger: RunnerHarness['childLogger'];

  beforeEach(async () => {
    ({
      runner,
      registry,
      prisma,
      secretResolver,
      connectionResolver,
      events,
      loggerMock,
      childLogger,
    } = await buildRunnerHarness());
  });

  describe('run', () => {
    it('should execute a single trigger node and return SUCCESS', async () => {
      const trigger = makeExecutor(
        'manual-trigger',
        async () => ({ data: { started: true } }),
        'trigger',
      );
      registry.register(trigger);

      const def: WorkflowDefinition = {
        nodes: [node('t1', 'manual-trigger')],
        edges: [],
      };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
        triggerData: { foo: 'bar' },
      });

      expect(result.status).toBe('SUCCESS');
      expect(trigger.execute).toHaveBeenCalledTimes(1);
      expect(prisma.executionStep.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            executionId: 'exec-1',
            nodeId: 't1',
            nodeType: 'manual-trigger',
            status: 'RUNNING',
          }),
        }),
      );
    });

    it('should pass previous node output as data input to next node', async () => {
      const a = makeExecutor('a', async () => ({ data: { value: 42 } }));
      const b = makeExecutor('b');
      registry.register(a);
      registry.register(b);

      const def: WorkflowDefinition = {
        nodes: [node('A', 'a'), node('B', 'b')],
        edges: [edge('e1', 'A', 'B')],
      };

      await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
        triggerData: { origin: 'manual' },
      });

      expect(a.execute).toHaveBeenCalledWith(
        expect.objectContaining({ data: { origin: 'manual' } }),
        expect.any(Object),
      );
      expect(b.execute).toHaveBeenCalledWith(
        expect.objectContaining({ data: { value: 42 } }),
        expect.any(Object),
      );
    });

    it('should execute nodes in topological order for a linear chain', async () => {
      const calls: string[] = [];
      const mk = (t: string) =>
        makeExecutor(t, async () => {
          calls.push(t);
          return { data: {} };
        });
      registry.register(mk('a'));
      registry.register(mk('b'));
      registry.register(mk('c'));

      const def: WorkflowDefinition = {
        nodes: [node('C', 'c'), node('A', 'a'), node('B', 'b')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
      };

      await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(calls).toEqual(['a', 'b', 'c']);
    });

    it('should create ExecutionStep PENDING/RUNNING then update to SUCCESS', async () => {
      registry.register(makeExecutor('a'));
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(prisma.executionStep.create).toHaveBeenCalledTimes(1);
      expect(prisma.executionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCESS' }),
        }),
      );
    });

    it('should record durationMs on successful step', async () => {
      registry.register(makeExecutor('a'));
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const updateCall = prisma.executionStep.update.mock.calls[0][0];
      expect(updateCall.data.durationMs).toEqual(expect.any(Number));
      expect(updateCall.data.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should persist inputData and outputData on each step', async () => {
      registry.register(makeExecutor('a', async () => ({ data: { out: 'hello' } })));
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
        triggerData: { in: 'world' },
      });

      const updateCall = prisma.executionStep.update.mock.calls[0][0];
      expect(updateCall.data.inputData).toEqual({ in: 'world' });
      expect(updateCall.data.outputData).toEqual({ out: 'hello' });
    });

    it('should mark remaining nodes CANCELLED when a middle node fails', async () => {
      registry.register(makeExecutor('a'));
      registry.register(
        makeExecutor('b', async () => {
          throw new Error('boom');
        }),
      );
      registry.register(makeExecutor('c'));

      const def: WorkflowDefinition = {
        nodes: [node('A', 'a'), node('B', 'b'), node('C', 'c')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
      };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.failedNodeId).toBe('B');

      const writes = [
        ...prisma.executionStep.create.mock.calls,
        ...prisma.executionStep.update.mock.calls,
      ].map((c) => c[0].data);
      const statusByNode = new Map<string, string>();
      for (const w of writes) statusByNode.set(w.nodeId as string, w.status as string);
      expect(statusByNode.get('A')).toBe('SUCCESS');
      expect(statusByNode.get('B')).toBe('FAILED');
      expect(statusByNode.get('C')).toBe('CANCELLED');
    });

    it('should mark step FAILED with error message when executor throws', async () => {
      registry.register(
        makeExecutor('a', async () => {
          throw new Error('kaboom');
        }),
      );
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const updateCall = prisma.executionStep.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('FAILED');
      expect(updateCall.data.error).toContain('kaboom');
    });

    describe('requestId correlation (Issue #162)', () => {
      it('should bind requestId on the child pino logger when one is supplied', async () => {
        registry.register(
          makeExecutor('a', async () => {
            throw new Error('kaboom');
          }),
        );
        const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

        await runner.run({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          definition: def,
          requestId: 'req-xyz',
        });

        expect(loggerMock.logger.child).toHaveBeenCalledWith(
          expect.objectContaining({ requestId: 'req-xyz' }),
        );
        expect(childLogger.warn).toHaveBeenCalled();
        const warnArgs = childLogger.warn.mock.calls[0];
        expect(warnArgs[0]).toEqual(
          expect.objectContaining({ executionId: 'exec-1', nodeId: 'A' }),
        );
      });

      it('should not bind a requestId field when no requestId is supplied', async () => {
        registry.register(
          makeExecutor('a', async () => {
            throw new Error('boom');
          }),
        );
        const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(loggerMock.logger.child).toHaveBeenCalled();
        const childArgs = loggerMock.logger.child.mock.calls[0][0] as Record<string, unknown>;
        expect(childArgs).not.toHaveProperty('requestId');
      });
    });

    it('should abort with clear error when NodeRegistry has no executor for a node type', async () => {
      const def: WorkflowDefinition = { nodes: [node('A', 'missing')], edges: [] };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/no executor.*missing/i);
      expect(prisma.executionStep.create).not.toHaveBeenCalled();
    });

    it('should follow only true-branch nodes when IF returns branch:true', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('if', async () => ({ data: {}, metadata: { branch: 'true' } }), 'logic'),
      );
      const truePath = makeExecutor('truePath');
      const falsePath = makeExecutor('falsePath');
      registry.register(truePath);
      registry.register(falsePath);

      const def: WorkflowDefinition = {
        nodes: [
          node('T', 'trigger'),
          node('IF', 'if'),
          node('TRUE', 'truePath'),
          node('FALSE', 'falsePath'),
        ],
        edges: [
          edge('e1', 'T', 'IF'),
          edge('e2', 'IF', 'TRUE', 'true'),
          edge('e3', 'IF', 'FALSE', 'false'),
        ],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(truePath.execute).toHaveBeenCalledTimes(1);
      expect(falsePath.execute).not.toHaveBeenCalled();
    });

    it('should record an un-taken conditional branch node as SKIPPED (not CANCELLED)', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('if', async () => ({ data: {}, metadata: { branch: 'true' } }), 'logic'),
      );
      registry.register(makeExecutor('truePath'));
      registry.register(makeExecutor('falsePath'));

      const def: WorkflowDefinition = {
        nodes: [
          node('T', 'trigger'),
          node('IF', 'if'),
          node('TRUE', 'truePath'),
          node('FALSE', 'falsePath'),
        ],
        edges: [
          edge('e1', 'T', 'IF'),
          edge('e2', 'IF', 'TRUE', 'true'),
          edge('e3', 'IF', 'FALSE', 'false'),
        ],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      // The branch was not selected — it was skipped, not cancelled by a failure.
      const creates = prisma.executionStep.create.mock.calls.map((c) => c[0].data);
      const falseStep = creates.find((s) => s.nodeId === 'FALSE');
      expect(falseStep).toBeDefined();
      expect(falseStep!.status).toBe('SKIPPED');
      // Single terminal write — no redundant follow-up update for the skipped node.
      const falseUpdate = prisma.executionStep.update.mock.calls
        .map((c) => c[0].data)
        .find((u) => u.nodeId === 'FALSE');
      expect(falseUpdate).toBeUndefined();
    });

    it('should record a CANCELLED node in a single write (no redundant update)', async () => {
      registry.register(makeExecutor('a'));
      registry.register(
        makeExecutor('b', async () => {
          throw new Error('boom');
        }),
      );
      registry.register(makeExecutor('c'));

      const def: WorkflowDefinition = {
        nodes: [node('A', 'a'), node('B', 'b'), node('C', 'c')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const cCreate = prisma.executionStep.create.mock.calls
        .map((c) => c[0].data)
        .find((s) => s.nodeId === 'C');
      expect(cCreate!.status).toBe('CANCELLED');
      const cUpdate = prisma.executionStep.update.mock.calls
        .map((c) => c[0].data)
        .find((u) => u.nodeId === 'C');
      expect(cUpdate).toBeUndefined();
    });

    it('should expose ALL executed predecessor outputs via scope on fan-in (no branch dropped, W3.10)', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(makeExecutor('leftBranch', async () => ({ data: { src: 'left' } })));
      registry.register(makeExecutor('rightBranch', async () => ({ data: { src: 'right' } })));
      const merge = makeExecutor('merge');
      registry.register(merge);

      const def: WorkflowDefinition = {
        nodes: [
          node('T', 'trigger'),
          node('L', 'leftBranch'),
          node('R', 'rightBranch'),
          node('M', 'merge'),
        ],
        edges: [
          edge('e1', 'T', 'L'),
          edge('e2', 'T', 'R'),
          edge('e3', 'L', 'M'),
          edge('e4', 'R', 'M'),
        ],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(merge.execute).toHaveBeenCalledTimes(1);
      const mergeInput = merge.execute.mock.calls[0][0];
      // No branch is dropped: scope carries every predecessor's output keyed by
      // source nodeId, so a fan-in/join node can read from every branch (the
      // anti-data-loss guarantee now lives in scope, not in a keyed `data`).
      expect(mergeInput.scope).toEqual(
        expect.objectContaining({ L: { src: 'left' }, R: { src: 'right' } }),
      );
      // `data` is the flat output of the last-executed predecessor (passthrough contract).
      expect([{ src: 'left' }, { src: 'right' }]).toContainEqual(mergeInput.data);
    });

    it('should keep a single predecessor output flat (linear chain passthrough)', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(makeExecutor('producer', async () => ({ data: { value: 42 } })));
      const consumer = makeExecutor('consumer');
      registry.register(consumer);

      const def: WorkflowDefinition = {
        nodes: [node('T', 'trigger'), node('P', 'producer'), node('C', 'consumer')],
        edges: [edge('e1', 'T', 'P'), edge('e2', 'P', 'C')],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      // One predecessor → flat output, NOT keyed by nodeId (back-compat).
      expect(consumer.execute.mock.calls[0][0].data).toEqual({ value: 42 });
    });

    it('should provide ExecutionContext with correct executionId/workflowId/nodeId', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-42', workflowId: 'wf-99', definition: def });

      const ctx = exec.execute.mock.calls[0][1];
      expect(ctx.executionId).toBe('exec-42');
      expect(ctx.workflowId).toBe('wf-99');
      expect(ctx.nodeId).toBe('A');
    });

    it('should expose the run requestId on the node ExecutionContext', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
        requestId: 'req-corr-1',
      });

      expect(exec.execute.mock.calls[0][1].requestId).toBe('req-corr-1');
    });

    it('should delegate context.getSecret to SecretResolver with executionId', async () => {
      const exec = makeExecutor('a', async (_input, ctx) => {
        const value = await ctx.getSecret('api-key');
        return { data: { secret: value } };
      });
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(secretResolver.getSecret).toHaveBeenCalledWith('exec-1', 'api-key');
    });

    it('should delegate context.getConnection to ConnectionResolver with executionId', async () => {
      const exec = makeExecutor('a', async (_input, ctx) => {
        const conn = await ctx.getConnection('conn-1');
        return { data: { provider: conn.provider } };
      });
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(connectionResolver.getConnection).toHaveBeenCalledWith('exec-1', 'conn-1');
    });

    it('should delegate context.markConnectionForRefresh to ConnectionResolver with executionId', async () => {
      const exec = makeExecutor('a', async (_input, ctx) => {
        await ctx.markConnectionForRefresh('conn-1');
        return { data: {} };
      });
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(connectionResolver.markForRefresh).toHaveBeenCalledWith('exec-1', 'conn-1');
    });

    it('should expose isDryRun=false on ExecutionContext by default', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const ctx = exec.execute.mock.calls[0][1];
      expect(ctx.isDryRun).toBe(false);
    });

    it('should expose isDryRun=true on ExecutionContext when run() is called with isDryRun:true', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
        isDryRun: true,
      });

      const ctx = exec.execute.mock.calls[0][1];
      expect(ctx.isDryRun).toBe(true);
    });

    it('should call ConnectionResolver.releaseExecution exactly once after a successful run', async () => {
      registry.register(makeExecutor('a'));
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-conn-ok', workflowId: 'wf-1', definition: def });

      expect(connectionResolver.releaseExecution).toHaveBeenCalledTimes(1);
      expect(connectionResolver.releaseExecution).toHaveBeenCalledWith('exec-conn-ok');
    });

    it('should lift node.config.connectionId to top-level input.connectionId', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'A',
            type: 'a',
            name: 'A',
            position: { x: 0, y: 0 },
            config: { connectionId: 'conn-xyz', other: 'value' },
          },
        ],
        edges: [],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const input = exec.execute.mock.calls[0][0];
      expect(input.connectionId).toBe('conn-xyz');
      expect(input.params).toEqual({ connectionId: 'conn-xyz', other: 'value' });
    });

    it('should strip the reserved __pillSample key from executor params', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'A',
            type: 'a',
            name: 'A',
            position: { x: 0, y: 0 },
            config: {
              [PILL_SAMPLE_KEY]: { foo: 'bar' },
              connectionId: 'conn-xyz',
              url: 'https://example.com',
            },
          },
        ],
        edges: [],
      };

      await runner.run({ executionId: 'exec-pill', workflowId: 'wf-1', definition: def });

      const input = exec.execute.mock.calls[0][0];
      // The declared output sample feeds only the picker — it must never reach
      // the executor's params, but the strip is surgical: real config keys and
      // the lifted connectionId survive untouched.
      expect(input.params).not.toHaveProperty(PILL_SAMPLE_KEY);
      expect(input.params).toEqual({ connectionId: 'conn-xyz', url: 'https://example.com' });
      expect(input.connectionId).toBe('conn-xyz');
    });

    it('should leave input.connectionId undefined when node has no connectionId in config', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const input = exec.execute.mock.calls[0][0];
      expect(input.connectionId).toBeUndefined();
    });

    it('should call SecretResolver.releaseExecution exactly once after a successful run', async () => {
      registry.register(makeExecutor('a'));
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-release-ok', workflowId: 'wf-1', definition: def });

      expect(secretResolver.releaseExecution).toHaveBeenCalledTimes(1);
      expect(secretResolver.releaseExecution).toHaveBeenCalledWith('exec-release-ok');
    });

    it('should call SecretResolver.releaseExecution exactly once even when a node throws', async () => {
      registry.register(
        makeExecutor('a', async () => {
          throw new Error('boom');
        }),
      );
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      const result = await runner.run({
        executionId: 'exec-release-fail',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(secretResolver.releaseExecution).toHaveBeenCalledTimes(1);
      expect(secretResolver.releaseExecution).toHaveBeenCalledWith('exec-release-fail');
    });

    it('should return FAILED when topologicalSort detects a circular dependency', async () => {
      registry.register(makeExecutor('a'));
      registry.register(makeExecutor('b'));

      // Two-node cycle: A -> B -> A. No node has in-degree zero.
      const def: WorkflowDefinition = {
        nodes: [node('A', 'a'), node('B', 'b')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'A')],
      };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/circular dependency/i);
      expect(prisma.executionStep.create).not.toHaveBeenCalled();
    });

    it('should return FAILED with error message when topologicalSort throws non-cycle error', async () => {
      registry.register(makeExecutor('a'));

      // Empty workflow → topologicalSort throws a plain Error (not CircularDependencyError)
      const def: WorkflowDefinition = { nodes: [], edges: [] };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/at least one node/i);
    });

    it('should expose a working logger on ExecutionContext (info/warn/error/debug)', async () => {
      const exec = makeExecutor('a', async (_input, ctx) => {
        ctx.logger.info('info-msg', { k: 1 });
        ctx.logger.warn('warn-msg', { k: 2 });
        ctx.logger.error('error-msg', { k: 3 });
        ctx.logger.debug('debug-msg', { k: 4 });
        return { data: {} };
      });
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('SUCCESS');
      expect(exec.execute).toHaveBeenCalledTimes(1);
    });

    describe('node skip toggle', () => {
      it('should mark a skipped node as SKIPPED and not invoke its executor', async () => {
        registry.register(makeExecutor('a'));
        const skipped = makeExecutor('b');
        registry.register(skipped);

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), { ...node('B', 'b'), skipped: true }],
          edges: [edge('e1', 'A', 'B')],
        };

        const result = await runner.run({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          definition: def,
          triggerData: { origin: 'manual' },
        });

        expect(result.status).toBe('SUCCESS');
        expect(skipped.execute).not.toHaveBeenCalled();

        const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
        const bUpdate = updates.find((u) => u.nodeId === 'B');
        expect(bUpdate).toBeDefined();
        expect(bUpdate!.status).toBe('SKIPPED');
      });

      it('should record passthrough output and forwarded input on a skipped step', async () => {
        registry.register(makeExecutor('a', async () => ({ data: { value: 42 } })));
        registry.register(makeExecutor('b'));

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), { ...node('B', 'b'), skipped: true }],
          edges: [edge('e1', 'A', 'B')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
        const bUpdate = updates.find((u) => u.nodeId === 'B');
        expect(bUpdate!.inputData).toEqual({ value: 42 });
        expect(bUpdate!.outputData).toEqual({ skipped: true, passthrough: { value: 42 } });
      });

      it('should forward upstream input transparently to downstream nodes', async () => {
        registry.register(makeExecutor('a', async () => ({ data: { value: 42 } })));
        registry.register(makeExecutor('b'));
        const c = makeExecutor('c');
        registry.register(c);

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), { ...node('B', 'b'), skipped: true }, node('C', 'c')],
          edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(c.execute).toHaveBeenCalledTimes(1);
        const cInput = c.execute.mock.calls[0][0];
        expect(cInput.data).toEqual({ value: 42 });
      });

      it('should chain pass-through across multiple consecutive skipped nodes', async () => {
        registry.register(makeExecutor('a', async () => ({ data: { value: 42 } })));
        registry.register(makeExecutor('b'));
        registry.register(makeExecutor('c'));
        const d = makeExecutor('d');
        registry.register(d);

        const def: WorkflowDefinition = {
          nodes: [
            node('A', 'a'),
            { ...node('B', 'b'), skipped: true },
            { ...node('C', 'c'), skipped: true },
            node('D', 'd'),
          ],
          edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C'), edge('e3', 'C', 'D')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(d.execute).toHaveBeenCalledTimes(1);
        expect(d.execute.mock.calls[0][0].data).toEqual({ value: 42 });

        const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
        const statusByNode = new Map<string, string>();
        for (const u of updates) statusByNode.set(u.nodeId as string, u.status as string);
        expect(statusByNode.get('B')).toBe('SKIPPED');
        expect(statusByNode.get('C')).toBe('SKIPPED');
        expect(statusByNode.get('D')).toBe('SUCCESS');
      });

      it('should still invoke the executor when skipped is explicitly false', async () => {
        registry.register(makeExecutor('a'));
        const b = makeExecutor('b');
        registry.register(b);

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), { ...node('B', 'b'), skipped: false }],
          edges: [edge('e1', 'A', 'B')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(b.execute).toHaveBeenCalledTimes(1);
      });

      it.each([['manual-trigger'], ['cron-trigger'], ['webhook-trigger']])(
        'should ignore skipped:true on a trigger node (type=%s) and execute it normally',
        async (triggerType) => {
          const trigger = makeExecutor(
            triggerType,
            async () => ({ data: { fired: true } }),
            'trigger',
          );
          registry.register(trigger);

          const def: WorkflowDefinition = {
            nodes: [{ ...node('T', triggerType), skipped: true }],
            edges: [],
          };

          await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

          expect(trigger.execute).toHaveBeenCalledTimes(1);
          const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
          const tUpdate = updates.find((u) => u.nodeId === 'T');
          expect(tUpdate!.status).toBe('SUCCESS');
        },
      );

      it('should propagate reachability past a skipped node on a branch edge', async () => {
        registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
        registry.register(
          makeExecutor('if', async () => ({ data: {}, metadata: { branch: 'true' } }), 'logic'),
        );
        registry.register(makeExecutor('skipMid'));
        const truePath = makeExecutor('truePath');
        registry.register(truePath);
        registry.register(makeExecutor('falsePath'));

        const def: WorkflowDefinition = {
          nodes: [
            node('T', 'trigger'),
            node('IF', 'if'),
            { ...node('S', 'skipMid'), skipped: true },
            node('TRUE', 'truePath'),
            node('FALSE', 'falsePath'),
          ],
          edges: [
            edge('e1', 'T', 'IF'),
            edge('e2', 'IF', 'S', 'true'),
            edge('e3', 'S', 'TRUE'),
            edge('e4', 'IF', 'FALSE', 'false'),
          ],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(truePath.execute).toHaveBeenCalledTimes(1);
      });
    });

    describe('execution event emission', () => {
      it('should emit step.started + step.completed for each node in topological order', async () => {
        registry.register(makeExecutor('a'));
        registry.register(makeExecutor('b'));

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), node('B', 'b')],
          edges: [edge('e1', 'A', 'B')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        const startedNodes = events.publishStepStarted.mock.calls.map((c) => c[0].nodeId);
        const completedNodes = events.publishStepCompleted.mock.calls.map((c) => c[0].nodeId);
        expect(startedNodes).toEqual(['A', 'B']);
        expect(completedNodes).toEqual(['A', 'B']);
        expect(events.publishStepFailed).not.toHaveBeenCalled();
      });

      it('should emit step.started before step.completed for the same node', async () => {
        registry.register(makeExecutor('a'));
        const sequence: string[] = [];
        events.publishStepStarted.mockImplementation(async ({ nodeId }) => {
          sequence.push(`started:${nodeId}`);
        });
        events.publishStepCompleted.mockImplementation(async ({ nodeId }) => {
          sequence.push(`completed:${nodeId}`);
        });

        const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };
        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(sequence).toEqual(['started:A', 'completed:A']);
      });

      it('should emit step.failed (not step.completed) when a node throws', async () => {
        registry.register(
          makeExecutor('a', async () => {
            throw new Error('kaboom');
          }),
        );
        const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(events.publishStepStarted).toHaveBeenCalledTimes(1);
        expect(events.publishStepFailed).toHaveBeenCalledTimes(1);
        expect(events.publishStepCompleted).not.toHaveBeenCalled();
        const failedArgs = events.publishStepFailed.mock.calls[0][0];
        expect(failedArgs.nodeId).toBe('A');
        expect(failedArgs.error.message).toContain('kaboom');
      });

      it('should emit step.skipped (and not step.started) for a skipped node', async () => {
        registry.register(makeExecutor('a', async () => ({ data: { value: 42 } })));
        registry.register(makeExecutor('b'));

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), { ...node('B', 'b'), skipped: true }],
          edges: [edge('e1', 'A', 'B')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        const startedNodes = events.publishStepStarted.mock.calls.map((c) => c[0].nodeId);
        const skippedNodes = events.publishStepSkipped.mock.calls.map((c) => c[0].nodeId);
        expect(startedNodes).toEqual(['A']);
        expect(skippedNodes).toEqual(['B']);
        const skippedArgs = events.publishStepSkipped.mock.calls[0][0];
        expect(skippedArgs.input).toEqual({ value: 42 });
        expect(skippedArgs.output).toEqual({
          skipped: true,
          passthrough: { value: 42 },
        });
      });

      it("should pass raw input/output through to events (sanitization is the service's job)", async () => {
        registry.register(makeExecutor('a', async () => ({ data: { token: 'tk', body: 'ok' } })));
        const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

        await runner.run({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          definition: def,
          triggerData: { password: 'p' },
        });

        const completedArgs = events.publishStepCompleted.mock.calls[0][0];
        expect(completedArgs.input).toEqual({ password: 'p' });
        expect(completedArgs.output).toEqual({ token: 'tk', body: 'ok' });
      });

      it('should not emit any step events for CANCELLED downstream nodes', async () => {
        registry.register(makeExecutor('a'));
        registry.register(
          makeExecutor('b', async () => {
            throw new Error('boom');
          }),
        );
        registry.register(makeExecutor('c'));

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), node('B', 'b'), node('C', 'c')],
          edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        const allNodeIdsSeen = [
          ...events.publishStepStarted.mock.calls,
          ...events.publishStepCompleted.mock.calls,
          ...events.publishStepFailed.mock.calls,
          ...events.publishStepSkipped.mock.calls,
        ].map((c) => c[0].nodeId);
        expect(allNodeIdsSeen).not.toContain('C');
      });
    });

    it('should pass node config as params to the executor', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'A',
            type: 'a',
            name: 'A',
            position: { x: 0, y: 0 },
            config: { url: 'https://example.com', method: 'GET' },
          },
        ],
        edges: [],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(exec.execute).toHaveBeenCalledWith(
        expect.objectContaining({ params: { url: 'https://example.com', method: 'GET' } }),
        expect.any(Object),
      );
    });
  });
});
