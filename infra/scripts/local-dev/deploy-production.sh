#!/usr/bin/env bash
# Pull latest Production branch into ~/tietide and apply changes.
# Idempotent — safe to run repeatedly; no-op when there's nothing new.
# Companion to docs/guides/continuous-deployment.md.

set -euo pipefail

REPO_DIR="${HOME}/tietide"
BRANCH="Production"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# pnpm is a standalone install, NOT in nvm's bin — so the systemd service's
# minimal PATH can't find it and every rebuild dies with "pnpm: command not
# found". Put it on PATH explicitly (idempotent).
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
case ":$PATH:" in *":$PNPM_HOME/bin:"*) ;; *) export PATH="$PNPM_HOME/bin:$PATH" ;; esac

# Rebuild all workspace packages + apps (prod serves built artifacts).
rebuild_all() {
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

if [ "${OLD_HEAD}" = "${NEW_HEAD}" ]; then
  echo "✓ Already up to date (${NEW_HEAD:0:7}). Nothing to do."
  exit 0
fi

echo "→ Updated ${OLD_HEAD:0:7} → ${NEW_HEAD:0:7}"

# pnpm install only if pnpm-lock.yaml changed
if ! git diff --quiet "${OLD_HEAD}" "${NEW_HEAD}" -- pnpm-lock.yaml; then
  echo "→ Lockfile changed — running pnpm install"
  pnpm install --frozen-lockfile
else
  echo "  Lockfile unchanged — skipping pnpm install"
fi

# Apply Prisma migrations only if any landed
if ! git diff --quiet "${OLD_HEAD}" "${NEW_HEAD}" -- apps/api/prisma/migrations/; then
  echo "→ New Prisma migrations — applying"
  pnpm --filter @tietide/api exec prisma migrate deploy
else
  echo "  No new migrations — skipping prisma migrate"
fi

# Rebuild artifacts + restart when running CODE changed. Prod serves built
# output (`node dist/main`, `vite preview` on dist/) with NO hot reload, so a
# pull alone never goes live — dist/ must be rebuilt and the services restarted.
if ! git diff --quiet "${OLD_HEAD}" "${NEW_HEAD}" -- apps/ packages/; then
  echo "→ App/package code changed — rebuilding artifacts (services stay up during build)"
  rebuild_all

  if restart_is_safe; then
    echo "→ Restarting prod services to load the new build (brief downtime)"
    echo n | "${HOME}/tietide-scripts/stop-all.sh"
    SKIP_BUILD=1 "${HOME}/tietide-scripts/start-prod.sh"
  else
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
echo "Files changed in this deploy:"
git diff --stat "${OLD_HEAD}" "${NEW_HEAD}"
echo ""
echo "✓ Deploy complete at $(date -Iseconds)"
