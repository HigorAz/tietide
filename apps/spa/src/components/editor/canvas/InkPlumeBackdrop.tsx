/**
 * Decorative SVG layer rendered behind the React Flow canvas. Mimics the
 * "ink-in-water" plumes from the PROTÓTIPO TIETIDE.jpeg reference — three
 * heavily-blurred navy-blue ellipses that drift slowly along independent
 * paths, so the dark canvas has depth instead of being a flat #0A2540 wash.
 *
 * Notes:
 * - `pointer-events: none` so the layer doesn't intercept pan/zoom gestures.
 * - `aria-hidden` because it's purely decorative.
 * - Animations are gated by `prefers-reduced-motion: reduce` via a CSS-only
 *   `<style>` block so the plumes hold position for motion-sensitive users.
 */
export function InkPlumeBackdrop(): JSX.Element {
  return (
    <svg
      data-testid="ink-plume-backdrop"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1000 700"
    >
      <defs>
        <radialGradient id="inkPlumeNavy" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1E3A6B" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#0E2447" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#06182E" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="inkPlumeTeal" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00D4B3" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#00D4B3" stopOpacity="0" />
        </radialGradient>
        <filter id="inkPlumeBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="32" />
        </filter>
      </defs>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .ink-plume { animation: none !important; }
        }
        @keyframes ink-drift-1 {
          0%   { transform: translate(0px, 0px) scale(1); }
          50%  { transform: translate(40px, -30px) scale(1.08); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes ink-drift-2 {
          0%   { transform: translate(0px, 0px) scale(1); }
          50%  { transform: translate(-50px, 40px) scale(0.95); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes ink-drift-3 {
          0%   { transform: translate(0px, 0px) scale(1); }
          50%  { transform: translate(30px, 50px) scale(1.05); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .ink-plume-1 { animation: ink-drift-1 48s ease-in-out infinite; transform-origin: 280px 220px; }
        .ink-plume-2 { animation: ink-drift-2 60s ease-in-out infinite; transform-origin: 720px 360px; }
        .ink-plume-3 { animation: ink-drift-3 52s ease-in-out infinite; transform-origin: 520px 580px; }
      `}</style>

      <g filter="url(#inkPlumeBlur)">
        <ellipse
          className="ink-plume ink-plume-1"
          cx="280"
          cy="220"
          rx="240"
          ry="170"
          fill="url(#inkPlumeNavy)"
        />
        <ellipse
          className="ink-plume ink-plume-2"
          cx="720"
          cy="360"
          rx="280"
          ry="200"
          fill="url(#inkPlumeNavy)"
        />
        <ellipse
          className="ink-plume ink-plume-3"
          cx="520"
          cy="580"
          rx="260"
          ry="180"
          fill="url(#inkPlumeTeal)"
        />
      </g>
    </svg>
  );
}
