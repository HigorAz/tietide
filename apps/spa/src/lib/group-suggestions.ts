import type { PathSuggestion } from './upstream-schema';

export interface SuggestionGroup {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  ref: string;
  suggestions: PathSuggestion[];
}

/**
 * Group flat path suggestions by their owning node, preserving first-seen order
 * (the BFS ancestor order from getUpstreamSchemas). Drives the per-node,
 * collapsible sections in the data-pill picker.
 */
export function groupSuggestions(suggestions: PathSuggestion[]): SuggestionGroup[] {
  const groups: SuggestionGroup[] = [];
  const byId = new Map<string, SuggestionGroup>();
  for (const s of suggestions) {
    let group = byId.get(s.nodeId);
    if (!group) {
      group = {
        nodeId: s.nodeId,
        nodeType: s.nodeType,
        nodeLabel: s.nodeLabel,
        ref: s.ref,
        suggestions: [],
      };
      byId.set(s.nodeId, group);
      groups.push(group);
    }
    group.suggestions.push(s);
  }
  return groups;
}
