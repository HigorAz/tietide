import { vi } from 'vitest';

/**
 * Test helper to drive the `useMediaQuery`/`useIsMobile` hooks in jsdom, which
 * has no real layout engine. Overrides `window.matchMedia` so a
 * `(min-width: 768px)` query resolves to the chosen viewport mode:
 *
 *   - 'desktop' → matches: true  → useIsMobile() === false
 *   - 'mobile'  → matches: false → useIsMobile() === true
 *
 * Usage:
 *   beforeEach(() => mockViewport('mobile'));
 *   afterEach(() => restoreViewport());
 *
 * Only `min-width` queries are interpreted; any other query resolves to false.
 */
export type ViewportMode = 'mobile' | 'desktop';

const MIN_WIDTH_RE = /\(min-width:\s*(\d+)px\)/;

export function mockViewport(mode: ViewportMode): void {
  const widthPx = mode === 'desktop' ? 1280 : 375;

  window.matchMedia = vi.fn((query: string): MediaQueryList => {
    const match = MIN_WIDTH_RE.exec(query);
    const matches = match ? widthPx >= Number(match[1]) : false;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    } as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;
}

export function restoreViewport(): void {
  // Reset to the desktop default the global test-setup installs.
  mockViewport('desktop');
}
