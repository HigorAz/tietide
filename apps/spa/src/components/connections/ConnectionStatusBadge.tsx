import { ConnectionStatus } from '@tietide/shared';
import { cn } from '@/utils/cn';

const STATUS_TONE: Record<ConnectionStatus, { label: string; classes: string }> = {
  [ConnectionStatus.ACTIVE]: {
    label: 'Active',
    classes: 'bg-status-success/15 text-status-success',
  },
  [ConnectionStatus.EXPIRED]: {
    label: 'Expired',
    classes: 'bg-warning/15 text-warning',
  },
  [ConnectionStatus.ERROR]: {
    label: 'Error',
    classes: 'bg-error/15 text-error',
  },
  [ConnectionStatus.REVOKED]: {
    label: 'Revoked',
    classes: 'bg-text-muted/15 text-text-muted',
  },
};

export interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  className?: string;
}

export function ConnectionStatusBadge({
  status,
  className,
}: ConnectionStatusBadgeProps): JSX.Element {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone.classes,
        className,
      )}
      data-status={status}
    >
      {tone.label}
    </span>
  );
}
