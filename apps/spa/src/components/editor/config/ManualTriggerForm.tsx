import type { NodeConfigFormProps } from './formRegistry';

export function ManualTriggerForm(_props: NodeConfigFormProps) {
  return (
    <div data-testid="manual-trigger-form" className="text-sm text-text-muted">
      <p>No configuration needed. This node starts the workflow when triggered manually.</p>
    </div>
  );
}
