import { useId } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from './formRegistry';
import { DataPillInput } from './DataPillInput';

export function ReturnForm({ nodeId, config }: NodeConfigFormProps) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const valueId = useId();

  const value = typeof config.value === 'string' ? config.value : '';

  return (
    <div data-testid="return-form" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={valueId}
          className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Return Value <span className="text-text-muted">(optional)</span>
        </label>
        <DataPillInput
          id={valueId}
          nodeId={nodeId}
          value={value}
          placeholder="{{http_1.response.body}}"
          onChange={(next) => updateNodeConfig(nodeId, { value: next })}
        />
        <p className="text-xs text-text-muted">
          Value to forward as this workflow's result when invoked as a subworkflow. Leave empty to
          forward the upstream node's output unchanged.
        </p>
      </div>
    </div>
  );
}
