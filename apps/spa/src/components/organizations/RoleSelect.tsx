import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type { OrgRole } from '@tietide/shared';
import { cn } from '@/utils/cn';
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from './roleLabels';

export interface RoleSelectProps {
  value: OrgRole;
  onChange: (role: OrgRole) => void;
  /** Roles the current manager may grant — already filtered by rank by the caller. */
  assignableRoles: OrgRole[];
  /** Id of the visible <label> so the trigger is announced with "Role". */
  labelledBy?: string;
  disabled?: boolean;
}

/**
 * Themed role picker built on Radix Select (mirrors ConnectionPicker) so the
 * option list matches the dark navy theme instead of the browser's native white
 * popup, and shows friendly role labels + descriptions instead of ALL-CAPS.
 */
export function RoleSelect({
  value,
  onChange,
  assignableRoles,
  labelledBy,
  disabled = false,
}: RoleSelectProps): JSX.Element {
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => onChange(next as OrgRole)}
      disabled={disabled}
    >
      <Select.Trigger
        aria-label={labelledBy ? undefined : 'Role'}
        aria-labelledby={labelledBy}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition',
          'hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-accent-teal',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <Select.Value>{ROLE_LABELS[value]}</Select.Value>
        <Select.Icon>
          <ChevronDown aria-hidden className="h-4 w-4 text-text-secondary" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[--radix-select-trigger-width] overflow-hidden rounded-md border border-white/10 bg-surface shadow-lg"
        >
          <Select.Viewport className="p-1">
            {assignableRoles.map((role) => (
              <Select.Item
                key={role}
                value={role}
                className={cn(
                  'relative flex cursor-pointer select-none items-start gap-2 rounded-md px-2 py-2 text-sm text-text-primary outline-none',
                  'data-[highlighted]:bg-white/5 data-[state=checked]:bg-white/10',
                )}
              >
                <span className="mt-0.5 w-4 flex-shrink-0">
                  <Select.ItemIndicator>
                    <Check aria-hidden className="h-4 w-4 text-accent-teal" />
                  </Select.ItemIndicator>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Select.ItemText asChild>
                    <span className="font-medium">{ROLE_LABELS[role]}</span>
                  </Select.ItemText>
                  <span className="text-xs text-text-secondary">{ROLE_DESCRIPTIONS[role]}</span>
                </span>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
