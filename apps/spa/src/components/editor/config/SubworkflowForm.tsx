import { useId, useMemo, useState } from 'react';
import { subworkflowConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { WorkflowPicker } from '@/components/editor/WorkflowPicker';
import type { NodeConfigFormProps } from './formRegistry';

export function SubworkflowForm({ nodeId, config }: NodeConfigFormProps) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const currentWorkflowId = useEditorStore((s) => s.workflowId);

  const workflowIdId = useId();
  const inputMappingId = useId();
  const errorId = useId();

  const workflowId =
    typeof config.workflowId === 'string' && config.workflowId.length > 0
      ? config.workflowId
      : null;
  const inputMapping = useMemo<Record<string, unknown>>(() => {
    if (config.inputMapping && typeof config.inputMapping === 'object') {
      return config.inputMapping as Record<string, unknown>;
    }
    return {};
  }, [config.inputMapping]);

  // Local mirror so users can edit invalid intermediate JSON without losing
  // their work. Only commit to the store when valid.
  const [mappingDraft, setMappingDraft] = useState(() => JSON.stringify(inputMapping, null, 2));
  const [mappingError, setMappingError] = useState<string | null>(null);

  const parsed = subworkflowConfigSchema.safeParse({
    workflowId: workflowId ?? '',
    inputMapping,
  });
  const error = parsed.success
    ? null
    : (parsed.error.issues.find((i) => i.path[0] === 'workflowId')?.message ?? null);

  const excludeIds = currentWorkflowId ? [currentWorkflowId] : [];

  return (
    <div data-testid="subworkflow-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={workflowIdId}
          className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Target Workflow
        </label>
        <WorkflowPicker
          value={workflowId}
          onChange={(next) => updateNodeConfig(nodeId, { workflowId: next ?? '' })}
          excludeIds={excludeIds}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
        <p className="text-xs text-text-muted">
          The current workflow is hidden to prevent direct self-recursion. Indirect cycles are
          stopped server-side by the recursion-depth limit.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputMappingId}
          className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Input Mapping
        </label>
        <textarea
          id={inputMappingId}
          spellCheck={false}
          value={mappingDraft}
          rows={6}
          onChange={(e) => {
            const next = e.target.value;
            setMappingDraft(next);
            try {
              const parsedJson = next.trim() === '' ? {} : (JSON.parse(next) as unknown);
              if (
                typeof parsedJson === 'object' &&
                parsedJson !== null &&
                !Array.isArray(parsedJson)
              ) {
                setMappingError(null);
                updateNodeConfig(nodeId, { inputMapping: parsedJson });
              } else {
                setMappingError('Input mapping must be a JSON object');
              }
            } catch (err) {
              setMappingError(`Invalid JSON: ${(err as Error).message}`);
            }
          }}
          className="rounded-md border border-white/10 bg-elevated px-3 py-2 font-mono text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
          placeholder={'{\n  "name": "{{trigger.name}}"\n}'}
        />
        <p className="text-xs text-text-muted">
          JSON object mapping subworkflow trigger keys to data-pill expressions. Resolved against
          the parent scope before invocation.
        </p>
        {mappingError && (
          <p role="alert" className="text-xs text-red-400">
            {mappingError}
          </p>
        )}
      </div>
    </div>
  );
}
