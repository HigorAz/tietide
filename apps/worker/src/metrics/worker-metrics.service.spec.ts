import type { Queue } from 'bullmq';
import { WorkerMetricsService } from './worker-metrics.service';

function makeService(getJobCounts: jest.Mock): WorkerMetricsService {
  return new WorkerMetricsService({ getJobCounts } as unknown as Queue);
}

describe('WorkerMetricsService', () => {
  it('renders default, execution-duration, and queue-depth series', async () => {
    const service = makeService(jest.fn().mockResolvedValue({ waiting: 1, active: 2 }));
    service.observeExecution('completed', 1.5);

    const text = await service.render();

    expect(text).toContain('process_cpu_user_seconds_total');
    expect(text).toContain('workflow_execution_duration_seconds');
    expect(text).toContain('workflow_execution_queue_jobs');
    expect(text).toContain('status="completed"');
  });

  it('reflects queue job counts as gauge values', async () => {
    const service = makeService(jest.fn().mockResolvedValue({ active: 4 }));

    const text = await service.render();

    expect(text).toMatch(/workflow_execution_queue_jobs\{[^}]*state="active"[^}]*\} 4/);
  });

  it('still renders when the queue lookup fails', async () => {
    const service = makeService(jest.fn().mockRejectedValue(new Error('redis down')));
    await expect(service.render()).resolves.toContain('workflow_execution_duration_seconds');
  });
});
