# Load Tests (k6)

This directory holds the load-test scripts referenced by issue #36.

## Scripts

| Script                                             | What it measures                                                                  | Threshold                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| [`k6/api-read.js`](k6/api-read.js)                 | Latency of read endpoints (`/health`, `/workflows`, `/workflows/:id`, `/auth/me`) | `http_req_duration{kind:read} p(95) < 200ms` |
| [`k6/workflow-execute.js`](k6/workflow-execute.js) | End-to-end latency to execute a 3-node workflow (trigger → terminal state)        | `workflow_execution_duration p(95) < 5000ms` |

Both scripts are self-seeding: `setup()` registers a throwaway user, logs in, and creates the workflow they exercise. Re-runs use a per-run email so previous data is not reused.

## Prerequisites

1. **k6** installed locally — <https://grafana.com/docs/k6/latest/set-up/install-k6/>.
2. The full TieTide stack running:
   ```bash
   docker compose -f infra/docker/docker-compose.yml up -d
   pnpm --filter @tietide/api dev
   pnpm --filter @tietide/worker dev
   ```
3. API reachable on `http://localhost:3030` (override with `BASE_URL`).

## Running

From the repo root:

```bash
# API read endpoints
pnpm loadtest:api

# 3-node workflow execution
pnpm loadtest:workflow
```

Or invoke `k6` directly:

```bash
k6 run infra/load/k6/api-read.js
k6 run infra/load/k6/workflow-execute.js
```

### Useful overrides

```bash
BASE_URL=http://staging.tietide.local k6 run infra/load/k6/api-read.js
VUS=20 DURATION=2m k6 run infra/load/k6/api-read.js
POLL_INTERVAL_MS=100 POLL_TIMEOUT_MS=15000 k6 run infra/load/k6/workflow-execute.js
```

## Interpreting results

- A **green run** ends with `✓` next to every threshold; thresholds map directly to the NFRs in issue #36.
- The custom `workflow_execution_duration` Trend is the metric that backs the workflow-execute threshold; it captures the wall-clock time between trigger and terminal status.
- The `http_req_failed` and `checks` thresholds catch silent regressions where the API answers fast but with the wrong status.

## Recording a run

Append the summary to [`docs/performance/README.md`](../../docs/performance/README.md#runs) using the table template provided there. Include date, commit SHA, hardware, and the p95 metrics.
