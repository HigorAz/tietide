import { X } from 'lucide-react';
import { useToastStore, type Toast, type ToastTone } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-success/40 bg-success/15 text-success',
  error: 'border-error/40 bg-error/15 text-error',
  info: 'border-info/40 bg-info/15 text-info',
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
        'pointer-events-auto flex w-80 max-w-full items-start gap-3 rounded-md border px-3 py-2 shadow-lg',
        'text-sm',
        TONE_STYLES[toast.tone],
      )}
    >
      <p className="flex-1 leading-snug">{toast.message}</p>
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
      className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}
