/**
 * Decorative layer rendered behind the React Flow canvas. Mirrors the auth-page
 * "tide" background — a teal/blue radial glow that is vivid in the centre and
 * fades to deep-blue on both sides — but STATIC (no breathing animation) and a
 * notch darker (lower-alpha glow + a corner vignette) so the editor canvas reads
 * calmer and darker than the marketing/login surface while staying on-brand.
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
      {/* mirrored teal/blue glow — static and lower-alpha than the login page */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 820px at 50% 26%, rgba(0, 212, 179, 0.08), transparent 60%),' +
            'radial-gradient(900px 680px at 50% 112%, rgba(51, 154, 240, 0.05), transparent 60%)',
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
