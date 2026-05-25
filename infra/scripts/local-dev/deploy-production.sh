#!/usr/bin/env bash
# Pull latest Production branch into ~/tietide and apply changes.
# Idempotent — safe to run repeatedly; no-op when there's nothing new.
# Companion to docs/guides/continuous-deployment.md.

set -euo pipefail

REPO_DIR="${HOME}/tietide"
BRANCH="Production"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

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

# Rebuild every workspace package (in dep order) if anything under packages/ changed.
# Catches new packages added to the workspace (e.g. @tietide/crypto) without needing
# to edit this script every time.
if ! git diff --quiet "${OLD_HEAD}" "${NEW_HEAD}" -- packages/; then
  echo "→ Shared packages changed — rebuilding all in topological order"
  pnpm -r --filter "./packages/**" build
fi

echo ""
echo "Files changed in this deploy:"
git diff --stat "${OLD_HEAD}" "${NEW_HEAD}"
echo ""
echo "✓ Deploy complete at $(date -Iseconds)"
echo ""
echo "Next: glance at your pnpm dev windows."
echo "  - HMR catches most code changes automatically."
echo "  - Nest module / .env / prisma schema changes need a manual restart:"
echo "      ~/tietide-scripts/stop-all.sh && ~/tietide-scripts/start-dev.sh"
