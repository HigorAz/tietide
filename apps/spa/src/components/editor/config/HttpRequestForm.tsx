import { useEffect, useId, useRef, useState } from 'react';
import { httpRequestConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import { ConnectionPicker } from '@/components/editor/ConnectionPicker';
import type { NodeConfigFormProps } from './formRegistry';
import { HeadersEditor } from './HeadersEditor';
import { DataPillInput } from './DataPillInput';
import { PillSampleField } from './PillSampleField';
import { useReportConfigValidity } from '../steps/StepLayoutContext';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';

const isPlainRecord = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function HttpRequestForm({ nodeId, config }: NodeConfigFormProps) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const methodId = useId();
  const urlId = useId();
  const timeoutId = useId();
  const bodyId = useId();

  const method = typeof config.method === 'string' ? config.method : 'GET';
  const url = typeof config.url === 'string' ? config.url : '';
  const connectionId = typeof config.connectionId === 'string' ? config.connectionId : null;
  const timeout = typeof config.timeout === 'number' ? config.timeout : undefined;
  const headers = isPlainRecord(config.headers) ? (config.headers as Record<string, string>) : {};
  const initialBodyText =
    config.body === undefined
      ? ''
      : typeof config.body === 'string'
        ? config.body
        : JSON.stringify(config.body, null, 2);

  const [bodyText, setBodyText] = useState(initialBodyText);
  const [bodyError, setBodyError] = useState<string | null>(null);

  // The last body string we sourced FROM the store (not from the user's
  // keystrokes). When `config.body` changes externally — undo/redo, a template
  // instantiation, or a re-select of the same node id (the form is keyed by
  // nodeId, so same-node external edits don't remount) — `initialBodyText`
  // recomputes to a value this ref hasn't seen, so we resync the textarea.
  // Typing never triggers this: handleBodyChange records what it commits here,
  // so the next render's initialBodyText already matches and the buffer is
  // left untouched (no clobbering of in-progress, not-yet-valid JSON).
  const lastConfigBodyRef = useRef(initialBodyText);
  useEffect(() => {
    if (initialBodyText !== lastConfigBodyRef.current) {
      lastConfigBodyRef.current = initialBodyText;
      setBodyText(initialBodyText);
      setBodyError(null);
    }
  }, [initialBodyText]);

  const parsed = httpRequestConfigSchema.safeParse({
    method,
    url,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: config.body,
    timeout,
  });
  const urlIssue = parsed.success
    ? null
    : (parsed.error.issues.find((i) => i.path[0] === 'url')?.message ?? null);

  // The HTTP connection is optional (allowClear) and not part of this schema,
  // so Configure validity is simply the zod parse result plus a valid body.
  useReportConfigValidity(parsed.success && bodyError === null);

  const handleBodyChange = (next: string) => {
    setBodyText(next);
    const trimmed = next.trim();
    if (trimmed === '') {
      setBodyError(null);
      // Record the next-render initialBodyText so the resync effect treats this
      // as our own edit (body=undefined → ''), not an external change.
      lastConfigBodyRef.current = '';
      updateNodeConfig(nodeId, { body: undefined });
      return;
    }
    try {
      const parsedBody: unknown = JSON.parse(trimmed);
      setBodyError(null);
      // Mirror how the next render derives initialBodyText from config.body so
      // the resync effect won't clobber the user's freshly typed buffer.
      lastConfigBodyRef.current =
        typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody, null, 2);
      updateNodeConfig(nodeId, { body: parsedBody });
    } catch {
      // Invalid JSON is held only in the local buffer (store is left as-is), so
      // there is nothing to resync against — leave lastConfigBodyRef untouched.
      setBodyError('Body is not valid JSON.');
    }
  };

  return (
    <div data-testid="http-request-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Authentication (optional)</span>
        <ConnectionPicker
          provider="http"
          providerLabel="HTTP"
          value={connectionId}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
          allowClear
        />
        <p className="text-xs text-text-muted">
          Select an HTTP connection to attach auth headers, or leave empty to send without
          authentication.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={methodId} className={labelClass}>
          Method
        </label>
        <select
          id={methodId}
          value={method}
          onChange={(e) => updateNodeConfig(nodeId, { method: e.target.value })}
          className={inputClass}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={urlId} className={labelClass}>
          URL
        </label>
        <DataPillInput
          id={urlId}
          nodeId={nodeId}
          value={url}
          placeholder="https://api.example.com/v1/resource"
          aria-invalid={urlIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { url: next })}
        />
        {urlIssue && (
          <p data-testid="http-url-error" role="alert" className="text-xs text-red-400">
            {urlIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Headers</span>
        <HeadersEditor
          nodeId={nodeId}
          value={headers}
          onChange={(next) => updateNodeConfig(nodeId, { headers: next })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyId} className={labelClass}>
          Body
        </label>
        <DataPillInput
          id={bodyId}
          nodeId={nodeId}
          value={bodyText}
          onChange={handleBodyChange}
          placeholder={'{ "key": "value" }'}
        />
        <p className="text-xs text-text-muted">JSON. Supports {'{{data pills}}'}.</p>
        {bodyError && (
          <p data-testid="http-body-error" role="alert" className="text-xs text-red-400">
            {bodyError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={timeoutId} className={labelClass}>
          Timeout (ms)
        </label>
        <input
          id={timeoutId}
          type="number"
          min={0}
          max={30000}
          value={timeout ?? ''}
          placeholder="30000"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateNodeConfig(nodeId, { timeout: undefined });
              return;
            }
            const parsedNum = Number(raw);
            if (Number.isFinite(parsedNum)) {
              updateNodeConfig(nodeId, { timeout: parsedNum });
            }
          }}
          className={inputClass}
        />
        <p className="text-xs text-text-muted">Request timeout in milliseconds (max 30,000).</p>
      </div>

      <PillSampleField nodeId={nodeId} config={config} />
    </div>
  );
}
