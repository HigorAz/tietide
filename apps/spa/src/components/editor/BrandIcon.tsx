import type { CSSProperties } from 'react';
import { APP_INFO, DEFAULT_APP_FALLBACK_ICON, type AppId } from './nodeApps';

export interface BrandIconProps {
  appId: AppId;
  size?: number;
  // Render the brand colour for the SVG path. When false, the icon inherits
  // the current `text-` colour like a lucide icon — useful for monochrome
  // sidebar rows where colour-flooding would compete with selection state.
  colored?: boolean;
  // When true (with `colored`), a brand colour too dark to read on the app's
  // dark surface is swapped for its light/dark-mode equivalent so the logo
  // stays visible (e.g. Notion #000, GitHub #181717). Opt-in so monochrome
  // contexts and lighter surfaces keep the literal brand hex.
  onDarkSurface?: boolean;
  ariaLabel?: string;
  className?: string;
}

// Soft near-white used as the on-dark fallback — the conventional dark-mode
// treatment for near-black brand marks (GitHub, Notion).
const DARK_SURFACE_FALLBACK = '#E6EDF3';

// Relative luminance (0–1) of a 6-digit hex (no leading '#'). Below ~0.22 a
// colour is too dark to read on the deep-blue canvas.
function isTooDarkForDarkSurface(hex: string): boolean {
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.22;
}

export function BrandIcon({
  appId,
  size = 18,
  colored = true,
  onDarkSurface = false,
  ariaLabel,
  className,
}: BrandIconProps): React.ReactElement {
  const info = APP_INFO[appId];

  if (info.brand) {
    const tooDark = onDarkSurface && isTooDarkForDarkSurface(info.brand.hex);
    const fill = colored
      ? tooDark
        ? DARK_SURFACE_FALLBACK
        : `#${info.brand.hex}`
      : 'currentColor';
    const dim: CSSProperties = { width: size, height: size, flexShrink: 0 };
    return (
      <svg
        viewBox="0 0 24 24"
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
        data-testid={`brand-icon-${appId}`}
        style={dim}
        className={className}
      >
        <path d={info.brand.path} fill={fill} />
      </svg>
    );
  }

  const Icon = info.icon ?? DEFAULT_APP_FALLBACK_ICON;
  return (
    <Icon
      size={size}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      data-testid={`brand-icon-${appId}`}
      className={className}
    />
  );
}
