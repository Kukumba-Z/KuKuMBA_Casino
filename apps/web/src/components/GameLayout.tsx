import type { ReactNode } from 'react';
import { ChatBox } from './ChatBox';

/**
 * Shared responsive shell for every game page (roulette today, slots/live next).
 *
 * The critical job here is preventing horizontal overflow on mobile. Game boards
 * are routinely wider than a phone and are meant to scroll *horizontally inside
 * their own container*. For that to work, the surrounding grid column must be
 * allowed to shrink below its content's intrinsic width:
 *
 *   - `grid-cols-1` on mobile resolves to `minmax(0, 1fr)` (a shrinkable track),
 *     unlike a bare `grid` whose implicit `auto` column grows to fit content.
 *   - `lg:grid-cols-[minmax(0,1fr)_340px]` keeps the same shrinkable main column
 *     next to the fixed-width chat rail on desktop.
 *   - `min-w-0` on each column overrides the default `min-width: auto` of grid
 *     items so an inner `overflow-x-auto` board can actually scroll.
 *
 * Without these, a board's min-width pushes the whole page — including the
 * sticky header — sideways. Keep new games inside this wrapper so they never
 * have to re-solve it.
 */
export function GameLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">{children}</div>
      <div className="min-w-0 space-y-6">{aside ?? <ChatBox />}</div>
    </div>
  );
}
