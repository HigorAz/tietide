import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeType } from '@tietide/shared';
import {
  RECENTLY_USED_NODES_KEY_PREFIX,
  RECENTLY_USED_NODES_LIMIT,
  pushRecentNode,
  readRecentNodes,
  recentlyUsedNodesKey,
} from './recentlyUsedNodes';

describe('recentlyUsedNodes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('recentlyUsedNodesKey', () => {
    it('should compose a key with the user id appended to the prefix', () => {
      expect(recentlyUsedNodesKey('user-123')).toBe(`${RECENTLY_USED_NODES_KEY_PREFIX}user-123`);
    });
  });

  describe('readRecentNodes', () => {
    it('should return an empty array when nothing is stored', () => {
      expect(readRecentNodes('user-1')).toEqual([]);
    });

    it('should return an empty array when the user id is empty', () => {
      localStorage.setItem(recentlyUsedNodesKey(''), JSON.stringify([NodeType.MANUAL_TRIGGER]));
      expect(readRecentNodes('')).toEqual([]);
    });

    it('should hydrate the persisted list in order', () => {
      localStorage.setItem(
        recentlyUsedNodesKey('user-1'),
        JSON.stringify([NodeType.HTTP_REQUEST, NodeType.MANUAL_TRIGGER]),
      );
      expect(readRecentNodes('user-1')).toEqual([NodeType.HTTP_REQUEST, NodeType.MANUAL_TRIGGER]);
    });

    it('should return an empty array when the stored value is malformed JSON', () => {
      localStorage.setItem(recentlyUsedNodesKey('user-1'), '{not json');
      expect(readRecentNodes('user-1')).toEqual([]);
    });

    it('should return an empty array when the stored value is not an array', () => {
      localStorage.setItem(recentlyUsedNodesKey('user-1'), JSON.stringify({ foo: 'bar' }));
      expect(readRecentNodes('user-1')).toEqual([]);
    });

    it('should drop non-string entries from a tampered list', () => {
      localStorage.setItem(
        recentlyUsedNodesKey('user-1'),
        JSON.stringify([NodeType.HTTP_REQUEST, 42, null, NodeType.MANUAL_TRIGGER]),
      );
      expect(readRecentNodes('user-1')).toEqual([NodeType.HTTP_REQUEST, NodeType.MANUAL_TRIGGER]);
    });

    it('should cap the hydrated list at the configured limit', () => {
      const oversized = Array.from(
        { length: RECENTLY_USED_NODES_LIMIT + 3 },
        () => NodeType.HTTP_REQUEST,
      );
      localStorage.setItem(recentlyUsedNodesKey('user-1'), JSON.stringify(oversized));
      expect(readRecentNodes('user-1')).toHaveLength(RECENTLY_USED_NODES_LIMIT);
    });
  });

  describe('pushRecentNode', () => {
    it('should prepend a new node type onto the list', () => {
      const next = pushRecentNode('user-1', NodeType.MANUAL_TRIGGER);
      expect(next).toEqual([NodeType.MANUAL_TRIGGER]);
    });

    it('should persist the updated list to localStorage', () => {
      pushRecentNode('user-1', NodeType.MANUAL_TRIGGER);
      expect(readRecentNodes('user-1')).toEqual([NodeType.MANUAL_TRIGGER]);
    });

    it('should dedupe and move an existing entry to the front', () => {
      pushRecentNode('user-1', NodeType.MANUAL_TRIGGER);
      pushRecentNode('user-1', NodeType.HTTP_REQUEST);
      const next = pushRecentNode('user-1', NodeType.MANUAL_TRIGGER);
      expect(next).toEqual([NodeType.MANUAL_TRIGGER, NodeType.HTTP_REQUEST]);
    });

    it(`should cap the list at ${RECENTLY_USED_NODES_LIMIT} entries`, () => {
      const types: NodeType[] = [
        NodeType.MANUAL_TRIGGER,
        NodeType.CRON_TRIGGER,
        NodeType.WEBHOOK_TRIGGER,
        NodeType.HTTP_REQUEST,
        NodeType.CODE,
        NodeType.CONDITIONAL,
      ];
      let last: NodeType[] = [];
      for (const t of types) {
        last = pushRecentNode('user-1', t);
      }
      expect(last).toHaveLength(RECENTLY_USED_NODES_LIMIT);
      // Most-recent-first: the final pushed type sits at index 0; the first pushed
      // type has been evicted because the list is capped.
      expect(last[0]).toBe(NodeType.CONDITIONAL);
      expect(last).not.toContain(NodeType.MANUAL_TRIGGER);
    });

    it('should be a no-op when the user id is empty', () => {
      const next = pushRecentNode('', NodeType.MANUAL_TRIGGER);
      expect(next).toEqual([]);
      expect(localStorage.getItem(recentlyUsedNodesKey(''))).toBeNull();
    });

    it('should swallow storage errors and return the in-memory list', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      const next = pushRecentNode('user-1', NodeType.MANUAL_TRIGGER);
      expect(next).toEqual([NodeType.MANUAL_TRIGGER]);
      expect(setItemSpy).toHaveBeenCalled();
    });
  });
});
