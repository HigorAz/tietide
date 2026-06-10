import { useId } from 'react';
import { slackUploadFileConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function SlackUploadFileForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channel = asString(config.channel);
  const filename = asString(config.filename);
  const contentBase64 = asString(config.contentBase64);
  const initialComment = asString(config.initialComment);

  const channelId = useId();
  const filenameId = useId();
  const contentId = useId();
  const commentId = useId();

  const parsed = slackUploadFileConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channel,
    filename,
    contentBase64,
    initialComment: initialComment || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const channelIssue = issueFor('channel');
  const filenameIssue = issueFor('filename');
  const contentIssue = issueFor('contentBase64');

  return (
    <div data-testid="slack-upload-file-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Slack connection</span>
        <ConnectionPicker
          provider="slack"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="slack-upload-file-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Slack connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={channelId} className={labelClass}>
          Channel ID
        </label>
        <DataPillInput
          id={channelId}
          nodeId={nodeId}
          value={channel}
          placeholder="C0123ABCDEF"
          aria-invalid={channelIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { channel: next })}
        />
        {channelIssue && (
          <p
            data-testid="slack-upload-file-channel-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {channelIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={filenameId} className={labelClass}>
          Filename
        </label>
        <DataPillInput
          id={filenameId}
          nodeId={nodeId}
          value={filename}
          placeholder="report.csv"
          aria-invalid={filenameIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { filename: next })}
        />
        {filenameIssue && (
          <p
            data-testid="slack-upload-file-filename-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {filenameIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={contentId} className={labelClass}>
          Content (base64)
        </label>
        <DataPillInput
          id={contentId}
          nodeId={nodeId}
          value={contentBase64}
          placeholder="{{stepX.contentBase64}}"
          aria-invalid={contentIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { contentBase64: next })}
        />
        {contentIssue && (
          <p
            data-testid="slack-upload-file-content-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {contentIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={commentId} className={labelClass}>
          Initial comment (optional)
        </label>
        <DataPillInput
          id={commentId}
          nodeId={nodeId}
          value={initialComment}
          onChange={(next) => updateNodeConfig(nodeId, { initialComment: next || undefined })}
        />
      </div>
    </div>
  );
}
