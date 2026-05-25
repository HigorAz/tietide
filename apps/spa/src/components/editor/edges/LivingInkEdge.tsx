import { memo } from 'react';
import { getBezierPath, type EdgeProps } from 'reactflow';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';

const GRADIENT_ID = 'livingInkGradient';
const ERROR_GRADIENT_ID = 'livingInkErrorGradient';
const GLOW_ID = 'livingInkGlow';

function LivingInkEdgeImpl({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const sourceStatus = useExecutionLiveStore((s) => s.nodes.get(source)?.status);
  const targetStatus = useExecutionLiveStore((s) => s.nodes.get(target)?.status);
  // The animated flow only shows in the Result view, so Configure stays a clean
  // editing canvas even with a run loaded.
  const isResultView = useEditorStore((s) => s.viewMode === 'result');
  const active = isResultView && sourceStatus === 'success' && targetStatus === 'running';
  const kind = (data as { kind?: 'success' | 'error' } | undefined)?.kind ?? 'success';
  const isError = kind === 'error';
  const gradientId = isError ? ERROR_GRADIENT_ID : GRADIENT_ID;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00D4B3" />
          <stop offset="100%" stopColor="#00E8C4" />
        </linearGradient>
        <linearGradient id={ERROR_GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EF4444" />
          <stop offset="100%" stopColor="#F87171" />
        </linearGradient>
        <filter id={GLOW_ID} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        id={id}
        data-testid="living-ink-edge"
        data-active={active ? 'true' : 'false'}
        data-kind={kind}
        d={edgePath}
        className={cn('react-flow__edge-path', active ? 'animate-living-ink' : 'opacity-40')}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={isError ? '6 4' : '8 6'}
        filter={`url(#${GLOW_ID})`}
        markerEnd={markerEnd}
      />
    </>
  );
}

export const LivingInkEdge = memo(LivingInkEdgeImpl);
LivingInkEdge.displayName = 'LivingInkEdge';
