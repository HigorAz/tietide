import { useId } from 'react';
import { codeConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from './formRegistry';

export function CodeForm({ nodeId, config }: NodeConfigFormProps) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const codeId = useId();
  const languageId = useId();
  const errorId = useId();

  const code = typeof config.code === 'string' ? config.code : '';
  const language = config.language === 'javascript' ? 'javascript' : 'javascript';
  const parsed = codeConfigSchema.safeParse({ code, language });
  const error = parsed.success
    ? null
    : (parsed.error.issues.find((i) => i.path[0] === 'code')?.message ?? 'Invalid code');

  return (
    <div data-testid="code-form" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={languageId}
          className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Language
        </label>
        <select
          id={languageId}
          value={language}
          onChange={(e) => updateNodeConfig(nodeId, { language: e.target.value })}
          className={cn(
            'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
            'text-sm text-text-primary',
            'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        >
          <option value="javascript">JavaScript</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={codeId}
          className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Code
        </label>
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
    </div>
  );
}
