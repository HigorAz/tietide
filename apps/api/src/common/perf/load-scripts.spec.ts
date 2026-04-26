import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const repoRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const apiReadScript = resolve(repoRoot, 'infra', 'load', 'k6', 'api-read.js');
const workflowExecScript = resolve(repoRoot, 'infra', 'load', 'k6', 'workflow-execute.js');
const perfDoc = resolve(repoRoot, 'docs', 'performance', 'README.md');
const loadReadme = resolve(repoRoot, 'infra', 'load', 'README.md');

describe('Performance load test scripts (issue #36)', () => {
  describe('infra/load/k6/api-read.js', () => {
    it('should exist as a committed k6 script', () => {
      expect(existsSync(apiReadScript)).toBe(true);
    });

    it('should declare a p(95)<200ms threshold for read endpoints', () => {
      const content = readFileSync(apiReadScript, 'utf-8');
      expect(content).toMatch(/p\(95\)\s*<\s*200/);
    });

    it('should be a valid k6 script (imports k6/http and exports default function)', () => {
      const content = readFileSync(apiReadScript, 'utf-8');
      expect(content).toMatch(/from\s+['"]k6\/http['"]/);
      expect(content).toMatch(/export\s+default\s+function/);
    });

    it('should exercise the documented read endpoints (health, workflows list, workflow detail)', () => {
      const content = readFileSync(apiReadScript, 'utf-8');
      expect(content).toContain('/v1/health');
      expect(content).toContain('/v1/workflows');
    });

    it('should assert response status with check() calls', () => {
      const content = readFileSync(apiReadScript, 'utf-8');
      expect(content).toMatch(/check\s*\(/);
    });
  });

  describe('infra/load/k6/workflow-execute.js', () => {
    it('should exist as a committed k6 script', () => {
      expect(existsSync(workflowExecScript)).toBe(true);
    });

    it('should declare a p(95)<5000ms threshold for workflow execution', () => {
      const content = readFileSync(workflowExecScript, 'utf-8');
      expect(content).toMatch(/p\(95\)\s*<\s*5000/);
    });

    it('should be a valid k6 script (imports k6/http and exports default function)', () => {
      const content = readFileSync(workflowExecScript, 'utf-8');
      expect(content).toMatch(/from\s+['"]k6\/http['"]/);
      expect(content).toMatch(/export\s+default\s+function/);
    });

    it('should target the workflow execute endpoint', () => {
      const content = readFileSync(workflowExecScript, 'utf-8');
      expect(content).toMatch(/\/v1\/workflows\/[^/]+\/execute/);
    });

    it('should seed a 3-node workflow definition', () => {
      const content = readFileSync(workflowExecScript, 'utf-8');
      expect(content).toMatch(/nodes/);
      const nodeMatches = content.match(/\btype\s*:\s*['"][^'"]+['"]/g) ?? [];
      expect(nodeMatches.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Documentation', () => {
    it('should publish a results document at docs/performance/README.md', () => {
      expect(existsSync(perfDoc)).toBe(true);
      const content = readFileSync(perfDoc, 'utf-8');
      expect(content).toMatch(/p95/i);
      expect(content).toMatch(/200\s*ms/);
      expect(content).toMatch(/5\s*s|5000\s*ms/);
    });

    it('should publish a load-test runbook at infra/load/README.md', () => {
      expect(existsSync(loadReadme)).toBe(true);
      const content = readFileSync(loadReadme, 'utf-8');
      expect(content.toLowerCase()).toContain('k6');
    });
  });
});
