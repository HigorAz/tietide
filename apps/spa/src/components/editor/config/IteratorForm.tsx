import { useId } from 'react';
import { iteratorConfigSchema, ITERATOR_MAX_ITEMS_DEFAULT } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from './formRegistry';
import { DataPillInput } from './DataPillInput';

export function IteratorForm({ nodeId, config }: NodeConfigFormProps) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const arrayPathId = useId();
  const continueOnErrorId = useId();
  const maxItemsId = useId();
  const errorId = useId();

  const arrayPath = typeof config.arrayPath === 'string' ? config.arrayPath : '';
  const continueOnError = config.continueOnError === true;
  const maxItemsRaw = config.maxItems;
  const maxItems = typeof maxItemsRaw === 'number' ? maxItemsRaw : undefined;

  const parsed = iteratorConfigSchema.safeParse({
    arrayPath,
    continueOnError,
    ...(maxItems !== undefined ? { maxItems } : {}),
  });
  const error = parsed.success
    ? null
    : (parsed.error.issues[0]?.message ?? 'Invalid configuration');

  return (
    <div data-testid="iterator-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={arrayPathId}
          className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Array Path
        </label>
        <DataPillInput
          id={arrayPathId}
          nodeId={nodeId}
          value={arrayPath}
          placeholder="{{http_1.response.body.items}}"
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(next) => updateNodeConfig(nodeId, { arrayPath: next })}
        />
        <p className="text-xs text-text-muted">
          Data pill resolving to an array. The body subgraph runs once per item, with{' '}
          <span className="font-mono">{`{{${nodeId}.item}}`}</span>,{' '}
          <span className="font-mono">{`{{${nodeId}.index}}`}</span>, and{' '}
          <span className="font-mono">{`{{${nodeId}.total}}`}</span> available inside the body.
        </p>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-start gap-2">
        <input
          id={continueOnErrorId}
          type="checkbox"
          checked={continueOnError}
          onChange={(e) => updateNodeConfig(nodeId, { continueOnError: e.target.checked })}
          className="mt-1 h-4 w-4 cursor-pointer accent-accent-teal"
        />
        <div className="flex flex-col">
          <label htmlFor={continueOnErrorId} className="cursor-pointer text-sm text-text-primary">
            Continue on error
          </label>
          <p className="text-xs text-text-muted">
            When enabled, a failed iteration does not abort the loop. The iterator output reports{' '}
            <span className="font-mono">{'{ total, succeeded, failed }'}</span>.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={maxItemsId}
          className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Max Items <span className="text-text-muted">(optional)</span>
        </label>
        <input
          id={maxItemsId}
          type="number"
          inputMode="numeric"
          min={1}
          max={ITERATOR_MAX_ITEMS_DEFAULT}
          value={maxItems ?? ''}
          placeholder={String(ITERATOR_MAX_ITEMS_DEFAULT)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateNodeConfig(nodeId, { maxItems: undefined });
              return;
            }
            const parsedNum = Number(raw);
            if (Number.isFinite(parsedNum) && parsedNum > 0) {
              updateNodeConfig(nodeId, { maxItems: Math.floor(parsedNum) });
            }
          }}
          className="rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
        />
        <p className="text-xs text-text-muted">
          Cap on iterations. Defaults to {ITERATOR_MAX_ITEMS_DEFAULT}.
        </p>
      </div>
    </div>
  );
}
