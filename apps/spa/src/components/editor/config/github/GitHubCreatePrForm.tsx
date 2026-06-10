import { useId } from 'react';
import { githubCreatePrConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function GitHubCreatePrForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const owner = asString(config.owner);
  const repo = asString(config.repo);
  const head = asString(config.head);
  const base = asString(config.base);
  const title = asString(config.title);
  const body = asString(config.body);
  const draft = config.draft === true;

  const ownerFieldId = useId();
  const repoFieldId = useId();
  const headFieldId = useId();
  const baseFieldId = useId();
  const titleFieldId = useId();
  const bodyFieldId = useId();
  const draftFieldId = useId();

  const parsed = githubCreatePrConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    owner,
    repo,
    head,
    base,
    title,
    body: body || undefined,
    draft: draft || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const ownerIssue = issueFor('owner');
  const repoIssue = issueFor('repo');
  const headIssue = issueFor('head');
  const baseIssue = issueFor('base');
  const titleIssue = issueFor('title');

  return (
    <div data-testid="github-create-pr-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>GitHub connection</span>
        <ConnectionPicker
          provider="github"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="github-create-pr-connection-error"
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
              data-testid="github-create-pr-owner-error"
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
              data-testid="github-create-pr-repo-error"
              role="alert"
              className="text-xs text-red-400"
            >
              {repoIssue}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={headFieldId} className={labelClass}>
            Head branch
          </label>
          <DataPillInput
            id={headFieldId}
            nodeId={nodeId}
            value={head}
            placeholder="feature/foo"
            aria-invalid={headIssue !== null}
            onChange={(next) => updateNodeConfig(nodeId, { head: next })}
          />
          {headIssue && (
            <p
              data-testid="github-create-pr-head-error"
              role="alert"
              className="text-xs text-red-400"
            >
              {headIssue}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={baseFieldId} className={labelClass}>
            Base branch
          </label>
          <DataPillInput
            id={baseFieldId}
            nodeId={nodeId}
            value={base}
            placeholder="main"
            aria-invalid={baseIssue !== null}
            onChange={(next) => updateNodeConfig(nodeId, { base: next })}
          />
          {baseIssue && (
            <p
              data-testid="github-create-pr-base-error"
              role="alert"
              className="text-xs text-red-400"
            >
              {baseIssue}
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
          placeholder="feat: ..."
          aria-invalid={titleIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { title: next })}
        />
        {titleIssue && (
          <p
            data-testid="github-create-pr-title-error"
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
        <DataPillInput
          id={bodyFieldId}
          nodeId={nodeId}
          value={body}
          onChange={(next) => updateNodeConfig(nodeId, { body: next || undefined })}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id={draftFieldId}
          type="checkbox"
          checked={draft}
          onChange={(e) => updateNodeConfig(nodeId, { draft: e.target.checked || undefined })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={draftFieldId} className="text-xs text-text-secondary">
          Open as draft PR
        </label>
      </div>
    </div>
  );
}
