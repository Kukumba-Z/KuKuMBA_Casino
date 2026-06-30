import { BetRow } from './WinRow';

/** The player's own game-history row — same layout as the ticker/leaderboard,
 *  minus the nick (it's all their own play), with "—" shown for losing rounds. */
export function HistoryRow({ f }: { f: any }) {
  return <BetRow f={f} showNick={false} dashOnLoss />;
}
