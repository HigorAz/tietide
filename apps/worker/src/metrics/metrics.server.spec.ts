import type { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { WorkerMetricsServer } from './metrics.server';
import { WorkerMetricsService } from './worker-metrics.service';

function makeRes(): ServerResponse & { body?: string } {
  const res = {
    statusCode: 0,
    body: undefined as string | undefined,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    end(body?: string) {
      this.body = body;
    },
  };
  return res as unknown as ServerResponse & { body?: string };
}

function makeServer(token: string | undefined, render: jest.Mock): WorkerMetricsServer {
  const metrics = {
    render,
    registry: { contentType: 'text/plain' },
  } as unknown as WorkerMetricsService;
  const config = {
    get: (k: string) => (k === 'METRICS_TOKEN' ? token : undefined),
  } as ConfigService;
  return new WorkerMetricsServer(metrics, config);
}

describe('WorkerMetricsServer.handleRequest', () => {
  it('serves /metrics with 200 and the exposition body', async () => {
    const render = jest.fn().mockResolvedValue('up 1\n');
    const server = makeServer(undefined, render);
    const res = makeRes();

    await server.handleRequest(
      { method: 'GET', url: '/metrics', headers: {} } as IncomingMessage,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('up 1\n');
  });

  it('404s a non-metrics path or non-GET method', async () => {
    const server = makeServer(undefined, jest.fn());
    const a = makeRes();
    await server.handleRequest({ method: 'GET', url: '/other', headers: {} } as IncomingMessage, a);
    expect(a.statusCode).toBe(404);

    const b = makeRes();
    await server.handleRequest(
      { method: 'POST', url: '/metrics', headers: {} } as IncomingMessage,
      b,
    );
    expect(b.statusCode).toBe(404);
  });

  it('401s when a token is configured but not presented', async () => {
    const render = jest.fn();
    const server = makeServer('sekret', render);
    const res = makeRes();

    await server.handleRequest(
      { method: 'GET', url: '/metrics', headers: {} } as IncomingMessage,
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(render).not.toHaveBeenCalled();
  });

  it('serves /metrics with the correct bearer token', async () => {
    const render = jest.fn().mockResolvedValue('up 1\n');
    const server = makeServer('sekret', render);
    const res = makeRes();

    await server.handleRequest(
      {
        method: 'GET',
        url: '/metrics',
        headers: { authorization: 'Bearer sekret' },
      } as IncomingMessage,
      res,
    );

    expect(res.statusCode).toBe(200);
  });

  it('500s when rendering throws', async () => {
    const server = makeServer(undefined, jest.fn().mockRejectedValue(new Error('boom')));
    const res = makeRes();

    await server.handleRequest(
      { method: 'GET', url: '/metrics', headers: {} } as IncomingMessage,
      res,
    );

    expect(res.statusCode).toBe(500);
  });
});
