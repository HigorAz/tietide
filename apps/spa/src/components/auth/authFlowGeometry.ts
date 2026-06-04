// Pure geometry helpers for the decorative "tide" workflow graph on the auth pages.
// Kept framework-free so it can be unit-tested without rendering.

export interface FlowGeo {
  /** container width in px (svg viewBox width) */
  w: number;
  /** container height in px (svg viewBox height) */
  h: number;
  /** x of the first node (its left edge meets the end of the title text) */
  x0: number;
  /** x of the last node (its right edge meets the form's left edge) */
  x3: number;
}

export type FlowIcon = 'webhook' | 'ai' | 'code' | 'email';

export interface FlowNode {
  x: number;
  y: number;
  icon: FlowIcon;
}

/** The pipeline shown along the tide: trigger → enrich → transform → deliver. */
export const FLOW_SEQ: readonly FlowIcon[] = ['webhook', 'ai', 'code', 'email'];

/** Node radius (px) and the gap kept between a node's edge and the adjacent text/form. */
export const NODE_R = 22;
export const FLOW_GAP = 16;

/**
 * Four evenly-spaced nodes on a rising diagonal, with a vertically-centred span
 * so the graph reads with equal breathing room top and bottom.
 */
export function buildFlowNodes(geo: FlowGeo): FlowNode[] {
  const { h, x0, x3 } = geo;
  const cy = h / 2;
  const span = Math.min(h * 0.66, 470);
  const yBottom = cy + span / 2; // first node (webhook) sits low-left
  const yTop = cy - span / 2; // last node (email) sits high-right, by the form
  return FLOW_SEQ.map((icon, i) => {
    const t = i / (FLOW_SEQ.length - 1);
    return { x: x0 + (x3 - x0) * t, y: yBottom + (yTop - yBottom) * t, icon };
  });
}

/**
 * A water-like wave that passes exactly through each node: a sine offset applied
 * perpendicular to the polyline, with `humps` a multiple of the gap count so the
 * offset is zero at every node anchor.
 */
export function wavePath(nodes: { x: number; y: number }[], amp: number, humps: number): string {
  if (nodes.length < 2) return '';
  const dense: { x: number; y: number; gi: number }[] = [];
  const seg = 46;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    for (let s = 0; s < seg; s++) {
      const t = s / seg;
      dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, gi: i + t });
    }
  }
  const last = nodes[nodes.length - 1];
  dense.push({ x: last.x, y: last.y, gi: nodes.length - 1 });

  const total = nodes.length - 1;
  const points = dense.map((p, idx) => {
    const prev = dense[Math.max(0, idx - 1)];
    const next = dense[Math.min(dense.length - 1, idx + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const off = Math.sin((p.gi / total) * Math.PI * humps) * amp;
    return { x: p.x + -dy * off, y: p.y + dx * off };
  });

  return 'M' + points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
}
