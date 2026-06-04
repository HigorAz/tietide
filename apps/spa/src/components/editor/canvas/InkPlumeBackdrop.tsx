/**
 * Decorative layer rendered behind the React Flow canvas. Mirrors the auth-page
 * "tide" background — a teal/blue radial glow that is vivid in the centre and
 * fades to deep-blue on both sides — but a notch darker (lower-alpha glow + a
 * corner vignette) so the editor canvas reads calmer than the marketing/login
 * surface while staying on-brand.
 *
 * Notes:
 * - `pointer-events: none` so the layer doesn't intercept pan/zoom gestures.
 * - `aria-hidden` because it's purely decorative.
 * - The slow drift is gated by `prefers-reduced-motion` via a CSS-only block.
 */
export function InkPlumeBackdrop(): JSX.Element {
  return (
    <div
      data-testid="ink-plume-backdrop"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .ink-tide-glow { animation: ink-tide-breathe 18s ease-in-out infinite; }
        }
        @keyframes ink-tide-breathe {
          0%, 100% { opacity: 0.85; transform: translate3d(0, 0, 0) scale(1); }
          50%      { opacity: 1;    transform: translate3d(0, -14px, 0) scale(1.05); }
        }
      `}</style>

      {/* mirrored teal/blue glow over deep-blue — lower alpha than the login page */}
      <div
        className="ink-tide-glow absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 820px at 50% 26%, rgba(0, 212, 179, 0.12), transparent 60%),' +
            'radial-gradient(900px 680px at 50% 112%, rgba(51, 154, 240, 0.08), transparent 60%)',
        }}
      />

      {/* corner vignette: darkens the edges so the centre reads brighter and the
          whole canvas sits a shade darker than the auth background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(135% 135% at 50% 42%, transparent 55%, rgba(3, 14, 28, 0.55) 100%)',
        }}
      />
    </div>
  );
}
