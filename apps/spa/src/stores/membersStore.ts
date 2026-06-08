import { create } from 'zustand';
import type { OrgRole } from '@tietide/shared';
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

export type MembersStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface MembersState {
  members: OrgMember[];
  invites: OrgInvite[];
  status: MembersStatus;
  error: string | null;
}

export interface MembersActions {
  // Loads members; invites only when the caller can manage them (avoids a 403 for
  // a MEMBER/VIEWER, who cannot list invites).
  fetch: (orgId: string, canManage?: boolean) => Promise<void>;
  invite: (orgId: string, email: string, role: OrgRole) => Promise<OrgInvite>;
  changeRole: (orgId: string, userId: string, role: OrgRole) => Promise<OrgMember>;
  removeMember: (orgId: string, userId: string) => Promise<void>;
  revokeInvite: (orgId: string, inviteId: string) => Promise<void>;
}

export type MembersStore = MembersState & MembersActions;

const toMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong';
};

const initialState: MembersState = {
  members: [],
  invites: [],
  status: 'idle',
  error: null,
};

export const useMembersStore = create<MembersStore>((set, get) => ({
  ...initialState,

  fetch: async (orgId, canManage = false) => {
    set({ status: 'loading', error: null });
    try {
      const members = await apiListMembers(orgId);
      const invites = canManage ? await apiListInvites(orgId) : [];
      set({ members, invites, status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
    }
  },

  invite: async (orgId, email, role) => {
    const created = await apiCreateInvite(orgId, email, role);
    set({ invites: [created, ...get().invites] });
    return created;
  },

  changeRole: async (orgId, userId, role) => {
    const updated = await apiChangeRole(orgId, userId, role);
    set({ members: get().members.map((m) => (m.userId === userId ? updated : m)) });
    return updated;
  },

  removeMember: async (orgId, userId) => {
    const previous = get().members;
    set({ members: previous.filter((m) => m.userId !== userId) });
    try {
      await apiRemoveMember(orgId, userId);
    } catch (err) {
      set({ members: previous });
      throw err;
    }
  },

  revokeInvite: async (orgId, inviteId) => {
    const previous = get().invites;
    set({ invites: previous.filter((i) => i.id !== inviteId) });
    try {
      await apiRevokeInvite(orgId, inviteId);
    } catch (err) {
      set({ invites: previous });
      throw err;
    }
  },
}));

export const resetMembersStore = (): void => {
  useMembersStore.setState({ ...initialState });
};
