import { memo } from 'react';
import { getBezierPath, type EdgeProps } from 'reactflow';

const GRADIENT_ID = 'livingInkGradient';
const GLOW_ID = 'livingInkGlow';

function LivingInkEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) {
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
        d={edgePath}
        className="react-flow__edge-path animate-living-ink"
        fill="none"
        stroke={`url(#${GRADIENT_ID})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="8 6"
        filter={`url(#${GLOW_ID})`}
        markerEnd={markerEnd}
      />
    </>
  );
}

export const LivingInkEdge = memo(LivingInkEdgeImpl);
LivingInkEdge.displayName = 'LivingInkEdge';
