import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { codeConfigSchema, isValidCodeInputName } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from './formRegistry';
import { PillSampleField } from './PillSampleField';
import { HeadersEditor } from './HeadersEditor';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

const SAMPLE_CODE = `// Inputs you defined in the table appear as variables:
//   message, channelId
// The upstream pill value is also available as \`input\`.
const greeting = \`Hi \${message}\`;
return { greeting, channelId };`;

function readInputs(config: Record<string, unknown>): Record<string, string> {
  const raw = config.inputs;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = typeof v === 'string' ? v : String(v ?? '');
  }
  return out;
}

export function CodeForm({ nodeId, config }: NodeConfigFormProps) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const codeId = useId();
  const languageId = useId();
  const errorId = useId();
  const [showSample, setShowSample] = useState(false);

  const code = typeof config.code === 'string' ? config.code : '';
  const language = config.language === 'javascript' ? 'javascript' : 'javascript';
  const parsed = codeConfigSchema.safeParse({ code, language });
  const error = parsed.success
    ? null
    : (parsed.error.issues.find((i) => i.path[0] === 'code')?.message ?? 'Invalid code');

  const inputs = readInputs(config);
  const invalidKeys = Object.keys(inputs).filter((k) => k.length > 0 && !isValidCodeInputName(k));

  return (
    <div data-testid="code-form" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={languageId} className={labelClass}>
          Language
        </label>
        <select
          id={languageId}
          value={language}
          onChange={(e) => updateNodeConfig(nodeId, { language: e.target.value })}
          className={inputClass}
        >
          <option value="javascript">JavaScript</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Input</span>
        <p className="text-xs text-text-muted">
          Each key becomes a variable in your code; set its value with a data pill.
        </p>
        <HeadersEditor
          value={inputs}
          onChange={(next) => updateNodeConfig(nodeId, { inputs: next })}
          nodeId={nodeId}
          addLabel="Add input"
          removeLabel="Remove input"
          keyPlaceholder="Variable name"
          valuePlaceholder="{{trigger.field}}"
        />
        {invalidKeys.length > 0 && (
          <p role="alert" className="text-xs text-red-400">
            Invalid variable name{invalidKeys.length > 1 ? 's' : ''}: {invalidKeys.join(', ')}. Use
            letters, digits, _ or $ (must not start with a digit).
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <label htmlFor={codeId} className={labelClass}>
            Code
          </label>
          <button
            type="button"
            aria-label="Show example"
            aria-expanded={showSample}
            data-testid="code-sample-toggle"
            onClick={() => setShowSample((v) => !v)}
            className="rounded p-0.5 text-text-muted hover:text-accent-teal focus:outline-none"
          >
            <Info size={13} aria-hidden />
          </button>
        </div>
        {showSample && (
          <pre
            data-testid="code-sample"
            className="overflow-x-auto rounded-md border border-white/5 bg-elevated px-3 py-2 font-mono text-[11px] leading-5 text-text-secondary"
          >
            {SAMPLE_CODE}
          </pre>
        )}
        <textarea
          id={codeId}
          value={code}
          placeholder="return input;"
          rows={10}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => updateNodeConfig(nodeId, { code: e.target.value })}
          className={cn(
            'w-full rounded-md border border-white/5 bg-elevated px-3 py-2 font-mono',
            'text-xs text-text-primary placeholder:text-text-muted',
            'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        />
        <p className="text-xs text-text-muted">
          Runs in a sandboxed VM on the worker. Max 10,000 characters.
        </p>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </div>

      <PillSampleField nodeId={nodeId} config={config} />
    </div>
  );
}
