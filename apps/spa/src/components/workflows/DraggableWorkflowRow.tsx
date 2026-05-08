import type { CSSProperties, ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/utils/cn';

interface DraggableWorkflowRowProps {
  workflowId: string;
  children: ReactNode;
}

/**
 * Wraps a WorkflowRow in a dnd-kit useDraggable container so the row can be
 * dragged onto a folder in the FolderTree. The activation distance prevents
 * accidental drags when the user clicks normally on internal controls.
 */
export function DraggableWorkflowRow({
  workflowId,
  children,
}: DraggableWorkflowRowProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: workflowId,
    data: { kind: 'workflow', workflowId },
  });

  const style: CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : {};

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn('list-none', isDragging && 'opacity-60')}
    >
      {children}
    </li>
  );
}
