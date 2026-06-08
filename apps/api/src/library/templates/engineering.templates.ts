import { NodeType } from '@tietide/shared';
import type { LibraryTemplate } from './types';

/**
 * Engineering templates. Replace the `your-org`/`your-repo` placeholders and the
 * Postgres query with your own once you bind the connections.
 */
export const ENGINEERING_TEMPLATES: readonly LibraryTemplate[] = [
  {
    slug: 'github-issue-ai-triage',
    name: 'GitHub issue AI triage',
    description:
      'When an issue is opened, Claude assigns a severity, a triage comment is posted back to GitHub, and high-severity issues fan out to Slack + Linear.',
    category: 'Engineering',
    definition: {
      nodes: [
        {
          id: 'trigger',
          type: NodeType.GITHUB_ISSUE_OPENED,
          name: 'GitHub: issue opened',
          position: { x: 80, y: 220 },
          config: { connectionId: '', owner: 'your-org', repo: 'your-repo' },
        },
        {
          id: 'triage',
          type: NodeType.CLAUDE_MESSAGES,
          name: 'Claude: assess severity',
          alias: 'triage',
          position: { x: 340, y: 220 },
          config: {
            connectionId: '',
            model: 'claude-sonnet-4-6',
            system:
              'You triage GitHub issues. Reply with ONLY compact JSON: {"severity":"high|medium|low","labels":["..."]}.',
            prompt:
              'Issue title: {{ trigger.body.issue.title }}\n\nBody:\n{{ trigger.body.issue.body }}',
            maxTokens: 200,
            enablePromptCaching: true,
          },
        },
        {
          id: 'parse',
          type: NodeType.CODE,
          name: 'Parse triage',
          alias: 'parse',
          position: { x: 600, y: 220 },
          config: {
            language: 'javascript',
            inputs: { raw: '{{ steps.triage.text }}' },
            code: [
              'let out = { severity: "low", labels: [] };',
              'try { out = { ...out, ...JSON.parse(raw) }; } catch (_) {}',
              'return out;',
            ].join('\n'),
          },
        },
        {
          id: 'comment',
          type: NodeType.GITHUB_COMMENT_ISSUE,
          name: 'GitHub: triage comment',
          alias: 'comment',
          position: { x: 860, y: 220 },
          config: {
            connectionId: '',
            owner: 'your-org',
            repo: 'your-repo',
            issueNumber: '{{ trigger.body.issue.number }}',
            body: '🤖 Auto-triage: severity **{{ steps.parse.severity }}**.',
          },
        },
        {
          id: 'gate',
          type: NodeType.CONDITIONAL,
          name: 'High severity?',
          position: { x: 1120, y: 220 },
          config: { condition: '"{{ steps.parse.severity }}" === "high"' },
        },
        {
          id: 'alert',
          type: NodeType.SLACK_POST_MESSAGE,
          name: 'Slack: alert #eng',
          alias: 'alert',
          position: { x: 1380, y: 120 },
          config: {
            connectionId: '',
            channel: '#eng',
            text: '🐞 High-severity issue: {{ trigger.body.issue.title }}',
          },
        },
        {
          id: 'issue',
          type: NodeType.LINEAR_CREATE_ISSUE,
          name: 'Linear: track work',
          alias: 'linear',
          position: { x: 1380, y: 320 },
          config: {
            connectionId: '',
            teamId: '',
            title: '{{ trigger.body.issue.title }}',
            description: 'Mirrored from GitHub. Severity: {{ steps.parse.severity }}.',
            priority: 1,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'triage' },
        { id: 'e2', source: 'triage', target: 'parse' },
        { id: 'e3', source: 'parse', target: 'comment' },
        { id: 'e4', source: 'comment', target: 'gate' },
        { id: 'e5', source: 'gate', target: 'alert', sourceHandle: 'true' },
        { id: 'e6', source: 'gate', target: 'issue', sourceHandle: 'true' },
      ],
    },
  },
  {
    slug: 'daily-db-health-report',
    name: 'Daily database health report',
    description:
      'A scheduled query rolls up the last 24h of execution metrics, formats a report, and escalates to Slack + email when the error count crosses a threshold.',
    category: 'Engineering',
    definition: {
      nodes: [
        {
          id: 'cron',
          type: NodeType.CRON_TRIGGER,
          name: 'Every day 08:00',
          position: { x: 80, y: 200 },
          config: { expression: '0 8 * * *' },
        },
        {
          id: 'metrics',
          type: NodeType.POSTGRES_RUN_QUERY,
          name: 'Postgres: 24h metrics',
          alias: 'metrics',
          position: { x: 340, y: 200 },
          config: {
            connectionId: '',
            query:
              "SELECT count(*) AS total, count(*) FILTER (WHERE status = $1) AS errors FROM workflow_executions WHERE started_at > now() - interval '24 hours'",
            params: ['FAILED'],
          },
        },
        {
          id: 'report',
          type: NodeType.CODE,
          name: 'Format report',
          alias: 'report',
          position: { x: 600, y: 200 },
          config: {
            language: 'javascript',
            inputs: { rows: '{{ steps.metrics.rows }}' },
            code: [
              'const row = (rows && rows[0]) || { total: 0, errors: 0 };',
              'const errorCount = Number(row.errors || 0);',
              'return {',
              '  errorCount,',
              '  summary: `Last 24h: ${row.total} executions, ${errorCount} failures.`,',
              '};',
            ].join('\n'),
          },
        },
        {
          id: 'gate',
          type: NodeType.CONDITIONAL,
          name: 'Errors over threshold?',
          position: { x: 860, y: 200 },
          config: { condition: '{{ steps.report.errorCount }} > 10' },
        },
        {
          id: 'alert',
          type: NodeType.SLACK_POST_MESSAGE,
          name: 'Slack: escalate #oncall',
          alias: 'alert',
          position: { x: 1120, y: 120 },
          config: {
            connectionId: '',
            channel: '#oncall',
            text: '⚠️ DB health: {{ steps.report.summary }}',
          },
        },
        {
          id: 'email',
          type: NodeType.GMAIL_SEND,
          name: 'Gmail: notify lead',
          alias: 'email',
          position: { x: 1120, y: 280 },
          config: {
            connectionId: '',
            to: 'engineering-lead@example.com',
            subject: 'Database health alert',
            body: '{{ steps.report.summary }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'cron', target: 'metrics' },
        { id: 'e2', source: 'metrics', target: 'report' },
        { id: 'e3', source: 'report', target: 'gate' },
        { id: 'e4', source: 'gate', target: 'alert', sourceHandle: 'true' },
        { id: 'e5', source: 'gate', target: 'email', sourceHandle: 'true' },
      ],
    },
  },
];
