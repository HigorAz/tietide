// W5.15 — engine-enforced per-node wall-clock timeout. Without it, a single node
// (e.g. SELECT pg_sleep(3600)) occupies one of the worker's 5 concurrent slots
// indefinitely, starving every other tenant's executions. The runner must abandon
// a node that overruns the configured budget, recording it as a FAILED step with a
// clear "timed out" error (retryable — a transient slow dependency may recover).
import { buildRunnerHarness, makeExecutor, node, type RunnerHarness } from './__test__/fixtures';
import { setNodeTimeoutMs } from './node-timeout';
import type { WorkflowDefinition } from '@tietide/shared';

describe('WorkflowRunner per-node timeout (W5.15)', () => {
  let runner: RunnerHarness['runner'];
  let registry: RunnerHarness['registry'];
  let prisma: RunnerHarness['prisma'];

  beforeEach(async () => {
    ({ runner, registry, prisma } = await buildRunnerHarness());
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    setNodeTimeoutMs(undefined);
  });

  it('should FAIL a node that overruns the per-node timeout budget', async () => {
    setNodeTimeoutMs(50);

    // A node that never resolves — simulates SELECT pg_sleep(3600) holding the slot.
    registry.register(
      makeExecutor(
        'slow',
        () => new Promise(() => {}), // never settles
      ),
    );
    const def: WorkflowDefinition = { nodes: [node('A', 'slow')], edges: [] };

    const promise = runner.run({
      executionId: 'exec-timeout',
      workflowId: 'wf-1',
      definition: def,
    });

    // Advance past the budget so the timeout fires, then drain microtasks.
    await jest.advanceTimersByTimeAsync(60);
    const result = await promise;

    expect(result.status).toBe('FAILED');
    expect(result.failedNodeId).toBe('A');
    // A timeout is a transient slot-exhaustion failure — a retry may succeed.
    expect(result.retryable).toBe(true);

    const updateCall = prisma.executionStep.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('FAILED');
    expect(updateCall.data.error).toMatch(/timed out/i);
  });

  it('should let a node that finishes within the budget succeed normally', async () => {
    setNodeTimeoutMs(1000);

    registry.register(makeExecutor('fast', async () => ({ data: { ok: true } })));
    const def: WorkflowDefinition = { nodes: [node('A', 'fast')], edges: [] };

    const result = await runner.run({
      executionId: 'exec-fast',
      workflowId: 'wf-1',
      definition: def,
    });

    expect(result.status).toBe('SUCCESS');
    const updateCall = prisma.executionStep.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('SUCCESS');
  });
});
