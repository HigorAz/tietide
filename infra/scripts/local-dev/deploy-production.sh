#!/usr/bin/env bash
# Pull latest Production branch into ~/tietide and apply changes.
# Idempotent — safe to run repeatedly; no-op when there's nothing new.
# Companion to docs/guides/continuous-deployment.md.

set -euo pipefail

REPO_DIR="${HOME}/tietide"
BRANCH="Production"

# Where to publish the SHA prod is currently serving. The API reads the same path
# (DEPLOYED_SHA_FILE) and exposes it on /v1/health/live; the promote-to-production
# workflow polls that endpoint to confirm this deploy actually went live.
MARKER_FILE="${DEPLOYED_SHA_FILE:-${HOME}/tietide-scripts/deployed-sha}"

write_marker() {
  mkdir -p "$(dirname "${MARKER_FILE}")"
  printf '%s\n' "$1" > "${MARKER_FILE}"
  echo "→ Marked deployed SHA ${1:0:7} → ${MARKER_FILE}"
}

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# pnpm is a standalone install, NOT in nvm's bin — so the systemd service's
# minimal PATH can't find it and every rebuild dies with "pnpm: command not
# found". Put it on PATH explicitly (idempotent).
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
case ":$PATH:" in *":$PNPM_HOME/bin:"*) ;; *) export PATH="$PNPM_HOME/bin:$PATH" ;; esac

# Rebuild all workspace packages + apps (prod serves built artifacts).
rebuild_all() {
  # Regenerate the Prisma client first so the api typechecks against the schema
  # that was just pulled (a new model/migration would otherwise break `nest build`
  # against a stale client).
  pnpm --filter @tietide/api exec prisma generate
  pnpm -r --filter "./packages/**" build
  pnpm --filter @tietide/api build
  pnpm --filter @tietide/worker build
  pnpm --filter @tietide/spa build
}

# Restarting the prod services from here is safe when either:
#   - we're run by hand (not under systemd) — nothing will reap our setsid'd
#     services; or
#   - we're under systemd but the unit's KillMode won't kill children when the
#     oneshot exits. The default control-group WOULD, taking the site down.
restart_is_safe() {
  [ -z "${INVOCATION_ID:-}" ] && return 0
  local km
  km=$(systemctl show tietide-deploy.service --property=KillMode --value 2>/dev/null || true)
  [ "$km" = "process" ] || [ "$km" = "none" ]
}

cd "${REPO_DIR}"

# Switch to Production if we're somewhere else (main, feature, detached, etc.)
if [ "$(git rev-parse --abbrev-ref HEAD)" != "${BRANCH}" ]; then
  echo "→ Switching to ${BRANCH} branch"
  git fetch origin "${BRANCH}":"${BRANCH}" 2>/dev/null || true
  git checkout "${BRANCH}"
fi

OLD_HEAD=$(git rev-parse HEAD)

git fetch origin "${BRANCH}" --prune --quiet
git pull --ff-only origin "${BRANCH}"

NEW_HEAD=$(git rev-parse HEAD)

# The marker records the SHA prod last *successfully* deployed — not merely what git
# points at. A deploy that fails AFTER `git pull` (e.g. the DB is unreachable when
# `prisma migrate deploy` runs) leaves HEAD advanced but the site broken. The old code
# keyed "nothing to do" off git movement alone, so the very next tick saw OLD==NEW,
# declared success, wrote the marker, and masked the outage permanently. Key it off the
# marker instead, so the timer keeps re-running the deploy until it actually lands.
LAST_DEPLOYED=""
[ -f "${MARKER_FILE}" ] && LAST_DEPLOYED=$(tr -d '[:space:]' < "${MARKER_FILE}" 2>/dev/null || true)

if [ -n "${LAST_DEPLOYED}" ] && [ "${LAST_DEPLOYED}" = "${NEW_HEAD}" ]; then
  echo "✓ Already deployed (${NEW_HEAD:0:7}). Nothing to do."
  exit 0
fi

# Detect what changed since the last *successful* deploy, not just this run's pull, so
# a retry after a failed deploy still applies the migrations/code it owes. Fall back to
# this run's pre-pull HEAD when the marker is missing or no longer a valid commit
# (fresh box / first run after the marker was introduced).
DIFF_BASE="${LAST_DEPLOYED}"
if [ -z "${DIFF_BASE}" ] || ! git cat-file -e "${DIFF_BASE}^{commit}" 2>/dev/null; then
  DIFF_BASE="${OLD_HEAD}"
fi

if [ "${DIFF_BASE}" = "${NEW_HEAD}" ]; then
  echo "→ Code already at ${NEW_HEAD:0:7}; (re)publishing marker only."
else
  echo "→ Deploying ${DIFF_BASE:0:7} → ${NEW_HEAD:0:7} (last live: ${LAST_DEPLOYED:-none})"
fi

# pnpm install only if pnpm-lock.yaml changed
if ! git diff --quiet "${DIFF_BASE}" "${NEW_HEAD}" -- pnpm-lock.yaml; then
  echo "→ Lockfile changed — running pnpm install"
  pnpm install --frozen-lockfile
else
  echo "  Lockfile unchanged — skipping pnpm install"
fi

# Apply Prisma migrations only if any landed
if ! git diff --quiet "${DIFF_BASE}" "${NEW_HEAD}" -- apps/api/prisma/migrations/; then
  echo "→ New Prisma migrations — applying"
  pnpm --filter @tietide/api exec prisma migrate deploy
else
  echo "  No new migrations — skipping prisma migrate"
fi

# The AI service is a Docker image built from apps/ai — the Node rebuild_all below
# doesn't touch the Python service, and the SKIP_BUILD=1 restart path runs
# `docker compose up` WITHOUT --build, so apps/ai dependency changes never reach prod.
# Rebuild + recreate just the ai container when its source/deps change. Docker-managed
# containers aren't reaped by this oneshot's cgroup, so it's safe under the systemd timer.
if ! git diff --quiet "${DIFF_BASE}" "${NEW_HEAD}" -- apps/ai/; then
  echo "→ apps/ai changed — rebuilding + recreating the AI Docker image"
  docker compose -f infra/docker/docker-compose.yml --env-file .env up -d --build ai
else
  echo "  apps/ai unchanged — AI image rebuild skipped"
fi

# Rebuild artifacts + restart when running CODE changed. Prod serves built
# output (`node dist/main`, `vite preview` on dist/) with NO hot reload, so a
# pull alone never goes live — dist/ must be rebuilt and the services restarted.
# Tracks whether NEW_HEAD is actually the code now being served. Stays true unless
# we rebuilt but couldn't safely restart (old build still live) — in which case the
# marker must NOT advance, or the promote workflow would go green prematurely.
SERVING_NEW_HEAD=true

if ! git diff --quiet "${DIFF_BASE}" "${NEW_HEAD}" -- apps/ packages/; then
  echo "→ App/package code changed — rebuilding artifacts (services stay up during build)"
  rebuild_all

  if restart_is_safe; then
    echo "→ Restarting prod services to load the new build (brief downtime)"
    echo n | "${HOME}/tietide-scripts/stop-all.sh"
    SKIP_BUILD=1 "${HOME}/tietide-scripts/start-prod.sh"
  else
    SERVING_NEW_HEAD=false
    echo ""
    echo "⚠ Rebuilt, but NOT auto-restarting under the systemd timer:"
    echo "  tietide-deploy.service has KillMode=control-group, which would reap the"
    echo "  freshly-started services when this oneshot exits — taking the site down."
    echo "  Enable hands-off restarts by setting KillMode=process (see"
    echo "  docs/guides/continuous-deployment.md), or restart manually now:"
    echo "      ~/tietide-scripts/stop-all.sh && ~/tietide-scripts/start-prod.sh"
  fi
else
  echo "  No app/package code changed — nothing to rebuild or restart"
fi

echo ""
echo "Files changed since last live (${DIFF_BASE:0:7} → ${NEW_HEAD:0:7}):"
git diff --stat "${DIFF_BASE}" "${NEW_HEAD}"
echo ""
# Publish the now-serving SHA so the promote-to-production workflow can confirm the
# deploy landed. ONLY advances after a successful rebuild+restart (or a clean no-op),
# so a failed deploy leaves the marker at the last good SHA and the next timer tick
# re-runs the deploy until it converges. Skipped when we rebuilt but couldn't restart —
# the marker then stays put until a manual restart, correctly reflecting what's live.
if [ "${SERVING_NEW_HEAD}" = "true" ]; then
  write_marker "${NEW_HEAD}"
else
  echo "→ Marker left at ${LAST_DEPLOYED:-unknown} — restart pending, new build not yet live"
fi
echo "✓ Deploy complete at $(date -Iseconds)"
