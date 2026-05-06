import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FixtureCall {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface Fixture {
  server: Server;
  baseUrl: string;
  calls: FixtureCall[];
  close: () => Promise<void>;
}

export function startFixture(
  responder: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<Fixture> {
  return new Promise((resolve) => {
    const calls: FixtureCall[] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        calls.push({
          method: req.method ?? '',
          url: req.url ?? '',
          headers: req.headers,
          body,
        });
        responder(req, res);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      const close = (): Promise<void> =>
        new Promise((r) => {
          server.close(() => r());
        });
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, calls, close });
    });
  });
}

export function jsonResponder(status: number, body: unknown) {
  return (_req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
}

export function silentResponder() {
  return (_req: IncomingMessage, _res: ServerResponse): void => {
    // never respond — used to test abort/timeout
  };
}
