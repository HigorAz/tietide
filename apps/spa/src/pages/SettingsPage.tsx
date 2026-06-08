import { useAuthStore } from '@/stores/authStore';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { SecuritySection } from '@/components/settings/SecuritySection';
import { WorkspaceShortcutsSection } from '@/components/settings/WorkspaceShortcutsSection';
import { DangerZoneSection } from '@/components/settings/DangerZoneSection';

export function SettingsPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);

  // ProtectedRoute guarantees a session, but guard the render so a transient null
  // (e.g. mid-logout) doesn't throw.
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-text-secondary">Loading your account…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Account settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your profile, security and account.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <ProfileSection user={user} />
        <SecuritySection user={user} />
        <WorkspaceShortcutsSection />
        <DangerZoneSection />
      </div>
    </div>
  );
}

export default SettingsPage;
