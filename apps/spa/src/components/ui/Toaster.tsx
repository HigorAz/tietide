import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToastStore, type Toast, type ToastTone } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

// Opaque dark surface (never see-through over the toolbar) + a full-strength
// tone-colored left accent and ring so the message stays legible regardless of
// what sits beneath it. Tone class names are kept so styling stays tone-driven.
const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-l-success ring-success/30 text-success',
  error: 'border-l-error ring-error/30 text-error',
  info: 'border-l-info ring-info/30 text-info',
  warning: 'border-l-warning ring-warning/30 text-warning',
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={`toast-${toast.id}`}
      className={cn(
        'pointer-events-auto flex w-80 max-w-full items-start gap-3 rounded-md px-3 py-2.5',
        // Opaque surface + thick tone-colored left accent + soft tone ring.
        'border border-l-4 border-white/10 bg-surface shadow-lg shadow-black/40 ring-1',
        'text-sm',
        TONE_STYLES[toast.tone],
      )}
    >
      <p className="flex-1 font-medium leading-snug">{toast.message}</p>
      {toast.action ? (
        <Link
          to={toast.action.href}
          onClick={() => onDismiss(toast.id)}
          className={cn(
            'shrink-0 rounded text-xs font-medium text-current underline underline-offset-2 opacity-90 transition',
            'hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-current',
          )}
        >
          {toast.action.label}
        </Link>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className={cn(
          '-mr-1 rounded p-1 text-current opacity-70 transition',
          'hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-current',
        )}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

export function Toaster(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      role="region"
      aria-label="Notifications"
      // top-20 (not top-4) so toasts sit BELOW the editor toolbar/tabs row
      // instead of overlapping the AI Docs/Run/Test/Save buttons.
      className="pointer-events-none fixed right-4 top-20 z-[100] flex flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}
