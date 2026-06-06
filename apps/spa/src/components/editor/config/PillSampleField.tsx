import { useId, useState } from 'react';
import { PILL_SAMPLE_KEY } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { parseJsonSample } from '@/lib/parseJsonSample';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from './formRegistry';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';

const toText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
};

/**
 * Optional output-sample editor for nodes whose runtime output is opaque
 * (http/webhook/code). The pasted JSON is stored under the reserved
 * `__pillSample` config key and becomes the highest-priority data-pill source
 * for downstream nodes (#259). It feeds ONLY the picker — the worker strips it
 * before execution, so real runtime output is always used.
 */
export function PillSampleField({ nodeId, config }: NodeConfigFormProps) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const fieldId = useId();

  const [text, setText] = useState(() => toText(config[PILL_SAMPLE_KEY]));
  const [error, setError] = useState<string | null>(null);

  const handleBlur = () => {
    // Tolerant parse: smart quotes / non-breaking spaces from pasted text would
    // otherwise fail a bare JSON.parse and silently drop the sample (which then
    // never reaches the data-pill picker as an override).
    const result = parseJsonSample(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    updateNodeConfig(nodeId, { [PILL_SAMPLE_KEY]: result.value });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className={labelClass}>
        Output sample
      </label>
      <textarea
        id={fieldId}
        data-testid="pill-sample-field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder={'{ "id": 123, "status": "ok" }'}
        rows={5}
        className={cn(inputClass, 'font-mono text-xs')}
      />
      <p className="text-xs text-text-muted">
        Optional. Paste an example output to make this node&apos;s fields available as data pills
        downstream. Used only for mapping — never for execution.
      </p>
      {error && (
        <p data-testid="pill-sample-error" role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
