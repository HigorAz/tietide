/**
 * Decorative layer rendered behind the React Flow canvas. Mirrors the auth-page
 * "tide" background — a teal/blue radial glow vivid in the centre, fading to
 * deep-blue on both sides — but STATIC (no breathing animation) and a notch
 * darker than the marketing/login surface while staying on-brand. The faint
 * line grid that completes the login look is drawn by React Flow's <Background>
 * (lines variant) in Canvas.tsx so it pans with the canvas.
 *
 * Notes:
 * - `pointer-events: none` so the layer doesn't intercept pan/zoom gestures.
 * - `aria-hidden` because it's purely decorative.
 */
export function InkPlumeBackdrop(): JSX.Element {
  return (
    <div
      data-testid="ink-plume-backdrop"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* mirrored teal/blue glow — same shape as the login page (.auth-shell)
          but a touch dimmer so, on top of the darker `bg-canvas` base, the
          editor reads a little darker than login. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 820px at 50% 26%, rgba(0, 212, 179, 0.13), transparent 60%),' +
            'radial-gradient(900px 680px at 50% 112%, rgba(51, 154, 240, 0.08), transparent 60%)',
        }}
      />

      {/* Very soft corner vignette for depth only. Kept subtle so the surface
          (and the line grid) stays uniform — the login look without a heavy
          centre-to-edge fade. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(150% 150% at 50% 42%, transparent 70%, rgba(3, 14, 28, 0.30) 100%)',
        }}
      />
    </div>
  );
}
