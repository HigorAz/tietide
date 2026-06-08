import { useAuthStore } from '@/stores/authStore';
import { MembersManager } from '@/components/organizations/MembersManager';
import { SettingsCard } from './SettingsCard';
import { WorkspaceList } from './WorkspaceList';
import { WorkspaceAdminSection } from './WorkspaceAdminSection';
import { BillingSection } from './BillingSection';

/**
 * Workspace management surface on the Account Settings page. Lists the user's
 * workspaces (switch only — creation lives in the sidebar switcher) and, for the
 * active workspace, manages members and (for SUPERADMINs) rename/delete.
 */
export function WorkspacesSettings(): JSX.Element {
  const active = useAuthStore((s) => s.activeOrganization);

  return (
    <>
      <SettingsCard
        title="Your workspaces"
        description="Workspaces you belong to. Switch from here or create a new one from the sidebar switcher."
      >
        <WorkspaceList />
      </SettingsCard>

      {active && (
        <SettingsCard title="Members" description={active.name}>
          <MembersManager activeOrg={active} />
        </SettingsCard>
      )}

      {active && active.role === 'SUPERADMIN' && (
        <SettingsCard title="Plan & billing" description="Your workspace plan, usage and payment.">
          <BillingSection key={active.id} />
        </SettingsCard>
      )}

      {active && active.role === 'SUPERADMIN' && (
        <SettingsCard title="Workspace settings" description="Rename or delete this workspace.">
          <WorkspaceAdminSection key={active.id} activeOrg={active} />
        </SettingsCard>
      )}
    </>
  );
}
