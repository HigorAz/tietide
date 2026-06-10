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
  selected,
  interactionWidth,
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

  // A selected edge (or an actively-flowing one) reads brighter and thicker.
  const emphasized = active || selected === true;

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
      {/* Wide, invisible hit area so the thin visible stroke is easy to click and
          select (mirrors React Flow's BaseEdge interactionWidth). Carries the
          edge-interaction class React Flow uses for pointer handling. */}
      <path
        d={edgePath}
        className="react-flow__edge-interaction"
        fill="none"
        stroke="transparent"
        strokeWidth={interactionWidth ?? 20}
        strokeLinecap="round"
      />
      {/* Faint, wider "water-body" underlay beneath the flowing dashes — gives the
          connection depth, echoing the tide lines on the auth pages. Decorative
          only (no edge-path class), so it never intercepts edge selection. */}
      <path
        d={edgePath}
        className="pointer-events-none"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={emphasized ? 10 : 8}
        strokeLinecap="round"
        opacity={emphasized ? 0.22 : 0.1}
      />
      <path
        id={id}
        data-testid="living-ink-edge"
        data-active={active ? 'true' : 'false'}
        data-selected={selected === true ? 'true' : 'false'}
        data-kind={kind}
        d={edgePath}
        // Idle edges flow gently and continuously (tide); an active result-view
        // segment flows faster/brighter via living-ink. A selected edge stays at
        // full opacity so the user sees what they're about to delete.
        className={cn(
          'react-flow__edge-path',
          active ? 'animate-living-ink' : 'animate-tide-flow',
          !emphasized && 'opacity-70',
        )}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={emphasized ? 3.5 : 2.5}
        strokeLinecap="round"
        strokeDasharray={isError ? '5 6' : '6 8'}
        filter={`url(#${GLOW_ID})`}
        markerEnd={markerEnd}
      />
    </>
  );
}

export const LivingInkEdge = memo(LivingInkEdgeImpl);
LivingInkEdge.displayName = 'LivingInkEdge';
