import { useEffect, useMemo } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ExternalLink } from 'lucide-react';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { cn } from '@/utils/cn';

export interface WorkflowPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  // Workflow IDs to hide from the picker — typically the current workflow to
  // prevent direct self-recursion at edit time. Server-side recursion-depth
  // guard still protects indirect cycles.
  excludeIds?: string[];
  disabled?: boolean;
}

export function WorkflowPicker({
  value,
  onChange,
  excludeIds = [],
  disabled = false,
}: WorkflowPickerProps): JSX.Element {
  const workflows = useWorkflowsStore((s) => s.workflows);
  const status = useWorkflowsStore((s) => s.status);
  const fetch = useWorkflowsStore((s) => s.fetch);

  useEffect(() => {
    if (status === 'idle') {
      void fetch();
    }
  }, [status, fetch]);

  const visible = useMemo(
    () => workflows.filter((w) => !excludeIds.includes(w.id)),
    [workflows, excludeIds],
  );
  const selected = useMemo(() => visible.find((w) => w.id === value) ?? null, [visible, value]);

  if (visible.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-white/10 bg-surface p-4 text-sm"
        data-testid="workflow-picker-empty"
      >
        <p className="text-text-secondary">No workflows available to invoke as a subworkflow.</p>
        <a
          href="/dashboard"
          className={cn(
            'mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent-teal',
            'hover:underline focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        >
          <span>Create a workflow first</span>
          <ExternalLink aria-hidden className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <Select.Root
      value={value ?? ''}
      onValueChange={(next) => onChange(next || null)}
      disabled={disabled}
    >
      <Select.Trigger
        aria-label="Subworkflow target"
        data-testid="workflow-picker-trigger"
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary transition',
          'hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-accent-teal',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <Select.Value placeholder="Select a workflow…" aria-label={selected?.name}>
          {selected ? <span className="truncate">{selected.name}</span> : undefined}
        </Select.Value>
        <Select.Icon>
          <ChevronDown aria-hidden className="h-4 w-4 text-text-secondary" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'z-50 min-w-[--radix-select-trigger-width] overflow-hidden rounded-md border border-white/10 bg-surface shadow-lg',
          )}
        >
          <Select.Viewport className="p-1">
            {visible.map((wf) => (
              <Select.Item
                key={wf.id}
                value={wf.id}
                className={cn(
                  'relative flex cursor-pointer select-none items-start gap-2 rounded-md px-2 py-2 text-sm text-text-primary outline-none',
                  'data-[highlighted]:bg-white/5 data-[state=checked]:bg-white/10',
                )}
              >
                <span className="mt-0.5 w-4 flex-shrink-0">
                  <Select.ItemIndicator>
                    <Check aria-hidden className="h-4 w-4 text-accent-teal" />
                  </Select.ItemIndicator>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <Select.ItemText asChild>
                    <span className="truncate font-medium">{wf.name}</span>
                  </Select.ItemText>
                  {wf.description ? (
                    <span className="truncate text-xs text-text-secondary">{wf.description}</span>
                  ) : null}
                </span>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
