import { useEffect, useMemo, useState } from 'react';
import { ORG_ROLE_RANK, type OrgRole } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { useMembersStore } from '@/stores/membersStore';
import { useToastStore } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import type { OrgMember } from '@/api/organizations';
import { InviteMemberDialog } from '@/components/organizations/InviteMemberDialog';
import { ChangeRoleDialog } from '@/components/organizations/ChangeRoleDialog';
import { RemoveMemberDialog } from '@/components/organizations/RemoveMemberDialog';

const ALL_ROLES: OrgRole[] = ['SUPERADMIN', 'ADMIN', 'MEMBER', 'VIEWER'];

const rolesUpTo = (role: OrgRole): OrgRole[] =>
  ALL_ROLES.filter((r) => ORG_ROLE_RANK[r] <= ORG_ROLE_RANK[role]);

const ghostBtn = cn(
  'rounded-md px-2.5 py-1 text-xs font-medium text-text-secondary transition',
  'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

export function OrgMembersPage(): JSX.Element {
  const activeOrg = useAuthStore((s) => s.activeOrganization);
  const { members, invites, status, fetch, invite, changeRole, removeMember, revokeInvite } =
    useMembersStore();
  const toast = useToastStore((s) => s.show);

  const myRole = activeOrg?.role;
  const canManage = myRole === 'SUPERADMIN' || myRole === 'ADMIN';
  const assignableRoles = useMemo(() => (myRole ? rolesUpTo(myRole) : []), [myRole]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<OrgMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);

  const orgId = activeOrg?.id;
  useEffect(() => {
    if (orgId) void fetch(orgId, canManage);
  }, [orgId, canManage, fetch]);

  if (!activeOrg) {
    return (
      <div className="p-6">
        <p className="text-sm text-text-secondary">
          Select or create a workspace to manage its members.
        </p>
      </div>
    );
  }

  const canActOn = (m: OrgMember): boolean =>
    canManage && !!myRole && ORG_ROLE_RANK[m.role] <= ORG_ROLE_RANK[myRole];

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Members</h1>
          <p className="text-sm text-text-secondary">{activeOrg.name}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className={cn(
              'rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
              'hover:bg-accent-teal/90 focus:outline-none focus:ring-1 focus:ring-accent-teal',
            )}
          >
            Invite member
          </button>
        )}
      </div>

      {status === 'loading' && <p className="text-sm text-text-secondary">Loading…</p>}
      {status === 'error' && <p className="text-sm text-error">Could not load members.</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase text-text-secondary">
            <th className="py-2">Name</th>
            <th className="py-2">Email</th>
            <th className="py-2">Role</th>
            {canManage && <th className="py-2 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} className="border-b border-white/5">
              <td className="py-2 text-text-primary">{m.name}</td>
              <td className="py-2 text-text-secondary">{m.email}</td>
              <td className="py-2 text-text-secondary">{m.role}</td>
              {canManage && (
                <td className="py-2 text-right">
                  {canActOn(m) && (
                    <span className="inline-flex gap-1">
                      <button type="button" className={ghostBtn} onClick={() => setRoleTarget(m)}>
                        Change role
                      </button>
                      <button
                        type="button"
                        className={cn(ghostBtn, 'text-error hover:bg-error/10')}
                        onClick={() => setRemoveTarget(m)}
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canManage && invites.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Pending invitations</h2>
          <ul className="space-y-1">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm"
              >
                <span className="text-text-secondary">
                  {inv.email} · <span className="text-text-primary">{inv.role}</span>
                </span>
                <button
                  type="button"
                  className={cn(ghostBtn, 'text-error hover:bg-error/10')}
                  onClick={() => {
                    void revokeInvite(activeOrg.id, inv.id).catch((err: unknown) =>
                      toast({
                        tone: 'error',
                        message: err instanceof Error ? err.message : 'Could not revoke invite',
                      }),
                    );
                  }}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inviteOpen && (
        <InviteMemberDialog
          assignableRoles={assignableRoles}
          onClose={() => setInviteOpen(false)}
          onSubmit={async (email, role) => {
            await invite(activeOrg.id, email, role);
            setInviteOpen(false);
            toast({ tone: 'success', message: `Invitation sent to ${email}.` });
          }}
        />
      )}

      {roleTarget && (
        <ChangeRoleDialog
          member={roleTarget}
          assignableRoles={assignableRoles}
          onClose={() => setRoleTarget(null)}
          onSubmit={async (role) => {
            await changeRole(activeOrg.id, roleTarget.userId, role);
            setRoleTarget(null);
            toast({ tone: 'success', message: `${roleTarget.name} is now ${role}.` });
          }}
        />
      )}

      {removeTarget && (
        <RemoveMemberDialog
          member={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onConfirm={async () => {
            await removeMember(activeOrg.id, removeTarget.userId);
            setRemoveTarget(null);
            toast({ tone: 'success', message: `${removeTarget.name} was removed.` });
          }}
        />
      )}
    </div>
  );
}
