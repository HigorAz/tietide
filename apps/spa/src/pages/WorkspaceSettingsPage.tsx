import * as Tabs from '@radix-ui/react-tabs';
import { useAuthStore } from '@/stores/authStore';
import { MembersManager } from '@/components/organizations/MembersManager';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { WorkspaceList } from '@/components/settings/WorkspaceList';
import { WorkspaceAdminSection } from '@/components/settings/WorkspaceAdminSection';
import { BillingSection } from '@/components/settings/BillingSection';
import { cn } from '@/utils/cn';

const tabTrigger = cn(
  'rounded px-3 py-1.5 text-sm font-medium text-text-secondary transition',
  'hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal',
  'data-[state=active]:bg-accent-teal/15 data-[state=active]:text-accent-teal',
);

/**
 * Workspace management surface, split out of the Account Settings page so account
 * and workspace concerns live on separate pages. Tabs reuse the existing settings
 * sub-components (WorkspaceList, MembersManager, BillingSection, WorkspaceAdmin).
 * Members/Billing tabs are gated the same way the former cards were.
 */
export function WorkspaceSettingsPage(): JSX.Element {
  const active = useAuthStore((s) => s.activeOrganization);
  const isSuperadmin = active?.role === 'SUPERADMIN';

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Workspace settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your workspaces, members, plan and usage.
        </p>
      </header>

      <Tabs.Root defaultValue="general">
        <Tabs.List
          aria-label="Workspace settings sections"
          className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-elevated p-1"
        >
          <Tabs.Trigger value="general" className={tabTrigger}>
            General
          </Tabs.Trigger>
          {active && (
            <Tabs.Trigger value="members" className={tabTrigger}>
              Members
            </Tabs.Trigger>
          )}
          {active && isSuperadmin && (
            <Tabs.Trigger value="billing" className={tabTrigger}>
              Plan &amp; billing
            </Tabs.Trigger>
          )}
        </Tabs.List>

        <Tabs.Content value="general" className="mt-6 flex flex-col gap-6 focus:outline-none">
          <SettingsCard
            title="Your workspaces"
            description="Workspaces you belong to. Switch from here or create a new one from the sidebar switcher."
          >
            <WorkspaceList />
          </SettingsCard>

          {active && isSuperadmin && (
            <SettingsCard title="Workspace settings" description="Rename or delete this workspace.">
              <WorkspaceAdminSection key={active.id} activeOrg={active} />
            </SettingsCard>
          )}
        </Tabs.Content>

        {active && (
          <Tabs.Content value="members" className="mt-6 flex flex-col gap-6 focus:outline-none">
            <SettingsCard title="Members" description={active.name}>
              <MembersManager activeOrg={active} />
            </SettingsCard>
          </Tabs.Content>
        )}

        {active && isSuperadmin && (
          <Tabs.Content value="billing" className="mt-6 flex flex-col gap-6 focus:outline-none">
            <SettingsCard
              title="Plan & billing"
              description="Your workspace plan, usage and payment."
            >
              <BillingSection key={active.id} />
            </SettingsCard>
          </Tabs.Content>
        )}
      </Tabs.Root>
    </div>
  );
}

export default WorkspaceSettingsPage;
