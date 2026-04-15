import { useId, useState } from 'react';
import { httpRequestConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from './formRegistry';
import { HeadersEditor } from './HeadersEditor';

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

  const handleBodyBlur = () => {
    const trimmed = bodyText.trim();
    if (trimmed === '') {
      setBodyError(null);
      updateNodeConfig(nodeId, { body: undefined });
      return;
    }
    try {
      const parsedBody: unknown = JSON.parse(trimmed);
      setBodyError(null);
      updateNodeConfig(nodeId, { body: parsedBody });
    } catch {
      setBodyError('Body is not valid JSON.');
    }
  };

  return (
    <div data-testid="http-request-form" className="flex flex-col gap-4">
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
        <input
          id={urlId}
          type="url"
          value={url}
          placeholder="https://api.example.com/v1/resource"
          aria-invalid={urlIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { url: e.target.value })}
          className={inputClass}
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
          value={headers}
          onChange={(next) => updateNodeConfig(nodeId, { headers: next })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyId} className={labelClass}>
          Body
        </label>
        <textarea
          id={bodyId}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          onBlur={handleBodyBlur}
          placeholder={'{ "key": "value" }'}
          rows={6}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        <p className="text-xs text-text-muted">JSON. Committed on blur.</p>
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
    </div>
  );
}
