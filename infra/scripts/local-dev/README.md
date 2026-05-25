# Local-dev lifecycle scripts

Bash scripts that bring the TieTide stack up and down on the maintainer's
WSL (Ubuntu) box. They are environment-specific (they assume the layout below),
so they live here separately from the portable ops scripts in
`infra/scripts/` (`backup-postgres.sh`, `restore-postgres.sh`,
`healthcheck-alert.sh`).

## Assumed layout

| Path                      | What                                          |
| ------------------------- | --------------------------------------------- |
| `~/tietide`               | the repo clone the services run from          |
| `~/tietide-scripts/`      | where these scripts are deployed and run from |
| `~/tietide-scripts/logs/` | per-service logs + `*.pid` files              |

The runtime copy lives at `~/tietide-scripts/`; this directory is the tracked
source of truth. Sync after pulling changes, e.g.:

```bash
cp infra/scripts/local-dev/*.sh ~/tietide-scripts/ && chmod +x ~/tietide-scripts/*.sh
# or symlink so they never drift:
# for f in infra/scripts/local-dev/*.sh; do ln -sf "$PWD/$f" ~/tietide-scripts/; done
```

## Scripts

| Script                 | Purpose                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `start-dev.sh`         | Docker deps + the 3 services via `pnpm … dev` (HMR), prod ports 3030/5173                                 |
| `start-prod.sh`        | Build every workspace package + run the built artifacts (`NODE_ENV=production`)                           |
| `start-test.sh`        | Parallel TEST stack on 3031/5174 using `tietide_test` DB + `valkey-test`; needs `setup-test-env.sh` first |
| `stop-all.sh`          | Stop the prod stack (api/worker/spa); prompts about Docker deps                                           |
| `stop-test.sh`         | Stop only the test stack (scoped to 3031/5174)                                                            |
| `status.sh`            | Show both stacks + Docker deps + Cloudflare tunnel + health checks                                        |
| `setup-test-env.sh`    | One-time: create `tietide_test` DB, `valkey-test`, and `~/tietide/.env.test`                              |
| `deploy-production.sh` | Fast-forward the `Production` branch and apply lockfile/migration/package changes                         |

## Process management (why `setsid`)

The actual API/worker listener runs as `node dist/main`, a **grandchild** of the
pidfile-tracked launcher (`bash -c` → `pnpm` → `node`). The start scripts launch
each service with `setsid`, so it becomes its own **process-group leader** and
the recorded PID is that group's leader. The stop scripts then:

1. **group-kill** the leader (`kill -- -$pid`) when the PID is a group leader,
2. recursively **tree-kill** every descendant (covers non-`setsid` launches),
3. **port-kill** anything still listening on the stack's ports as a backstop —
   prod-scoped (3030/5173) vs test-scoped (3031/5174) so the two stacks never
   stomp on each other.

Without this the listener was orphaned on every stop and kept its port, leaking
a `node` process per run.

## Notes

- The Cloudflare tunnel is a separate systemd service:
  `sudo systemctl stop cloudflared`.
- `setup-test-env.sh` contains the **local** dev DB credential
  (`tietide:tietide_secret@localhost`) — the same one in `.env` / docker-compose,
  not a production secret. Real secrets live only in `.env` / `.env.test`, which
  are git-ignored.
