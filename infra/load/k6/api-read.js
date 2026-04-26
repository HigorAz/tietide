// k6 load test — TieTide API read endpoints
// Issue #36 — NFR: p95 latency < 200ms on read endpoints
//
// Run:
//   k6 run infra/load/k6/api-read.js
//
// Optional env:
//   BASE_URL          (default: http://localhost:3030)
//   LOADTEST_EMAIL    (default: loadtest+<rand>@tietide.local)
//   LOADTEST_PASSWORD (default: loadtest-password-1234)
//   VUS               (default: 10)
//   DURATION          (default: 30s)

import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3030';
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || '30s';

const PASSWORD = __ENV.LOADTEST_PASSWORD || 'loadtest-password-1234';
const EMAIL = __ENV.LOADTEST_EMAIL || `loadtest+${Date.now()}@tietide.local`;

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    // Acceptance criterion: API read endpoints p95 < 200ms
    'http_req_duration{kind:read}': ['p(95)<200'],
    // Sanity guards
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

function jsonHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function buildSampleWorkflow() {
  return {
    name: 'Loadtest Read Workflow',
    description: 'Used by k6 api-read scenario',
    definition: {
      nodes: [
        { id: 'n1', type: 'manual-trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} },
        {
          id: 'n2',
          type: 'http-request',
          name: 'Fetch',
          position: { x: 200, y: 0 },
          config: { method: 'GET', url: 'https://example.com', headers: {} },
        },
        {
          id: 'n3',
          type: 'conditional',
          name: 'Check',
          position: { x: 400, y: 0 },
          config: { condition: '{{n2.data.statusCode}} === 200' },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    },
  };
}

export function setup() {
  // Register a fresh user (idempotent: ignore conflict)
  http.post(
    `${BASE_URL}/v1/auth/register`,
    JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'Loadtest User' }),
    { headers: jsonHeaders() },
  );

  const loginRes = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: jsonHeaders() },
  );
  if (loginRes.status !== 201 && loginRes.status !== 200) {
    throw new Error(`Login failed (${loginRes.status}): ${loginRes.body}`);
  }
  const token = loginRes.json('accessToken');

  const wfRes = http.post(`${BASE_URL}/v1/workflows`, JSON.stringify(buildSampleWorkflow()), {
    headers: jsonHeaders(token),
  });
  if (wfRes.status !== 201) {
    throw new Error(`Workflow create failed (${wfRes.status}): ${wfRes.body}`);
  }
  const workflowId = wfRes.json('id');

  return { token, workflowId };
}

export default function (data) {
  const tags = { kind: 'read' };

  group('GET /v1/health', () => {
    const r = http.get(`${BASE_URL}/v1/health`, { tags });
    check(r, { 'health 200': (res) => res.status === 200 });
  });

  group('GET /v1/workflows', () => {
    const r = http.get(`${BASE_URL}/v1/workflows`, {
      headers: jsonHeaders(data.token),
      tags,
    });
    check(r, {
      'list 200': (res) => res.status === 200,
      'list is array': (res) => Array.isArray(res.json()),
    });
  });

  group('GET /v1/workflows/:id', () => {
    const r = http.get(`${BASE_URL}/v1/workflows/${data.workflowId}`, {
      headers: jsonHeaders(data.token),
      tags,
    });
    check(r, {
      'detail 200': (res) => res.status === 200,
      'detail has id': (res) => res.json('id') === data.workflowId,
    });
  });

  group('GET /v1/auth/me', () => {
    const r = http.get(`${BASE_URL}/v1/auth/me`, {
      headers: jsonHeaders(data.token),
      tags,
    });
    check(r, { 'me 200': (res) => res.status === 200 });
  });

  sleep(1);
}
