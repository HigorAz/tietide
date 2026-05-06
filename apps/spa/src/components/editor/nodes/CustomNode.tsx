import { memo, type MouseEvent } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { SkipForward } from 'lucide-react';
import { NODE_CATALOG, NodeCategory } from '@tietide/shared';
import { cn } from '@/utils/cn';
import { useEditorStore } from '@/stores/editorStore';
import { selectNodeStateAt, useExecutionLiveStore } from '@/stores/executionLiveStore';
import { getNodeIcon } from './nodeIcons';
import type { CustomNodeData, NodeStatus } from './CustomNode.types';

const STATUS_RING_CLASS: Record<NodeStatus, string> = {
  idle: 'ring-status-idle/60',
  running: 'ring-status-running animate-pulse-ring',
  success: 'ring-status-success',
  failed: 'ring-status-failed',
  skipped: 'ring-status-idle/40',
};

function CustomNodeImpl({ id, data, selected }: NodeProps<CustomNodeData>) {
  const liveStatus = useExecutionLiveStore((s) => selectNodeStateAt(s, id)?.status);
  const status: NodeStatus = liveStatus ?? data.status ?? 'idle';
  const Icon = getNodeIcon(data.nodeType);
  const skipped = data.skipped === true;
  const isTrigger =
    NODE_CATALOG.find((d) => d.type === data.nodeType)?.category === NodeCategory.TRIGGER;
  const toggleNodeSkip = useEditorStore((s) => s.toggleNodeSkip);

  const onSkipClick = (e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    toggleNodeSkip(id);
  };

  return (
    <div
      data-testid="custom-node"
      data-selected={selected ? 'true' : 'false'}
      data-skipped={skipped ? 'true' : 'false'}
      className={cn(
        'relative flex flex-col items-center gap-2 select-none',
        selected && 'drop-shadow-[0_0_12px_rgba(0,212,179,0.45)]',
        skipped && 'opacity-50 outline-dashed outline-1 outline-text-muted rounded-md',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-accent-teal !border-0"
      />

      {!isTrigger && (
        <button
          type="button"
          data-testid="custom-node-skip-toggle"
          aria-label={skipped ? 'Resume node' : 'Skip node'}
          aria-pressed={skipped}
          onClick={onSkipClick}
          className={cn(
            'absolute -top-2 right-0 rounded-full p-1',
            'bg-elevated/90 border border-white/10 text-text-secondary',
            'hover:text-accent-teal hover:border-accent-teal',
            'focus:outline-none focus:ring-2 focus:ring-accent-teal',
            skipped && 'text-accent-teal border-accent-teal',
          )}
        >
          <SkipForward size={12} strokeWidth={2} aria-hidden />
        </button>
      )}

      <div
        data-testid="custom-node-ring"
        data-status={status}
        className={cn(
          'relative flex items-center justify-center rounded-full',
          'h-16 w-16 ring-4 ring-offset-2 ring-offset-deep-blue',
          'bg-gradient-to-br from-elevated to-surface',
          'shadow-[inset_0_-4px_8px_rgba(0,0,0,0.35),inset_0_2px_3px_rgba(255,255,255,0.05)]',
          STATUS_RING_CLASS[status],
          selected && 'outline outline-2 outline-accent-teal',
        )}
      >
        <div data-testid="custom-node-icon" className="text-accent-teal">
          <Icon size={24} strokeWidth={2} aria-hidden />
        </div>
      </div>

      <div
        className={cn(
          'min-w-[120px] max-w-[180px] rounded-md border px-3 py-2 text-center',
          'bg-elevated/90 backdrop-blur-sm',
          selected ? 'border-accent-teal' : 'border-white/5',
          skipped && 'border-dashed',
        )}
      >
        <div className="text-sm font-medium text-text-primary leading-tight">{data.label}</div>
        {data.description && (
          <div
            data-testid="custom-node-description"
            className="mt-1 text-xs text-text-secondary leading-snug"
          >
            {data.description}
          </div>
        )}
        {skipped && (
          <div
            data-testid="custom-node-skipped-badge"
            className="mt-2 inline-block rounded bg-accent-teal/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-teal"
          >
            Skipped
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-accent-teal !border-0"
      />
    </div>
  );
}

export const CustomNode = memo(CustomNodeImpl);
CustomNode.displayName = 'CustomNode';
