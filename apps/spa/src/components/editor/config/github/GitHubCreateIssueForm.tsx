import { useId } from 'react';
import { githubCreateIssueConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

const splitCsv = (s: string): string[] =>
  s
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

export function GitHubCreateIssueForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const owner = asString(config.owner);
  const repo = asString(config.repo);
  const title = asString(config.title);
  const body = asString(config.body);
  const labels = Array.isArray(config.labels)
    ? (config.labels as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  const ownerFieldId = useId();
  const repoFieldId = useId();
  const titleFieldId = useId();
  const bodyFieldId = useId();
  const labelsFieldId = useId();

  const parsed = githubCreateIssueConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    owner,
    repo,
    title,
    body: body || undefined,
    labels: labels.length > 0 ? labels : undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const ownerIssue = issueFor('owner');
  const repoIssue = issueFor('repo');
  const titleIssue = issueFor('title');

  return (
    <div data-testid="github-create-issue-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>GitHub connection</span>
        <ConnectionPicker
          provider="github"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="github-create-issue-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a GitHub connection.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ownerFieldId} className={labelClass}>
            Owner
          </label>
          <DataPillInput
            id={ownerFieldId}
            nodeId={nodeId}
            value={owner}
            placeholder="octocat"
            aria-invalid={ownerIssue !== null}
            onChange={(next) => updateNodeConfig(nodeId, { owner: next })}
          />
          {ownerIssue && (
            <p
              data-testid="github-create-issue-owner-error"
              role="alert"
              className="text-xs text-red-400"
            >
              {ownerIssue}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={repoFieldId} className={labelClass}>
            Repo
          </label>
          <DataPillInput
            id={repoFieldId}
            nodeId={nodeId}
            value={repo}
            placeholder="hello-world"
            aria-invalid={repoIssue !== null}
            onChange={(next) => updateNodeConfig(nodeId, { repo: next })}
          />
          {repoIssue && (
            <p
              data-testid="github-create-issue-repo-error"
              role="alert"
              className="text-xs text-red-400"
            >
              {repoIssue}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleFieldId} className={labelClass}>
          Title
        </label>
        <DataPillInput
          id={titleFieldId}
          nodeId={nodeId}
          value={title}
          placeholder="Bug: ..."
          aria-invalid={titleIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { title: next })}
        />
        {titleIssue && (
          <p
            data-testid="github-create-issue-title-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {titleIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyFieldId} className={labelClass}>
          Body (Markdown, optional)
        </label>
        <textarea
          id={bodyFieldId}
          value={body}
          rows={5}
          onChange={(e) => updateNodeConfig(nodeId, { body: e.target.value || undefined })}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={labelsFieldId} className={labelClass}>
          Labels (comma-separated, optional)
        </label>
        <input
          id={labelsFieldId}
          type="text"
          value={labels.join(', ')}
          onChange={(e) => {
            const next = splitCsv(e.target.value);
            updateNodeConfig(nodeId, { labels: next.length > 0 ? next : undefined });
          }}
          placeholder="bug, triage"
          className={inputClass}
        />
      </div>
    </div>
  );
}
