import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
}

export interface ToastInput {
  tone: ToastTone;
  message: string;
  // Set to 0 to keep the toast until manually dismissed.
  durationMs?: number;
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

const DEFAULT_DURATION_MS = 4000;

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

  show: ({ tone, message, durationMs = DEFAULT_DURATION_MS }) => {
    const id = nextId();
    set({ toasts: [...get().toasts, { id, tone, message }] });

    if (durationMs > 0) {
      const handle = setTimeout(() => {
        timers.delete(id);
        set({ toasts: get().toasts.filter((t) => t.id !== id) });
      }, durationMs);
      timers.set(id, handle);
    }

    return id;
  },

  dismiss: (id) => {
    clearTimer(id);
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
