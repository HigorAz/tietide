import { buildFlowNodes, wavePath, NODE_R, type FlowGeo, type FlowIcon } from './authFlowGeometry';

// 24×24 lucide-style glyphs for the pipeline steps.
const ICON_PATHS: Record<FlowIcon, string> = {
  webhook:
    'M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 1 1 2 17c.01-.7.2-1.4.57-2M6 17l3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06M12 6l3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8',
  ai: 'M9.94 14.34a2 2 0 0 0-1.6-1.6L2 11.5l6.34-1.24a2 2 0 0 0 1.6-1.6L11.5 2l1.24 6.34a2 2 0 0 0 1.6 1.6L21 11.5l-6.34 1.24a2 2 0 0 0-1.6 1.6L11.5 21Z M20 3v4 M22 5h-4',
  code: 'm16 18 6-6-6-6 M8 6l-6 6 6 6',
  email:
    'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
};

const ICON_SCALE = (NODE_R * 1.3) / 24;

/**
 * The animated "tide" workflow graph behind the gutter. Decorative only
 * (aria-hidden). Renders nothing until the layout has measured its geometry.
 */
export function AuthFlow({ geo }: { geo: FlowGeo | null }): JSX.Element | null {
  if (!geo || geo.w <= 0 || geo.h <= 0) return null;

  const nodes = buildFlowNodes(geo);
  const d = wavePath(nodes, 24, 6);

  return (
    <svg
      className="auth-flow"
      viewBox={`0 0 ${geo.w} ${geo.h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="auth-wave" style={{ strokeWidth: 11, opacity: 0.08 }} d={d} />
      <path className="auth-wave auth-wave--dash" style={{ strokeWidth: 2, opacity: 0.85 }} d={d} />
      {nodes.map((n, i) => {
        const tx = n.x - 12 * ICON_SCALE;
        const ty = n.y - 12 * ICON_SCALE;
        return (
          <g key={n.icon} className="auth-node" style={{ animationDelay: `${i * 0.4}s` }}>
            <circle className="auth-ripple" cx={n.x} cy={n.y} r={NODE_R + 9} />
            <circle className="auth-ring auth-ring--faint" cx={n.x} cy={n.y} r={NODE_R + 6} />
            <circle className="auth-disc" cx={n.x} cy={n.y} r={NODE_R} />
            <circle className="auth-ring" cx={n.x} cy={n.y} r={NODE_R} />
            <g
              transform={`translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${ICON_SCALE.toFixed(3)})`}
            >
              <path className="auth-icon" d={ICON_PATHS[n.icon]} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
