import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  href: string;
}

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

export interface ToastInput {
  tone: ToastTone;
  message: string;
  // Set to 0 to keep the toast until manually dismissed. Omit to use the
  // tone-keyed default (5s for success/info, 8s for error/warning).
  durationMs?: number;
  action?: ToastAction;
}

export interface ToastState {
  toasts: Toast[];
}

export interface ToastActions {
  show: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

export type ToastStore = ToastState & ToastActions;

export const initialToastState: ToastState = {
  toasts: [],
};

const DEFAULT_DURATION_BY_TONE: Record<ToastTone, number> = {
  success: 5000,
  info: 5000,
  error: 8000,
  warning: 8000,
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();

const clearTimer = (id: string): void => {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
};

let counter = 0;
const nextId = (): string => {
  counter += 1;
  return `toast-${Date.now().toString(36)}-${counter}`;
};

export const useToastStore = create<ToastStore>((set, get) => ({
  ...initialToastState,

  show: ({ tone, message, durationMs, action }) => {
    const id = nextId();
    const resolvedDuration = durationMs ?? DEFAULT_DURATION_BY_TONE[tone];
    set({ toasts: [...get().toasts, { id, tone, message, action }] });

    if (resolvedDuration > 0) {
      const handle = setTimeout(() => {
        timers.delete(id);
        set({ toasts: get().toasts.filter((t) => t.id !== id) });
      }, resolvedDuration);
      timers.set(id, handle);
    }

    return id;
  },

  dismiss: (id) => {
    clearTimer(id);
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
