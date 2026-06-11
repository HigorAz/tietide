import { Fragment, useEffect, useMemo, type JSX } from 'react';
import { ConnectionStatus } from '@tietide/shared';
import { splitSegments } from '@/lib/dataPillToken';
import { useConnectionsStore } from '@/stores/connectionsStore';

/** Inline-JSON display cap for non-string config values (parallels DataTable's CELL_MAX). */
const CONFIG_VALUE_MAX = 80;

export interface ConfigFieldListProps {
  config: Record<string, unknown>;
  testId?: string;
}

/**
 * Humanize a config key for the label column: 'maxResults' → 'Max results',
 * 'has_error_handler' → 'Has error handler'. Inserts spaces before capitals and
 * at underscores, lowercases the rest, capitalizes the first character.
 * Exported for tests.
 */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/_+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  const lower = spaced.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Render a string value with its `{{token}}` segments as teal pill chips. */
function renderStringValue(value: string): JSX.Element[] {
  return splitSegments(value).map((seg, i) => {
    if (seg.kind === 'literal') {
      return <Fragment key={i}>{seg.text}</Fragment>;
    }
    return (
      <span
        key={i}
        className="mx-0.5 inline-flex items-center rounded bg-accent-teal/15 px-1 py-px font-mono text-[10px] text-accent-teal"
      >
        {seg.text}
      </span>
    );
  });
}

/** Render a non-connection value: strings get pill chips, primitives stringify, objects compact-JSON (truncated). */
function renderValue(value: unknown): JSX.Element | string {
  if (typeof value === 'string') return <>{renderStringValue(value)}</>;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined) return 'null';
  const json = JSON.stringify(value);
  return json.length > CONFIG_VALUE_MAX ? `${json.slice(0, CONFIG_VALUE_MAX)}…` : json;
}

interface ConnectionValueProps {
  id: string;
}

/** Resolve a connectionId to its name + status dot, or fall back to a truncated id. */
function ConnectionValue({ id }: ConnectionValueProps): JSX.Element {
  const connections = useConnectionsStore((s) => s.connections);
  const found = connections.find((c) => c.id === id);
  if (!found) {
    const short = id.length > 10 ? `${id.slice(0, 10)}…` : id;
    return <span className="text-text-secondary">{short}</span>;
  }
  const dotClass =
    found.status === ConnectionStatus.ACTIVE ? 'bg-status-success' : 'bg-status-failed';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        data-testid="config-connection-dot"
        className={`h-1.5 w-1.5 rounded-full ${dotClass}`}
      />
      {found.name}
    </span>
  );
}

/**
 * Labeled config field list (locked sketch 002-D): the Configuration card is
 * never a JSON blob. Each key renders as a humanized label + value, `{{pills}}`
 * become teal chips, and `connectionId` resolves to a connection name + status
 * dot (truncated id fallback). Replaces the raw CONFIG (READ-ONLY) block.
 */
export function ConfigFieldList({
  config,
  testId = 'config-field-list',
}: ConfigFieldListProps): JSX.Element {
  const status = useConnectionsStore((s) => s.status);
  const fetch = useConnectionsStore((s) => s.fetch);
  const entries = useMemo(() => Object.entries(config), [config]);
  // Only nodes with a `connectionId` field need the connection registry; gating
  // the fetch avoids a needless network call for connection-less nodes (IN-05).
  const needsConnections = useMemo(() => entries.some(([k]) => k === 'connectionId'), [entries]);

  // Resolve connection names lazily, mirroring ConnectionPicker's fetch-on-idle.
  useEffect(() => {
    if (needsConnections && status === 'idle') {
      void fetch();
    }
  }, [needsConnections, status, fetch]);

  if (entries.length === 0) {
    return (
      <p data-testid={testId} className="text-xs italic text-text-secondary">
        No configuration
      </p>
    );
  }

  return (
    <div
      data-testid={testId}
      className="grid grid-cols-[minmax(90px,30%)_1fr] gap-x-3 gap-y-1.5 text-xs"
    >
      {entries.map(([key, value]) => (
        <Fragment key={key}>
          <div className="text-text-secondary">{humanizeKey(key)}</div>
          <div className="min-w-0 break-words font-mono text-[11.5px] text-text-primary">
            {key === 'connectionId' && typeof value === 'string' ? (
              <ConnectionValue id={value} />
            ) : (
              renderValue(value)
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
