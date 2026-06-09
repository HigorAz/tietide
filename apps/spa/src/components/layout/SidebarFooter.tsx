import { useNavigate } from 'react-router-dom';
import { Building2, HelpCircle, LogOut, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { cn } from '@/utils/cn';

export interface SidebarFooterProps {
  collapsed: boolean;
}

export function SidebarFooter({ collapsed }: SidebarFooterProps): JSX.Element {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const openHelpDrawer = useOnboardingStore((s) => s.openHelpDrawer);

  const handleHelp = (): void => {
    openHelpDrawer();
  };

  const handleSettings = (): void => {
    navigate('/settings');
  };

  const handleWorkspaceSettings = (): void => {
    navigate('/workspace-settings');
  };

  const handleSignOut = (): void => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="border-t border-white/5 py-2">
      <FooterButton
        onClick={handleHelp}
        icon={HelpCircle}
        label="Help"
        symbol="?"
        collapsed={collapsed}
      />
      <FooterButton
        onClick={handleWorkspaceSettings}
        icon={Building2}
        label="Workspace settings"
        collapsed={collapsed}
      />
      <FooterButton
        onClick={handleSettings}
        icon={Settings}
        label="Account settings"
        collapsed={collapsed}
      />
      <FooterButton onClick={handleSignOut} icon={LogOut} label="Sign out" collapsed={collapsed} />
    </div>
  );
}

interface FooterButtonProps {
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  symbol?: string;
  collapsed: boolean;
}

function FooterButton({
  onClick,
  icon: Icon,
  label,
  symbol,
  collapsed,
}: FooterButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2 text-sm font-medium text-text-secondary transition',
        'hover:bg-elevated hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal',
        collapsed && 'justify-center gap-0 px-0',
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <span className="truncate">
          {symbol && <span className="mr-1 text-text-muted">{symbol}</span>}
          {label}
        </span>
      )}
    </button>
  );
}

export default SidebarFooter;
