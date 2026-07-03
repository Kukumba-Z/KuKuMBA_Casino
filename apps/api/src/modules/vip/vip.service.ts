import { Injectable } from '@nestjs/common';
import { Prisma, VipLevel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, ZERO } from '../../common/utils/money';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;

/** Level-up outcome of a progression hook (caller notifies after commit). */
export interface VipLevelUp {
  leveledUp: boolean;
  level: number;
  name?: string;
}

/**
 * VIP progression is dual-track and REAL-money only: players climb by lifetime
 * deposits AND lifetime wagers (both USD-equivalent, via Currency.usdRate). A
 * level unlocks only when BOTH of its thresholds are met, so the ladder can't
 * be farmed by depositing without playing or by grinding a tiny bankroll. The
 * ladder is fully data-driven (VipLevel table) so admins can retune it live.
 */
@Injectable()
export class VipService {
  constructor(private prisma: PrismaService) {}

  levels() {
    return this.prisma.vipLevel.findMany({ orderBy: { level: 'asc' } });
  }

  /** The highest level whose deposit AND wager thresholds are both met. */
  private levelFor(levels: VipLevel[], depositUsd: Dec, wagerUsd: Dec): number {
    let level = 0;
    for (const l of levels) {
      if (depositUsd.gte(D(l.depositRequiredUsd)) && wagerUsd.gte(D(l.wagerRequiredUsd))) {
        level = Math.max(level, l.level);
      }
    }
    return level;
  }

  async status(userId: string) {
    const [user, levels] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.levels(),
    ]);
    const deposited = D(user?.vipDepositUsd ?? 0);
    const wagered = D(user?.vipWagerUsd ?? 0);
    const level = user?.vipLevel ?? 0;
    const current = levels.find((l) => l.level === level) ?? levels[0] ?? null;
    const next = levels.find((l) => l.level === level + 1) ?? null;

    // Progress of one track toward the next level's cumulative threshold (0..1).
    const track = (have: Dec, need: Dec) =>
      need.lte(0) ? 1 : Math.max(0, Math.min(1, have.div(need).toNumber()));
    const deposit = next ? track(deposited, D(next.depositRequiredUsd)) : 1;
    const wager = next ? track(wagered, D(next.wagerRequiredUsd)) : 1;

    const remain = (have: Dec, need: Dec) => {
      const left = need.minus(have);
      return (left.gt(0) ? left : ZERO).toFixed(2);
    };

    return {
      level,
      current,
      next,
      depositedUsd: deposited.toFixed(2),
      wageredUsd: wagered.toFixed(2),
      toNext: next
        ? {
            depositUsd: remain(deposited, D(next.depositRequiredUsd)),
            wagerUsd: remain(wagered, D(next.wagerRequiredUsd)),
          }
        : null,
      // Both bars must fill: the overall progress is the slower track.
      progress: { deposit, wager, overall: Math.min(deposit, wager) },
    };
  }

  /**
   * Re-derive the stored level from the lifetime counters. Play only ever
   * raises the level — an admin-gifted level is never demoted by the math.
   */
  private async recompute(
    tx: Tx,
    user: { id: string; vipLevel: number; vipDepositUsd: Dec; vipWagerUsd: Dec },
  ): Promise<VipLevelUp> {
    const levels = await tx.vipLevel.findMany({ orderBy: { level: 'asc' } });
    const newLevel = this.levelFor(levels, D(user.vipDepositUsd), D(user.vipWagerUsd));
    if (newLevel > user.vipLevel) {
      await tx.user.update({ where: { id: user.id }, data: { vipLevel: newLevel } });
      const def = levels.find((l) => l.level === newLevel);
      return { leveledUp: true, level: newLevel, name: def?.name ?? `VIP ${newLevel}` };
    }
    return { leveledUp: false, level: user.vipLevel };
  }

  /**
   * Credit REAL wager volume (USD-equivalent) inside the bet transaction and
   * bump the level when both thresholds are crossed. Demo play never counts —
   * the caller gates on mode.
   */
  async addWager(tx: Tx, userId: string, usdAmount: number): Promise<VipLevelUp> {
    if (!(usdAmount > 0)) {
      const u = await tx.user.findUnique({ where: { id: userId }, select: { vipLevel: true } });
      return { leveledUp: false, level: u?.vipLevel ?? 0 };
    }
    const user = await tx.user.update({
      where: { id: userId },
      data: { vipWagerUsd: { increment: usdAmount } },
    });
    return this.recompute(tx, user);
  }

  /**
   * Credit a completed REAL deposit (USD-equivalent) inside the deposit
   * transaction — the second VIP track.
   */
  async addDeposit(tx: Tx, userId: string, usdAmount: number): Promise<VipLevelUp> {
    if (!(usdAmount > 0)) {
      const u = await tx.user.findUnique({ where: { id: userId }, select: { vipLevel: true } });
      return { leveledUp: false, level: u?.vipLevel ?? 0 };
    }
    const user = await tx.user.update({
      where: { id: userId },
      data: { vipDepositUsd: { increment: usdAmount } },
    });
    return this.recompute(tx, user);
  }
}
