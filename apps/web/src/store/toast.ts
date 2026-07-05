import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** How many times this identical message fired — shown as ×N, never stacked. */
  count: number;
  /** Timestamp of the latest show; bumped on every repeat so the bar restarts. */
  bornAt: number;
  /** Lifetime in ms — drives the countdown bar and the auto-dismiss. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, text: string) => void;
  remove: (id: number) => void;
}

/** Every toast lives this long, then fades — a repeat just resets the clock. */
export const TOAST_MS = 5000;
/** Cap simultaneous (distinct) toasts so a burst of different errors can't flood. */
const MAX_TOASTS = 3;

let seq = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToasts = create<ToastState>((set, get) => {
  // (Re)arm the auto-dismiss timer for a toast — called on first show and on
  // every repeat, so an identical message that keeps firing stays a SINGLE toast
  // whose 5s countdown simply restarts instead of spawning a river of copies.
  const arm = (id: number) => {
    const prev = timers.get(id);
    if (prev) clearTimeout(prev);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
      }, TOAST_MS),
    );
  };

  return {
    toasts: [],
    push: (kind, text) => {
      const existing = get().toasts.find((x) => x.kind === kind && x.text === text);
      if (existing) {
        arm(existing.id);
        set((s) => ({
          toasts: s.toasts.map((x) =>
            x.id === existing.id ? { ...x, count: x.count + 1, bornAt: Date.now() } : x,
          ),
        }));
        return;
      }
      const id = seq++;
      arm(id);
      set((s) => ({
        toasts: [
          ...s.toasts,
          { id, kind, text, count: 1, bornAt: Date.now(), duration: TOAST_MS },
        ].slice(-MAX_TOASTS),
      }));
    },
    remove: (id) => {
      const timer = timers.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.delete(id);
      }
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    },
  };
});

/** Fire-and-forget helpers usable anywhere (even outside React). */
export const toast = {
  success: (text: string) => useToasts.getState().push('success', text),
  error: (text: string) => useToasts.getState().push('error', text),
  info: (text: string) => useToasts.getState().push('info', text),
};
