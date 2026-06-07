import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/organizations', () => ({
  listMembers: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  listInvites: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
}));

import {
  listMembers as apiListMembers,
  changeMemberRole as apiChangeRole,
  removeMember as apiRemoveMember,
  listInvites as apiListInvites,
  createInvite as apiCreateInvite,
  revokeInvite as apiRevokeInvite,
  type OrgMember,
  type OrgInvite,
} from '@/api/organizations';
import { useMembersStore, resetMembersStore } from './membersStore';

const mLM = vi.mocked(apiListMembers);
const mCR = vi.mocked(apiChangeRole);
const mRM = vi.mocked(apiRemoveMember);
const mLI = vi.mocked(apiListInvites);
const mCI = vi.mocked(apiCreateInvite);
const mRI = vi.mocked(apiRevokeInvite);

const member = (userId: string, role: OrgMember['role'] = 'MEMBER'): OrgMember => ({
  userId,
  email: `${userId}@x.com`,
  name: userId,
  role,
  createdAt: '2026-06-01T00:00:00.000Z',
});

const invite = (id: string): OrgInvite => ({
  id,
  email: `${id}@x.com`,
  role: 'MEMBER',
  expiresAt: '2026-06-08T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
});

describe('membersStore', () => {
  beforeEach(() => {
    resetMembersStore();
    [mLM, mCR, mRM, mLI, mCI, mRI].forEach((m) => m.mockReset());
  });

  describe('fetch', () => {
    it('loads members and invites when the caller can manage', async () => {
      mLM.mockResolvedValueOnce([member('u1', 'SUPERADMIN')]);
      mLI.mockResolvedValueOnce([invite('inv-1')]);

      await useMembersStore.getState().fetch('org-1', true);

      const state = useMembersStore.getState();
      expect(state.status).toBe('ready');
      expect(state.members).toHaveLength(1);
      expect(state.invites).toHaveLength(1);
      expect(mLI).toHaveBeenCalledWith('org-1');
    });

    it('skips loading invites when the caller cannot manage', async () => {
      mLM.mockResolvedValueOnce([member('u1', 'VIEWER')]);

      await useMembersStore.getState().fetch('org-1', false);

      expect(mLI).not.toHaveBeenCalled();
      expect(useMembersStore.getState().invites).toEqual([]);
    });

    it('sets error status when loading fails', async () => {
      mLM.mockRejectedValueOnce(new Error('boom'));

      await useMembersStore.getState().fetch('org-1', true);

      expect(useMembersStore.getState().status).toBe('error');
      expect(useMembersStore.getState().error).toBe('boom');
    });
  });

  describe('invite', () => {
    it('prepends the created invite', async () => {
      useMembersStore.setState({ invites: [invite('old')] });
      mCI.mockResolvedValueOnce(invite('new'));

      await useMembersStore.getState().invite('org-1', 'new@x.com', 'MEMBER');

      expect(useMembersStore.getState().invites.map((i) => i.id)).toEqual(['new', 'old']);
      expect(mCI).toHaveBeenCalledWith('org-1', 'new@x.com', 'MEMBER');
    });
  });

  describe('changeRole', () => {
    it('replaces the member with the updated role', async () => {
      useMembersStore.setState({ members: [member('u1', 'MEMBER')] });
      mCR.mockResolvedValueOnce(member('u1', 'ADMIN'));

      await useMembersStore.getState().changeRole('org-1', 'u1', 'ADMIN');

      expect(useMembersStore.getState().members[0]?.role).toBe('ADMIN');
    });
  });

  describe('removeMember', () => {
    it('optimistically removes and keeps removed on success', async () => {
      useMembersStore.setState({ members: [member('u1'), member('u2')] });
      mRM.mockResolvedValueOnce(undefined);

      await useMembersStore.getState().removeMember('org-1', 'u1');

      expect(useMembersStore.getState().members.map((m) => m.userId)).toEqual(['u2']);
    });

    it('rolls back when the request fails', async () => {
      useMembersStore.setState({ members: [member('u1'), member('u2')] });
      mRM.mockRejectedValueOnce(new Error('403'));

      await expect(useMembersStore.getState().removeMember('org-1', 'u1')).rejects.toThrow('403');

      expect(useMembersStore.getState().members.map((m) => m.userId)).toEqual(['u1', 'u2']);
    });
  });

  describe('revokeInvite', () => {
    it('optimistically removes the invite', async () => {
      useMembersStore.setState({ invites: [invite('a'), invite('b')] });
      mRI.mockResolvedValueOnce(undefined);

      await useMembersStore.getState().revokeInvite('org-1', 'a');

      expect(useMembersStore.getState().invites.map((i) => i.id)).toEqual(['b']);
    });

    it('rolls back on failure', async () => {
      useMembersStore.setState({ invites: [invite('a')] });
      mRI.mockRejectedValueOnce(new Error('nope'));

      await expect(useMembersStore.getState().revokeInvite('org-1', 'a')).rejects.toThrow('nope');

      expect(useMembersStore.getState().invites.map((i) => i.id)).toEqual(['a']);
    });
  });
});
