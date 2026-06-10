import { useEffect, useId, useState } from 'react';
import { discordMessageReceivedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { listProviderSubscriptions } from '@/api/providerSubscriptions';
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

type UrlState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; url: string }
  | { status: 'pending' }; // workflow saved but no subscription yet (not activated)

export function DiscordMessageReceivedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const workflowId = useEditorStore((s) => s.workflowId);

  const connectionId = asString(config.connectionId);
  const commandName = asString(config.commandName) || 'tietide-trigger';
  const guildId = asString(config.guildId);

  const cmdInputId = useId();
  const guildInputId = useId();

  const [urlState, setUrlState] = useState<UrlState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!workflowId) {
      setUrlState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setUrlState({ status: 'loading' });
    listProviderSubscriptions(workflowId)
      .then((subs) => {
        if (cancelled) return;
        const match = subs.find((s) => s.nodeId === nodeId);
        setUrlState(match ? { status: 'ready', url: match.callbackUrl } : { status: 'pending' });
      })
      .catch(() => {
        if (!cancelled) setUrlState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId, nodeId, reloadKey]);

  const copyUrl = (url: string): void => {
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const parsed = discordMessageReceivedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    commandName,
    guildId: guildId || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const cmdIssue = issueFor('commandName');
  const guildIssue = issueFor('guildId');

  return (
    <div data-testid="discord-message-received-form" className="flex flex-col gap-4">
      <p className="rounded-md border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
        Discord interactions require you to paste this workflow's Interactions Endpoint URL into the
        Discord Developer Portal. The trigger fires on the registered slash command — not on every
        channel message (Discord limitation).
      </p>

      <div data-testid="discord-interactions-endpoint-url" className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={labelClass}>Interactions Endpoint URL</span>
          <button
            type="button"
            data-testid="discord-interactions-url-refresh"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-[11px] font-medium text-accent-teal hover:underline focus:outline-none"
          >
            Recheck
          </button>
        </div>

        {urlState.status === 'ready' ? (
          <>
            <div className="flex items-center gap-2">
              <input
                data-testid="discord-interactions-url-input"
                type="text"
                readOnly
                value={urlState.url}
                onFocus={(e) => e.currentTarget.select()}
                className={cn(inputClass, 'font-mono text-xs')}
              />
              <button
                type="button"
                data-testid="discord-interactions-url-copy"
                onClick={() => copyUrl(urlState.url)}
                className={cn(
                  'shrink-0 rounded-md border border-white/10 px-3 py-2 text-xs font-semibold',
                  'text-text-primary transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
                )}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-text-muted">
              Paste into Discord Developer Portal → General Information → Interactions Endpoint URL.
            </p>
          </>
        ) : urlState.status === 'pending' ? (
          <p data-testid="discord-interactions-url-pending" className="text-xs text-text-muted">
            Activate this workflow to generate its Interactions Endpoint URL, then click Recheck.
          </p>
        ) : urlState.status === 'loading' ? (
          <p className="text-xs text-text-muted">Loading…</p>
        ) : urlState.status === 'error' ? (
          <p data-testid="discord-interactions-url-error" className="text-xs text-red-400">
            Could not load the URL. Click Recheck to retry.
          </p>
        ) : (
          <p data-testid="discord-interactions-url-unsaved" className="text-xs text-text-muted">
            Save and activate this workflow to generate its Interactions Endpoint URL.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Discord bot connection</span>
        <ConnectionPicker
          provider="discord-bot"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="discord-message-received-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Discord bot connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={cmdInputId} className={labelClass}>
          Slash command name
        </label>
        <DataPillInput
          id={cmdInputId}
          nodeId={nodeId}
          value={commandName}
          aria-invalid={cmdIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { commandName: next })}
        />
        {cmdIssue && (
          <p
            data-testid="discord-message-received-command-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {cmdIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={guildInputId} className={labelClass}>
          Guild ID (optional — global if blank)
        </label>
        <DataPillInput
          id={guildInputId}
          nodeId={nodeId}
          value={guildId}
          placeholder="123456789012345678"
          aria-invalid={guildIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { guildId: next || undefined })}
        />
        {guildIssue && (
          <p
            data-testid="discord-message-received-guild-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {guildIssue}
          </p>
        )}
      </div>
    </div>
  );
}
