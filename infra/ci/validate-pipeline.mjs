#!/usr/bin/env node
/**
 * Pipeline contract test for issue #37.
 *
 * Validates that the CI/CD pipeline meets the acceptance criteria:
 *   - Lint + typecheck on every PR
 *   - Run all tests with coverage
 *   - Build Docker images
 *   - Push images to GHCR on merge to main
 *
 * Run with: node infra/ci/validate-pipeline.mjs
 * Exit 0 = all checks pass, exit 1 = at least one failure.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const failures = [];
const checks = [];

function check(name, condition, detail = '') {
  checks.push({ name, ok: !!condition, detail });
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function read(relPath) {
  const full = resolve(repoRoot, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

// --- CI workflow checks -----------------------------------------------------
const ci = read('.github/workflows/ci.yml');
check('ci.yml exists', ci !== null, '.github/workflows/ci.yml');

if (ci) {
  check('triggers on pull_request', /\bpull_request:/.test(ci));
  check('triggers on push to main', /\bpush:[\s\S]*?branches:\s*\[\s*main\s*\]/.test(ci));
  check('runs lint', /\brun:\s*pnpm[^\n]*\blint\b/.test(ci) || /pnpm[^\n]*run\s+lint/.test(ci));
  check('runs typecheck', /\btypecheck\b/.test(ci));
  check('runs tests with coverage', /test:coverage|--coverage/.test(ci));
  check('uploads coverage artifact', /upload-artifact[\s\S]*coverage/i.test(ci));
}

// --- Image publish workflow checks -----------------------------------------
const publish = read('.github/workflows/publish-images.yml');
check(
  'publish-images workflow exists',
  publish !== null,
  '.github/workflows/publish-images.yml',
);

if (publish) {
  check('publish triggers on push to main', /\bpush:[\s\S]*?branches:[\s\S]*?main/.test(publish));
  check(
    'publish authenticates to ghcr.io',
    /docker\/login-action[\s\S]*registry:\s*ghcr\.io/.test(publish),
  );
  check(
    'publish uses GITHUB_TOKEN',
    /password:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(publish),
  );
  // Apps may be enumerated as a build matrix or as separate jobs — accept either.
  const matrixMatch = publish.match(/matrix:\s*\n[\s\S]*?app:\s*\[([^\]]+)\]/);
  const matrixApps = matrixMatch
    ? matrixMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/['"]/g, ''))
    : [];
  for (const app of ['api', 'worker', 'spa', 'ai']) {
    const inMatrix = matrixApps.includes(app);
    const inExplicitTag = new RegExp(`tietide-${app}\\b|/${app}\\b`).test(publish);
    check(
      `publish references ${app} image`,
      inMatrix || inExplicitTag,
      `image tag for ${app}`,
    );
  }
  check(
    'publish has packages: write permission',
    /permissions:[\s\S]*packages:\s*write/.test(publish),
  );
  check('publish step pushes images', /push:\s*true/.test(publish));
}

// --- Dockerfiles ------------------------------------------------------------
const dockerApps = [
  { app: 'api', path: 'apps/api/Dockerfile' },
  { app: 'worker', path: 'apps/worker/Dockerfile' },
  { app: 'spa', path: 'apps/spa/Dockerfile' },
  { app: 'ai', path: 'apps/ai/Dockerfile' },
];

for (const { app, path } of dockerApps) {
  const df = read(path);
  check(`${path} exists`, df !== null);
  if (!df) continue;

  // Multi-stage: at least 2 FROM statements.
  const fromCount = (df.match(/^FROM\b/gim) || []).length;
  check(`${app} Dockerfile is multi-stage`, fromCount >= 2, `${fromCount} FROM stage(s)`);

  // Non-root: a USER directive that is not root.
  const userMatch = df.match(/^USER\s+(\S+)/gim) || [];
  const lastUser = userMatch.length ? userMatch[userMatch.length - 1].split(/\s+/)[1] : null;
  check(
    `${app} Dockerfile drops to non-root`,
    lastUser !== null && lastUser !== 'root' && lastUser !== '0',
    lastUser ? `final USER=${lastUser}` : 'no USER directive',
  );

  check(`${app} Dockerfile sets HEALTHCHECK or EXPOSE`, /^(HEALTHCHECK|EXPOSE)\b/im.test(df));
}

// --- .dockerignore ---------------------------------------------------------
const ignore = read('.dockerignore');
check('.dockerignore exists', ignore !== null);
if (ignore) {
  for (const pattern of ['node_modules', '.git', '.env', 'coverage', 'dist']) {
    check(`.dockerignore excludes ${pattern}`, ignore.split(/\r?\n/).some((l) => l.trim() === pattern || l.trim().startsWith(`${pattern}/`) || l.trim() === `**/${pattern}`));
  }
}

// --- Report -----------------------------------------------------------------
const passed = checks.filter((c) => c.ok).length;
const total = checks.length;
console.log(`\nCI pipeline validation: ${passed}/${total} checks passed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('All acceptance criteria satisfied.');
process.exit(0);
