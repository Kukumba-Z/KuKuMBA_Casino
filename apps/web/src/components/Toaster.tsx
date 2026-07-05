import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ToastKind, useToasts } from '../store/toast';

const ICON = { success: CheckCircle2, error: XCircle, info: Info };
const TONE: Record<ToastKind, string> = {
  success: 'text-mint',
  error: 'text-roul-red',
  info: 'text-sky',
};
// Countdown-bar colour per kind (matches the icon tone).
const BAR: Record<ToastKind, string> = {
  success: 'bg-mint',
  error: 'bg-roul-red',
  info: 'bg-sky',
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const remove = useToasts((s) => s.remove);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            className="pointer-events-auto relative flex w-full max-w-sm animate-fadeup items-start gap-2.5 overflow-hidden rounded-2xl border border-white/10 bg-surface-2/95 px-4 py-3 shadow-card backdrop-blur-xl"
          >
            <Icon size={18} className={`mt-0.5 shrink-0 ${TONE[t.kind]}`} />
            <span className="flex-1 text-sm leading-snug text-white/90">{t.text}</span>
            {t.count > 1 && (
              <span
                className={`mt-0.5 shrink-0 rounded-full bg-white/10 px-1.5 text-[11px] font-bold tabular-nums ${TONE[t.kind]}`}
                aria-label={`×${t.count}`}
              >
                ×{t.count}
              </span>
            )}
            <button onClick={() => remove(t.id)} className="shrink-0 text-white/35 transition hover:text-white">
              <X size={16} />
            </button>
            {/* countdown bar — depletes over the toast's lifetime; re-keyed on
                `bornAt` so a repeated (deduped) message restarts the animation. */}
            <span
              key={t.bornAt}
              className={`toast-timer absolute bottom-0 left-0 h-[3px] w-full origin-left ${BAR[t.kind]}`}
              style={{ animationDuration: `${t.duration}ms` }}
            />
          </div>
        );
      })}
    </div>
  );
}
