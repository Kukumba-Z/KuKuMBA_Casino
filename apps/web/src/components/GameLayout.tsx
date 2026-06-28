import type { ReactNode } from 'react';

/**
 * Shared responsive shell for every game page (roulette today, slots/live next).
 *
 * The critical job here is preventing horizontal overflow on mobile. Game boards
 * are routinely wider than a phone and are meant to scroll *horizontally inside
 * their own container*. For that to work, the surrounding column must be allowed
 * to shrink below its content's intrinsic width — hence `grid-cols-1`
 * (= minmax(0,1fr)) on mobile, a shrinkable main column on desktop, and `min-w-0`
 * on each column. Without these, a board's min-width pushes the whole page —
 * including the sticky header — sideways.
 *
 * Chat used to live here as a sidebar; it now has its own tab, so by default a
 * game renders single-column. Pass `aside` to opt back into a two-column layout.
 */
export function GameLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  if (!aside) {
    return <div className="min-w-0 space-y-6">{children}</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">{children}</div>
      <div className="min-w-0 space-y-6">{aside}</div>
    </div>
  );
}
