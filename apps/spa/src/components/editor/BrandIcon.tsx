import type { CSSProperties } from 'react';
import { APP_INFO, DEFAULT_APP_FALLBACK_ICON, type AppId } from './nodeApps';

export interface BrandIconProps {
  appId: AppId;
  size?: number;
  // Render the brand colour for the SVG path. When false, the icon inherits
  // the current `text-` colour like a lucide icon — useful for monochrome
  // sidebar rows where colour-flooding would compete with selection state.
  colored?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function BrandIcon({
  appId,
  size = 18,
  colored = true,
  ariaLabel,
  className,
}: BrandIconProps): React.ReactElement {
  const info = APP_INFO[appId];

  if (info.brand) {
    const fill = colored ? `#${info.brand.hex}` : 'currentColor';
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
