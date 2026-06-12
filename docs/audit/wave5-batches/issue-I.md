> Part of the **2026-06-11 adversarial audit (Wave 5)**. Full tracker: `docs/audit/AUDIT-2026-06-11.md`. Findings here survived independent adversarial verification.

**4 findings** in this batch. Fix each via TDD (failing regression test first → minimal fix → atomic commit, one finding = one commit). Branch: `feature/audit-wave5-remediation` (or a fresh branch off it).

> ⚠️ Repo gotchas: the husky pre-commit hook is broken (`Exec format error`) — run `npx lint-staged` then `git commit --no-verify`. Never run tests/migrations against `localhost:5432` (production Postgres). Build `@tietide/shared`+`@tietide/sdk`+`@tietide/crypto` before `tsc --noEmit`. No `Co-Authored-By: Claude` trailer.

---

### W5.8 — MEDIUM / security

**Per-route throttle env knobs (auth/execute/AI) are dead config — never wired into controllers; runbook tells operators to turn a dead knob**

- **Location:** `apps/api/src/common/throttler/throttler.config.ts:36-55; apps/api/src/auth/auth.controller.ts:57-221; apps/api/src/executions/executions.controller.ts:46-51; apps/api/src/workflows/workflow-documentation.controller.ts:43-48; docs: runbook.md:329, deployment.md:103-104`
- **Problem:** Merged from D1-1 (Auth) and RL-1. buildAuthThrottleSettings/buildExecuteThrottleSettings/buildAiThrottleSettings read THROTTLE*AUTH_LIMIT/TTL, THROTTLE_EXECUTE_LIMIT/TTL, THROTTLE_AI_LIMIT/TTL from config but are referenced only by their own .spec files — no controller imports them. The controllers hardcode the DEFAULT** constants directly inside static @Throttle({...}) decorators (evaluated at module load, no DI access), so the auth limit is frozen at 5/60s, execute at 20/min, AI at 3/min regardless of env. Only the global THROTTLE_TTL_MS/THROTTLE_LIMIT are env-wired. runbook.md:329 instructs operators during a corporate-NAT lockout to 'raise THROTTLE_AUTH_LIMIT (e.g., 20) and restart' — a documented incident recovery that is a complete no-op; an operator wanting to tighten limits under attack also cannot. The passing config specs give false confidence the wiring works. Not an open DoS (safe defaults hold), but a regressed/misleading documented security control. Fix: resolve the build*ThrottleSettings via ConfigService at module init (or a custom guard) and feed them into the @Throttle decorators, OR delete the unused builders + env vars and correct the docs.
- **Suggested fix:** Wire build\*ThrottleSettings(config) into the @Throttle decorators via a module-level factory/custom guard, or remove the dead builders and env vars and fix runbook.md/deployment.md so operators aren't told to turn a dead knob.

- [ ] Fixed (commit: \_\_\_\_)

### W5.19 — MEDIUM / security

**Production stateful services run via the dev compose — Postgres/Valkey published on all interfaces with default password and no Redis auth**

- **Location:** `infra/docker/docker-compose.yml:8-12,25-26,38-39; docs/deployment.md:418`
- **Problem:** The dev compose publishes Postgres '5432:5432', Valkey '6379:6379', Ollama '11434:11434', ChromaDB '8001:8000' with the 0.0.0.0-binding host-port form (no 127.0.0.1: prefix). Postgres falls back to POSTGRES_PASSWORD:-tietide_secret (the value committed in .env.example) and Valkey runs with no requirepass. Per the project's operating reality (host localhost:5432 routes to the WSL prod Postgres) and deployment.md:418's own warning, this dev compose is what provisions the live datastore. Anyone with host/LAN/WSL-network access reaches an unauthenticated Valkey (FLUSHALL → queue wipe, job forgery, DoS) and a Postgres protected only by a publicly-known default password (full tenant data + encrypted-secret dump; decryption still needs ENCRYPTION_MASTER_KEY but the dump is a breach). The Cloudflare tunnel only routes :3030/:5173, so there is no inbound internet path — exposure is host/LAN-adjacency only, capping below CRITICAL. A hardened docker-compose.prod.yml exists but is not the running deployment. Fix: run docker-compose.prod.yml on the prod host, or bind dev mappings to loopback, require a non-default POSTGRES_PASSWORD and a REDIS_PASSWORD, and add valkey --requirepass to any compose that exposes 6379.
- **Suggested fix:** Deploy via docker-compose.prod.yml (no host port publishing), or bind ports to 127.0.0.1, set a strong POSTGRES_PASSWORD/REDIS_PASSWORD, and enable Valkey --requirepass.

- [ ] Fixed (commit: \_\_\_\_)

### W5.51 — IMPROVEMENT / devops

**CI has no dependency-vulnerability gate (pnpm audit / image scan) and publishes a floating :latest GHCR tag with no SBOM/signing**

- **Location:** `.github/workflows/ci.yml:16-176; .github/workflows/publish-images.yml:21-74`
- **Problem:** Merged from DV-1 and DV-3. CLAUDE.md §10 mandates 'run pnpm audit every sprint close; block critical CVEs before merge', but no workflow runs pnpm audit or any container scanner (trivy/grype/snyk) — grep of .github/ returns zero gating steps. ci.yml runs install→lint→typecheck→test→build with no audit; publish-images.yml builds and pushes images (including the floating :latest tag) to GHCR on every push to main with no scan, no provenance/SBOM attestation, and no cosign signing, so a vulnerable transitive dependency or CVE base layer ships unblocked and a consumer pulling :latest gets a non-reproducible, unverifiable artifact. The package.json overrides block is a manual point-in-time patch list, not a continuous gate. Mitigating context: §10 frames audit as a manual sprint-close process, a manual pre-deploy pnpm audit is documented, and the prod compose builds locally so the GHCR images are off TieTide's own deploy path — verifiers split MEDIUM/LOW/IMPROVEMENT. Fix: add a blocking `pnpm audit --audit-level=high --prod` job to ci.yml, a Trivy/Grype scan step (exit 1 on CRITICAL) between build and push in publish-images.yml, provenance:true + sbom:true on the build-push step, cosign keyless signing, and prefer immutable digest/semver tags over mutable :latest. Optionally add a scheduled audit cron.
- **Suggested fix:** Add a blocking pnpm audit job and a Trivy/Grype image scan before push; enable provenance+SBOM attestation and cosign signing; prefer immutable digest/semver tags over :latest.

- [ ] Fixed (commit: \_\_\_\_)

### W5.52 — IMPROVEMENT / devops

**Prod compose `migrate` profile publishes the full builder image (source + dev deps + Prisma CLI, root) as tietide-api-builder:latest**

- **Location:** `infra/docker/docker-compose.prod.yml:159-175; apps/api/Dockerfile:3-39`
- **Problem:** The one-shot migrate service builds target: builder and tags it image: tietide-api-builder:latest. The builder stage contains the entire repo source tree, all dev dependencies, and the Prisma CLI, and runs as root (no USER directive — only the runtime stage drops privileges). It is profile-gated (profiles: ['migrate'], restart: 'no') so it never auto-starts, exposes no ports, and stays on the internal network, and an operator with docker run on the host already has effective root — so the concrete attack-surface delta is marginal (disk bloat + full source resident on disk). Verifiers rated LOW/IMPROVEMENT. This is a deliberate, documented tradeoff (the slim runtime strips the Prisma CLI). Fix: run migrations from the slim runtime by shipping prisma migration assets + a pinned prisma CLI into a dedicated lean migrate stage that runs as the non-root user, or prune the builder image after the migrate run; avoid tagging an intermediate builder as a reusable :latest image.
- **Suggested fix:** Add a dedicated lean, non-root migrate stage (prisma assets + pinned CLI) instead of reusing/tagging the full builder image, or prune tietide-api-builder:latest after migration.

- [ ] Fixed (commit: \_\_\_\_)
