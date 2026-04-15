import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { cn } from '@/utils/cn';
import { getNodeIcon } from './nodeIcons';
import type { CustomNodeData, NodeStatus } from './CustomNode.types';

const STATUS_RING_CLASS: Record<NodeStatus, string> = {
  idle: 'ring-status-idle/60',
  running: 'ring-status-running animate-pulse-ring',
  success: 'ring-status-success',
  failed: 'ring-status-failed',
};

function CustomNodeImpl({ data, selected }: NodeProps<CustomNodeData>) {
  const status: NodeStatus = data.status ?? 'idle';
  const Icon = getNodeIcon(data.nodeType);

  return (
    <div
      data-testid="custom-node"
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'flex flex-col items-center gap-2 select-none',
        selected && 'drop-shadow-[0_0_12px_rgba(0,212,179,0.45)]',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-accent-teal !border-0"
      />

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
