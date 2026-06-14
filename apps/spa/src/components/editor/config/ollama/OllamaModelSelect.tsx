import { useCallback, useEffect, useId, useState } from 'react';
import type { OllamaModelOption } from '@tietide/shared';
import { listOllamaModels, pullOllamaModel } from '@/api/connections';
import { cn } from '@/utils/cn';

// Sentinel value for the "Other (type a model)…" option — a model name can never
// legitimately equal this so it's safe to use as a mode switch.
const CUSTOM_VALUE = '__custom__';

const inputClass = cn(
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

const isHttpUrl = (value: string): boolean => /^https?:\/\/\S+/i.test(value.trim());

export interface OllamaModelSelectProps {
  value: string;
  onChange: (value: string) => void;
  connectionId?: string;
  baseUrl?: string;
  curated: readonly OllamaModelOption[];
  allowBlank?: boolean;
  id?: string;
  disabled?: boolean;
}

interface PullState {
  active: boolean;
  status: string;
  completed?: number;
  total?: number;
  error: string | null;
}

const initialPull: PullState = { active: false, status: '', error: null };

export function OllamaModelSelect({
  value,
  onChange,
  connectionId,
  baseUrl,
  curated,
  allowBlank = false,
  id,
  disabled = false,
}: OllamaModelSelectProps): JSX.Element {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  const [installed, setInstalled] = useState<string[]>([]);
  const [reachable, setReachable] = useState<boolean>(false);
  const [attempted, setAttempted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [pull, setPull] = useState<PullState>(initialPull);
  // Custom mode is engaged when the user explicitly picks "Other…" — tracked
  // separately from `value` so an empty custom input doesn't snap back to the
  // dropdown mid-typing.
  const [customMode, setCustomMode] = useState<boolean>(false);

  const target = connectionId
    ? { connectionId }
    : baseUrl && isHttpUrl(baseUrl)
      ? { baseUrl }
      : null;
  // Stable cache key so the fetch effect only re-runs when the resolved target
  // (or the debounced baseUrl) actually changes.
  const targetKey = connectionId ?? (baseUrl && isHttpUrl(baseUrl) ? baseUrl.trim() : '');

  const refresh = useCallback(async (): Promise<void> => {
    if (!target) {
      setInstalled([]);
      setReachable(false);
      setAttempted(false);
      return;
    }
    setLoading(true);
    try {
      const result = await listOllamaModels(target);
      setInstalled(result.models);
      setReachable(result.reachable);
    } catch {
      setInstalled([]);
      setReachable(false);
    } finally {
      setAttempted(true);
      setLoading(false);
    }
    // `target` is derived purely from connectionId/baseUrl, so keying the
    // callback on those primitives keeps it stable without depending on the
    // freshly-rebuilt `target` object each render.
  }, [connectionId, targetKey]);

  // Debounce baseUrl-driven fetches (~400ms); connectionId-driven fetches fire
  // immediately. The empty-target case resets state synchronously in `refresh`.
  useEffect(() => {
    if (connectionId) {
      void refresh();
      return;
    }
    if (!targetKey) {
      setInstalled([]);
      setReachable(false);
      setAttempted(false);
      return;
    }
    const handle = window.setTimeout(() => void refresh(), 400);
    return () => window.clearTimeout(handle);
  }, [connectionId, targetKey, refresh]);

  const installedSet = new Set(installed);
  const curatedNames = new Set(curated.map((m) => m.name));
  const showInstalled = reachable && installed.length > 0;
  const availableCurated = curated.filter((m) => !installedSet.has(m.name));

  // A non-empty value that is neither installed nor curated is a user-typed
  // custom model — surface it as a selected option so it isn't silently lost.
  const isKnown = value === '' || installedSet.has(value) || curatedNames.has(value);
  const showCustomOption = value !== '' && !isKnown;
  const inCustomMode = customMode || showCustomOption;

  const selectValue = inCustomMode ? CUSTOM_VALUE : value;

  const handleSelectChange = (next: string): void => {
    if (next === CUSTOM_VALUE) {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    onChange(next);
  };

  const notInstalled = value !== '' && !installedSet.has(value);
  // Only offer a pull when we actually reached the server and confirmed the model is
  // absent — when unreachable we can't know install state (the unreachable note shows).
  const showPull = notInstalled && attempted && reachable;

  const startPull = async (): Promise<void> => {
    if (!target) return;
    setPull({ active: true, status: 'starting…', error: null });
    try {
      await pullOllamaModel({ ...target, model: value }, (progress) => {
        setPull({
          active: true,
          status: progress.status,
          completed: progress.completed,
          total: progress.total,
          error: null,
        });
      });
      setPull(initialPull);
      await refresh();
    } catch (err) {
      setPull({
        active: false,
        status: '',
        error: err instanceof Error ? err.message : 'Pull failed',
      });
    }
  };

  const percent =
    pull.total && pull.completed !== undefined && pull.total > 0
      ? Math.min(100, Math.round((pull.completed / pull.total) * 100))
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      {inCustomMode ? (
        <input
          id={selectId}
          type="text"
          value={value}
          disabled={disabled}
          placeholder="qwen2.5:7b"
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          data-testid="ollama-model-custom-input"
        />
      ) : (
        <select
          id={selectId}
          value={selectValue}
          disabled={disabled}
          onChange={(e) => handleSelectChange(e.target.value)}
          className={inputClass}
          data-testid="ollama-model-select"
        >
          {allowBlank && <option value="">— use connection default —</option>}
          {showInstalled && (
            <optgroup label="Installed">
              {installed.map((name) => (
                <option key={`installed-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Available (needs pull)">
            {availableCurated.map((m) => (
              <option key={`curated-${m.name}`} value={m.name}>
                {m.label} — {m.recommended ? '⭐ ' : ''}
                {m.hint} · ~{m.sizeGb}GB
              </option>
            ))}
          </optgroup>
          {showCustomOption && <option value={value}>{value} (custom)</option>}
          <option value={CUSTOM_VALUE}>Other (type a model)…</option>
        </select>
      )}

      {loading && <p className="text-xs text-text-muted">Checking installed models…</p>}

      {attempted && !reachable && (
        <p className="text-xs text-text-muted" data-testid="ollama-model-unreachable">
          Couldn’t reach the server — showing common models.
        </p>
      )}

      {showPull && (
        <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-surface p-3">
          <p className="text-xs text-amber-200">Not installed on the server</p>
          {pull.active ? (
            <div className="flex flex-col gap-1.5" data-testid="ollama-model-pull-progress">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    'h-full bg-accent-teal transition-[width]',
                    percent === null && 'w-1/3 animate-pulse',
                  )}
                  style={percent === null ? undefined : { width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-text-secondary">
                {pull.status}
                {percent !== null ? ` · ${percent}%` : ''}
              </p>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled || !reachable || pull.active}
              onClick={() => void startPull()}
              className={cn(
                'inline-flex w-fit items-center gap-1.5 rounded-md bg-accent-teal px-2.5 py-1 text-xs font-semibold text-deep-blue transition',
                'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
              data-testid="ollama-model-pull-button"
            >
              Pull on server
            </button>
          )}
          {pull.error && (
            <p role="alert" className="text-xs text-red-400" data-testid="ollama-model-pull-error">
              {pull.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
