import type { Queue } from 'bullmq';
import { MetricsService } from './metrics.service';

function makeService(getJobCounts: jest.Mock): MetricsService {
  return new MetricsService({ getJobCounts } as unknown as Queue);
}

describe('MetricsService', () => {
  it('renders default process metrics and the custom series', async () => {
    const service = makeService(
      jest.fn().mockResolvedValue({ waiting: 2, active: 1, completed: 9, failed: 0, delayed: 0 }),
    );

    const text = await service.render();

    expect(text).toContain('process_cpu_user_seconds_total');
    expect(text).toContain('http_request_duration_seconds');
    expect(text).toContain('workflow_execution_queue_jobs');
  });

  it('reflects queue job counts as gauge values', async () => {
    const service = makeService(
      jest.fn().mockResolvedValue({ waiting: 3, active: 0, completed: 0, failed: 5, delayed: 0 }),
    );

    const text = await service.render();

    // A default `app` label is also present, so match label-order-agnostically.
    expect(text).toMatch(/workflow_execution_queue_jobs\{[^}]*state="waiting"[^}]*\} 3/);
    expect(text).toMatch(/workflow_execution_queue_jobs\{[^}]*state="failed"[^}]*\} 5/);
  });

  it('still renders when the queue lookup fails', async () => {
    const service = makeService(jest.fn().mockRejectedValue(new Error('redis down')));

    await expect(service.render()).resolves.toContain('http_request_duration_seconds');
  });

  it('records an HTTP observation into the histogram', async () => {
    const service = makeService(jest.fn().mockResolvedValue({}));

    service.observeHttp('GET', '/v1/workflows', 200, 0.012);
    const text = await service.render();

    expect(text).toContain('http_request_duration_seconds_count{');
    expect(text).toContain('method="GET"');
    expect(text).toContain('route="/v1/workflows"');
    expect(text).toContain('status_code="200"');
  });
});
