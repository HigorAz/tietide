// k6 load test — TieTide simple 3-node workflow execution
// Issue #36 — NFR: simple workflow execution p95 < 5s (5000ms)
//
// Run:
//   k6 run infra/load/k6/workflow-execute.js
//
// Optional env:
//   BASE_URL          (default: http://localhost:3030)
//   LOADTEST_EMAIL    (default: loadtest+<rand>@tietide.local)
//   LOADTEST_PASSWORD (default: loadtest-password-1234)
//   VUS               (default: 5)
//   DURATION          (default: 1m)
//   POLL_INTERVAL_MS  (default: 200)
//   POLL_TIMEOUT_MS   (default: 10000)

import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3030';
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || '1m';
const POLL_INTERVAL_MS = Number(__ENV.POLL_INTERVAL_MS || 200);
const POLL_TIMEOUT_MS = Number(__ENV.POLL_TIMEOUT_MS || 10000);

const PASSWORD = __ENV.LOADTEST_PASSWORD || 'loadtest-password-1234';
const EMAIL = __ENV.LOADTEST_EMAIL || `loadtest+${Date.now()}@tietide.local`;

// Custom metric capturing trigger -> terminal-state latency.
const workflowExecutionDuration = new Trend('workflow_execution_duration', true);

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    // Acceptance criterion: simple 3-node workflow p95 < 5s
    workflow_execution_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.02'],
    checks: ['rate>0.98'],
  },
};

function jsonHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

// Simple 3-node workflow: trigger -> http-request -> conditional.
// Kept synthetic so the load test does not depend on external services.
function build3NodeWorkflow() {
  return {
    name: 'Loadtest 3-Node Workflow',
    description: 'Used by k6 workflow-execute scenario',
    definition: {
      nodes: [
        { id: 'n1', type: 'manual-trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} },
        {
          id: 'n2',
          type: 'http-request',
          name: 'Fetch',
          position: { x: 200, y: 0 },
          config: { method: 'GET', url: 'http://localhost:3030/v1/health', headers: {} },
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
    fail(`Login failed (${loginRes.status}): ${loginRes.body}`);
  }
  const token = loginRes.json('accessToken');

  const wfRes = http.post(`${BASE_URL}/v1/workflows`, JSON.stringify(build3NodeWorkflow()), {
    headers: jsonHeaders(token),
  });
  if (wfRes.status !== 201) {
    fail(`Workflow create failed (${wfRes.status}): ${wfRes.body}`);
  }
  return { token, workflowId: wfRes.json('id') };
}

const TERMINAL_STATES = ['SUCCESS', 'FAILED', 'CANCELLED'];

function pollUntilTerminal(executionId, token) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const r = http.get(`${BASE_URL}/v1/executions/${executionId}`, {
      headers: jsonHeaders(token),
      tags: { kind: 'poll' },
    });
    if (r.status === 200) {
      const status = r.json('status');
      if (TERMINAL_STATES.indexOf(status) !== -1) return status;
    }
    sleep(POLL_INTERVAL_MS / 1000);
  }
  return 'TIMEOUT';
}

export default function (data) {
  const start = Date.now();

  const triggerRes = http.post(
    `${BASE_URL}/v1/workflows/${data.workflowId}/execute`,
    JSON.stringify({ triggerData: { source: 'k6-load' } }),
    { headers: jsonHeaders(data.token), tags: { kind: 'execute' } },
  );

  const triggered = check(triggerRes, {
    'execute 202': (res) => res.status === 202,
    'execute returns id': (res) => typeof res.json('id') === 'string',
  });
  if (!triggered) {
    return;
  }

  const executionId = triggerRes.json('id');
  const finalStatus = pollUntilTerminal(executionId, data.token);

  const elapsed = Date.now() - start;
  workflowExecutionDuration.add(elapsed);

  check(finalStatus, {
    'workflow reached terminal state': (s) => TERMINAL_STATES.indexOf(s) !== -1,
    'workflow did not time out': (s) => s !== 'TIMEOUT',
  });
}
