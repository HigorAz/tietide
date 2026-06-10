import { useId } from 'react';
import { githubCommentIssueConfigSchema } from '@tietide/shared';
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

export function GitHubCommentIssueForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const owner = asString(config.owner);
  const repo = asString(config.repo);
  const issueNumber = typeof config.issueNumber === 'number' ? config.issueNumber : '';
  const body = asString(config.body);

  const ownerFieldId = useId();
  const repoFieldId = useId();
  const numberFieldId = useId();
  const bodyFieldId = useId();

  const parsed = githubCommentIssueConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    owner,
    repo,
    issueNumber: typeof issueNumber === 'number' ? issueNumber : 0,
    body,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const ownerIssue = issueFor('owner');
  const repoIssue = issueFor('repo');
  const numberIssue = issueFor('issueNumber');
  const bodyIssue = issueFor('body');

  return (
    <div data-testid="github-comment-issue-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>GitHub connection</span>
        <ConnectionPicker
          provider="github"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="github-comment-issue-connection-error"
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
              data-testid="github-comment-issue-owner-error"
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
              data-testid="github-comment-issue-repo-error"
              role="alert"
              className="text-xs text-red-400"
            >
              {repoIssue}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={numberFieldId} className={labelClass}>
          Issue / PR number
        </label>
        <input
          id={numberFieldId}
          type="number"
          min={1}
          value={issueNumber}
          aria-invalid={numberIssue !== null}
          onChange={(e) =>
            updateNodeConfig(nodeId, {
              issueNumber: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className={inputClass}
        />
        {numberIssue && (
          <p
            data-testid="github-comment-issue-number-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {numberIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyFieldId} className={labelClass}>
          Comment body (Markdown)
        </label>
        <DataPillInput
          id={bodyFieldId}
          nodeId={nodeId}
          value={body}
          aria-invalid={bodyIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { body: next })}
        />
        {bodyIssue && (
          <p
            data-testid="github-comment-issue-body-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {bodyIssue}
          </p>
        )}
      </div>
    </div>
  );
}
