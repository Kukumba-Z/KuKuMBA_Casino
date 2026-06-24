import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/**
 * VIP progression. Players earn 1 XP per 1 USD-equivalent wagered. Each level
 * unlocks a higher rakeback/cashback percentage and perks. Levels are fully
 * data-driven (VipLevel table) so admins can retune the ladder live.
 */
@Injectable()
export class VipService {
  constructor(private prisma: PrismaService) {}

  levels() {
    return this.prisma.vipLevel.findMany({ orderBy: { level: 'asc' } });
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const levels = await this.levels();
    const current = [...levels].reverse().find((l) => l.xpRequired <= (user?.vipXp ?? 0)) || levels[0];
    const next = levels.find((l) => l.level === (current?.level ?? 0) + 1);
    const span = next ? next.xpRequired - current.xpRequired : 1;
    const progress = next ? Math.max(0, Math.min(1, ((user?.vipXp ?? 0) - current.xpRequired) / span)) : 1;
    return {
      xp: user?.vipXp ?? 0,
      level: current?.level ?? 0,
      current,
      next,
      progress,
    };
  }

  /**
   * Credit wager XP inside the bet transaction and bump the stored level.
   * Returns whether the player leveled up (caller notifies after commit).
   */
  async addWager(tx: Tx, userId: string, usdAmount: number) {
    const user = await tx.user.update({
      where: { id: userId },
      data: { vipXp: { increment: usdAmount } },
    });
    const levels = await tx.vipLevel.findMany({ orderBy: { level: 'asc' } });
    const newLevel = [...levels].reverse().find((l) => l.xpRequired <= user.vipXp)?.level ?? 0;
    if (newLevel > user.vipLevel) {
      const updated = await tx.user.update({ where: { id: userId }, data: { vipLevel: newLevel } });
      const def = levels.find((l) => l.level === newLevel);
      return { leveledUp: true, level: newLevel, name: def?.name ?? `VIP ${newLevel}` };
    }
    return { leveledUp: false, level: user.vipLevel, name: undefined };
  }

  async rakebackPercent(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const def = await this.prisma.vipLevel.findUnique({ where: { level: user?.vipLevel ?? 0 } });
    return def?.rakebackPercent ?? 0;
  }
}
