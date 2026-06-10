import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as Select from '@radix-ui/react-select';
import { AlertTriangle, Check, ChevronDown, ExternalLink } from 'lucide-react';
import type { ConnectionView } from '@/api/connections';
import { ConnectionStatusBadge } from '@/components/connections/ConnectionStatusBadge';
import { getProviderIcon, getProviderLabel } from '@/components/connections/providerCatalog';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { cn } from '@/utils/cn';
import { ConnectionCard } from './steps/ConnectionCard';
import { useStepLayout } from './steps/StepLayoutContext';

export interface ConnectionPickerProps {
  provider: string;
  providerLabel?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  // When true the dropdown offers a "None" option so the selection can be
  // cleared back to null. Used by optional-connection nodes (e.g. HTTP Request)
  // that can also run unauthenticated. Default false keeps required pickers
  // unchanged.
  allowClear?: boolean;
  // Optional error text rendered as a red alert under the picker control. Used
  // by step-aware forms so the connection label+error live in the Connection
  // step rather than leaking into the Configure step. Default undefined = none.
  errorMessage?: string | null;
}

// Radix Select.Item cannot use an empty-string value, so a sentinel stands in
// for "no connection" and is mapped back to null on change.
const NONE_VALUE = '__none__';

const formatLastUsed = (iso: string | null): string => {
  if (!iso) return 'Never used';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never used';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `Last used ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Last used ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last used ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Last used ${days}d ago`;
  return `Last used ${new Date(iso).toLocaleDateString()}`;
};

export function ConnectionPicker({
  provider,
  providerLabel,
  value,
  onChange,
  disabled = false,
  allowClear = false,
  errorMessage,
}: ConnectionPickerProps): JSX.Element | null {
  const connections = useConnectionsStore((s) => s.connections);
  const status = useConnectionsStore((s) => s.status);
  const fetch = useConnectionsStore((s) => s.fetch);
  const layout = useStepLayout();

  useEffect(() => {
    if (status === 'idle') {
      void fetch();
    }
  }, [status, fetch]);

  const label = providerLabel ?? getProviderLabel(provider);
  const compatible = useMemo(
    () => connections.filter((c) => c.provider === provider),
    [connections, provider],
  );
  const selected = useMemo(
    () => compatible.find((c) => c.id === value) ?? null,
    [compatible, value],
  );
  // Stale: the workflow saved a connectionId that no longer matches any of
  // the user's connections (deleted/revoked). Surface it so users don't
  // assume the placeholder = "nothing was saved". This is the root-cause UX
  // for the "Connection <uuid> not found" runtime failure.
  const isStale = value !== null && selected === null;

  // Step-layout registration: any form rendering a ConnectionPicker gets a
  // Connection step for free. Report current meta on every relevant change;
  // unregister on unmount only (empty-dep cleanup via a ref to the latest fn).
  const registerConnection = layout?.registerConnection;
  const unregisterRef = useRef(layout?.unregisterConnection);
  unregisterRef.current = layout?.unregisterConnection;
  useEffect(() => {
    registerConnection?.({
      provider,
      optional: allowClear,
      selectedName: selected?.name ?? null,
      selectedStatus: selected?.status ?? null,
      hasSelection: selected !== null,
      stale: isStale,
    });
  }, [registerConnection, provider, allowClear, selected, isStale]);
  useEffect(() => () => unregisterRef.current?.(), []);

  const addHref = `/connections?provider=${encodeURIComponent(provider)}&connect=true`;
  const errorAlert = errorMessage ? (
    <p role="alert" data-testid="connection-picker-error" className="text-xs text-red-400">
      {errorMessage}
    </p>
  ) : null;

  const pickerUi =
    compatible.length === 0 ? (
      <div className="space-y-1.5">
        <div
          className="rounded-lg border border-dashed border-white/10 bg-surface p-4 text-sm"
          data-testid="connection-picker-empty"
        >
          <p className="text-text-secondary">No {label} connections yet.</p>
          <a
            href={addHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent-teal',
              'hover:underline focus:outline-none focus:ring-1 focus:ring-accent-teal',
            )}
          >
            <span>Add a {label} connection</span>
            <ExternalLink aria-hidden className="h-3 w-3" />
          </a>
        </div>
        {errorAlert}
      </div>
    ) : (
      <div className="space-y-1.5">
        {isStale && (
          <div
            role="alert"
            data-testid="connection-picker-stale"
            className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-200"
          >
            <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              The {label} connection saved on this node is no longer available — it was deleted or
              revoked. Re-pick a connection below.
            </span>
          </div>
        )}
        <Select.Root
          value={value ?? ''}
          onValueChange={(next) => onChange(next === NONE_VALUE ? null : next || null)}
          disabled={disabled}
        >
          <Select.Trigger
            aria-label="Connection"
            className={cn(
              'inline-flex w-full items-center justify-between gap-2 rounded-md border bg-elevated px-3 py-2 text-sm text-text-primary transition',
              'hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
              isStale ? 'border-amber-400/40 focus:ring-amber-400' : 'border-white/10',
            )}
          >
            <Select.Value
              placeholder={`Select a ${label} connection…`}
              aria-label={selected ? selected.name : undefined}
            >
              {selected ? <ConnectionTriggerContent connection={selected} /> : undefined}
            </Select.Value>
            <Select.Icon>
              <ChevronDown aria-hidden className="h-4 w-4 text-text-secondary" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              position="popper"
              sideOffset={4}
              className={cn(
                'z-50 min-w-[--radix-select-trigger-width] overflow-hidden rounded-md border border-white/10 bg-surface shadow-lg',
              )}
            >
              <Select.Viewport className="p-1">
                {allowClear && (
                  <Select.Item
                    value={NONE_VALUE}
                    className={cn(
                      'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary outline-none',
                      'data-[highlighted]:bg-white/5 data-[state=checked]:bg-white/10',
                    )}
                  >
                    <span className="w-4 flex-shrink-0">
                      <Select.ItemIndicator>
                        <Check aria-hidden className="h-4 w-4 text-accent-teal" />
                      </Select.ItemIndicator>
                    </span>
                    <Select.ItemText>None — no authentication</Select.ItemText>
                  </Select.Item>
                )}
                {compatible.map((conn) => (
                  <ConnectionPickerOption key={conn.id} connection={conn} />
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
        {errorAlert}
      </div>
    );

  // No step layout → render inline exactly as before (the ~100 per-node forms
  // that render ConnectionPicker directly are untouched — no ConnectionCard).
  if (!layout) return pickerUi;

  // Inside a step layout: relocate into the registered Connection step slot,
  // wrapped as a connection card. Until the slot element exists, render nothing
  // inline (the panel mounts the slot on its first commit).
  if (!layout.connectionSlot) return null;

  const iconUrl = getProviderIcon(provider);
  return createPortal(
    <ConnectionCard
      providerIcon={iconUrl ? <img src={iconUrl} alt="" /> : null}
      name={selected?.name ?? null}
      status={selected?.status ?? null}
      optional={allowClear}
      stale={isStale}
    >
      {pickerUi}
    </ConnectionCard>,
    layout.connectionSlot,
  );
}

function ConnectionTriggerContent({ connection }: { connection: ConnectionView }): JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{connection.name}</span>
      <ConnectionStatusBadge status={connection.status} />
    </span>
  );
}

function ConnectionPickerOption({ connection }: { connection: ConnectionView }): JSX.Element {
  return (
    <Select.Item
      value={connection.id}
      className={cn(
        'relative flex cursor-pointer select-none items-start gap-2 rounded-md px-2 py-2 text-sm text-text-primary outline-none',
        'data-[highlighted]:bg-white/5 data-[state=checked]:bg-white/10',
      )}
    >
      <span className="mt-0.5 w-4 flex-shrink-0">
        <Select.ItemIndicator>
          <Check aria-hidden className="h-4 w-4 text-accent-teal" />
        </Select.ItemIndicator>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <Select.ItemText asChild>
            <span className="truncate font-medium">{connection.name}</span>
          </Select.ItemText>
          <ConnectionStatusBadge status={connection.status} />
        </span>
        <span className="text-xs text-text-secondary">{formatLastUsed(connection.lastUsedAt)}</span>
      </span>
    </Select.Item>
  );
}
