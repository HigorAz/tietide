# Performance Testing & Results

Tracking the NFRs from issue #36 — Sprint S8 (Quality and Performance).

## Targets

| Scope                                                                                                  | Metric                       | Target              |
| ------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------- |
| API read endpoints (`GET /v1/health`, `GET /v1/workflows`, `GET /v1/workflows/:id`, `GET /v1/auth/me`) | `http_req_duration` p95      | **< 200 ms**        |
| Simple 3-node workflow execution (manual-trigger → http-request → conditional)                         | trigger → terminal-state p95 | **< 5 s** (5000 ms) |

## How thresholds are enforced

The k6 scripts in [`infra/load/k6/`](../../infra/load/k6) declare the targets above directly inside `options.thresholds`. A run is green only when every threshold passes; CI / future automation can rely on the k6 exit code (non-zero on any breach).

A unit test ([`apps/api/src/common/perf/load-scripts.spec.ts`](../../apps/api/src/common/perf/load-scripts.spec.ts)) acts as a regression guard: it fails if either script is removed, renamed, or its threshold is loosened away from `p(95)<200` / `p(95)<5000`.

## How to run

See the [load test runbook](../../infra/load/README.md). Quick version:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
pnpm --filter @tietide/api dev
pnpm --filter @tietide/worker dev

pnpm loadtest:api        # reads
pnpm loadtest:workflow   # 3-node execution
```

## Runs

Append a row each time the load tests are run on a stable build. Keep the most recent at the top.

| Date      | Commit    | Environment            | API read p95 | Workflow exec p95 | Status | Notes                                         |
| --------- | --------- | ---------------------- | ------------ | ----------------- | ------ | --------------------------------------------- |
| _pending_ | _pending_ | local Docker (8C/16GB) | _TBD_ ms     | _TBD_ ms          | _TBD_  | Baseline run with default `VUS=10` / `VUS=5`. |

> First run is intentionally pending: load tests require the live stack and are owned by the operator running the campaign. The acceptance criteria are encoded in the k6 thresholds, so the run is self-validating.

## Optimization log

When a run breaches a threshold, capture the diagnosis and the fix here. Empty until the first regression.

| Date | Threshold breached | Observed p95 | Root cause | Fix |
| ---- | ------------------ | ------------ | ---------- | --- |
| —    | —                  | —            | —          | —   |

## Useful follow-ups

- Wire `pnpm loadtest:*` into CI as a nightly job (skipped on PRs to keep CI fast).
- Forward k6 metrics to Prometheus/Grafana when the observability stack lands (Sprint S9).
- Add a webhook-trigger scenario once HMAC throughput becomes a concern.
