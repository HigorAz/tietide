import { getAppIdForNodeType, type AppId } from './nodeApps';
import { getNodeIcon } from './nodes/nodeIcons';
import { BrandIcon } from './BrandIcon';

// Apps with no real brand — keep their distinctive per-node-type Lucide icon
// (a brand icon would render every core/logic node identically).
const GENERIC_APPS: ReadonlySet<AppId> = new Set<AppId>(['core', 'logic', 'custom']);

export interface NodeGlyphProps {
  type: string;
  size?: number;
  className?: string;
}

/**
 * The glyph shown for a workflow node: the provider's brand icon (Discord,
 * Gmail, Slack, …) in full brand colour for connector nodes, falling back to
 * the per-type Lucide icon for Core/Logic/annotation nodes. `onDarkSurface`
 * lightens near-black brand marks (GitHub, Notion) so they stay legible on the
 * deep-blue canvas while every other brand keeps its true colour.
 */
export function NodeGlyph({ type, size = 24, className }: NodeGlyphProps): React.ReactElement {
  const appId = getAppIdForNodeType(type);
  if (!GENERIC_APPS.has(appId)) {
    return <BrandIcon appId={appId} size={size} colored onDarkSurface className={className} />;
  }
  const Icon = getNodeIcon(type);
  return <Icon size={size} strokeWidth={2} aria-hidden className={className} />;
}
