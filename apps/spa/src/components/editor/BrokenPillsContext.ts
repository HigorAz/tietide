import { createContext, useContext } from 'react';

/**
 * Set of node ids that contain at least one invalid (broken) data-pill token.
 * Computed once in Canvas from findInvalidReferences and shared so each
 * CustomNode can mark itself red without every node recomputing the whole
 * validation context (#5).
 */
export const BrokenPillsContext = createContext<ReadonlySet<string>>(new Set());

export function useBrokenPills(): ReadonlySet<string> {
  return useContext(BrokenPillsContext);
}
