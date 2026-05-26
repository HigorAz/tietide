import { useId } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from '../formRegistry';
import { DataPillInput } from '../DataPillInput';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function DiscordReplyToCommandForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const content = asString(config.content);
  const interactionToken = asString(config.interactionToken);
  const applicationId = asString(config.applicationId);

  const contentId = useId();
  const tokenId = useId();
  const appIdId = useId();

  // Only `content` is validated here. The token/app-id fields usually hold
  // {{…}} data-pill templates that resolve at runtime, so schema-validating them
  // at edit-time would show false errors.
  const contentIssue = content.trim().length === 0 ? 'Message is required' : null;

  return (
    <div data-testid="discord-reply-to-command-form" className="flex flex-col gap-4">
      <p className="rounded-md border border-white/5 bg-elevated/50 p-3 text-xs text-text-secondary">
        Replies to the slash command that triggered this workflow. Place this node downstream of a
        Discord trigger — the interaction is picked up automatically.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={contentId} className={labelClass}>
          Message
        </label>
        <DataPillInput
          id={contentId}
          nodeId={nodeId}
          value={content}
          placeholder="Hello {{ ...member.user.username }}!"
          aria-invalid={contentIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { content: next })}
        />
        {contentIssue && (
          <p
            data-testid="discord-reply-to-command-content-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {contentIssue}
          </p>
        )}
      </div>

      <details className="rounded-md border border-white/5 bg-elevated/30 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-text-secondary">
          Advanced (override interaction source)
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={tokenId} className={labelClass}>
              Interaction token <span className="text-text-muted">(optional)</span>
            </label>
            <DataPillInput
              id={tokenId}
              nodeId={nodeId}
              value={interactionToken}
              placeholder="leave blank to use the triggering interaction"
              onChange={(next) => updateNodeConfig(nodeId, { interactionToken: next || undefined })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={appIdId} className={labelClass}>
              Application ID <span className="text-text-muted">(optional)</span>
            </label>
            <input
              id={appIdId}
              type="text"
              value={applicationId}
              placeholder="leave blank to use the triggering interaction"
              onChange={(e) =>
                updateNodeConfig(nodeId, { applicationId: e.target.value || undefined })
              }
              className={inputClass}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
