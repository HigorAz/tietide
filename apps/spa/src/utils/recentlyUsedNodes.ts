import type { NodeType } from '@tietide/shared';

export const RECENTLY_USED_NODES_KEY_PREFIX = 'tietide-recently-used-nodes-';
export const RECENTLY_USED_NODES_LIMIT = 5;

export const recentlyUsedNodesKey = (userId: string): string =>
  `${RECENTLY_USED_NODES_KEY_PREFIX}${userId}`;

const sanitize = (raw: unknown): NodeType[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is NodeType => typeof entry === 'string');
};

export const readRecentNodes = (userId: string): NodeType[] => {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(recentlyUsedNodesKey(userId));
    if (raw === null) return [];
    return sanitize(JSON.parse(raw)).slice(0, RECENTLY_USED_NODES_LIMIT);
  } catch {
    return [];
  }
};

export const pushRecentNode = (userId: string, type: NodeType): NodeType[] => {
  if (!userId) return [];
  const current = readRecentNodes(userId);
  const next = [type, ...current.filter((existing) => existing !== type)].slice(
    0,
    RECENTLY_USED_NODES_LIMIT,
  );
  try {
    localStorage.setItem(recentlyUsedNodesKey(userId), JSON.stringify(next));
  } catch {
    // Storage unavailable / quota exhausted — degrade silently. Matches the
    // pattern used in tourStorage.ts and Sidebar's collapse persistence.
  }
  return next;
};
