import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

/**
 * Reusable overlay dialog: a bottom sheet on mobile, a centered card on desktop.
 * Closes on backdrop click or Escape. Shared by games (e.g. roulette's
 * info/fairness panel) so we don't reinvent a dialog per feature.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-surface-2 p-5 shadow-card sm:max-w-md sm:rounded-3xl"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-lg font-bold">{title}</div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 transition hover:bg-white/10"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
