/**
 * Idempotent data reconciliation — safe to run on every boot.
 *
 * Unlike the full seed (which re-asserts every built-in row and would revert
 * admin edits), this only corrects known-stale defaults on existing data. Each
 * fix is scoped to the exact old value, so an operator's intentional changes are
 * never clobbered.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Roulette min bet: the original seed shipped 0.1; we lowered it to 0.01.
  // Only touch rows still on the old default so admin-set limits are preserved.
  const minBet = await prisma.game.updateMany({
    where: { key: 'roulette', minBet: 0.1 },
    data: { minBet: 0.01 },
  });
  if (minBet.count) console.log(`reconcile: roulette minBet 0.1 → 0.01 (${minBet.count} row)`);

  // Bonuses are now REAL money only. The original seed shipped welcome/nodep as
  // DEMO grants; convert those exact rows to their new USDT values. Rows an admin
  // already moved off DEMO are left untouched.
  const welcome = await prisma.bonus.updateMany({
    where: { key: 'welcome', currency: 'DEMO' },
    data: {
      currency: 'USDT',
      amount: 5,
      wagerMultiplier: 10,
      descriptionRu: 'Приветственный бонус 5 USDT для новых игроков.',
      descriptionEn: '5 USDT welcome bonus for new players.',
    },
  });
  if (welcome.count) console.log(`reconcile: welcome bonus DEMO → USDT (${welcome.count} row)`);

  const nodep = await prisma.bonus.updateMany({
    where: { key: 'nodep', currency: 'DEMO' },
    data: {
      currency: 'USDT',
      amount: 2,
      wagerMultiplier: 15,
      descriptionRu: 'Бездепозитный бонус 2 USDT — без пополнения.',
      descriptionEn: '2 USDT, no deposit needed.',
    },
  });
  if (nodep.count) console.log(`reconcile: nodep bonus DEMO → USDT (${nodep.count} row)`);

  // Legacy bonuses from before the wagering engine can hang in ACTIVE with no
  // wager to clear — mark those COMPLETED so they stop locking withdrawals and
  // showing "active" forever. Only rows with wagerRequired <= 0 are touched.
  const staleActive = await prisma.userBonus.updateMany({
    where: { status: { in: ['ACTIVE', 'WAGERING'] }, wagerRequired: { lte: 0 } },
    data: { status: 'COMPLETED' },
  });
  if (staleActive.count) console.log(`reconcile: zero-wager bonuses ACTIVE → COMPLETED (${staleActive.count} rows)`);

  // One-time backfill of the persistent stat counters + per-user lifetime stats,
  // so switching the lobby/profile away from count(*) doesn't reset the numbers.
  // Guarded by a flag counter so it runs exactly once, ever.
  const already = await prisma.counter.findUnique({ where: { key: 'init:userstats' } });
  if (!already) {
    const [rounds, bets] = await Promise.all([prisma.gameRound.count(), prisma.bet.count()]);
    await prisma.counter.upsert({ where: { key: 'rounds' }, create: { key: 'rounds', value: rounds }, update: { value: rounds } });
    await prisma.counter.upsert({ where: { key: 'bets' }, create: { key: 'bets', value: bets }, update: { value: bets } });
    await prisma.$executeRawUnsafe(
      `UPDATE "User" u SET "lifetimeBets" = b.cnt, "lifetimeWagered" = b.sum
       FROM (SELECT "userId", COUNT(*)::int AS cnt, COALESCE(SUM("stake"), 0) AS sum FROM "Bet" GROUP BY "userId") b
       WHERE u."id" = b."userId"`,
    );
    await prisma.counter.create({ data: { key: 'init:userstats', value: 1 } });
    console.log(`reconcile: backfilled stats (rounds=${rounds}, bets=${bets})`);
  }

  // One-time backfill of the dual-track VIP counters (the XP era stored only
  // vipXp, which the schema dropped). Both lifetime counters are rebuilt from
  // the authoritative ledgers in USD-equivalent: deposits from completed REAL
  // deposits, wagers from REAL BET transactions. Stored levels are then
  // re-derived raise-only, so nobody is demoted by the migration.
  const vipDone = await prisma.counter.findUnique({ where: { key: 'init:vip-dual-track' } });
  if (!vipDone) {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" u SET "vipDepositUsd" = d.sum
       FROM (SELECT dep."userId", COALESCE(SUM(dep."amount" * c."usdRate"), 0) AS sum
             FROM "Deposit" dep JOIN "Currency" c ON c."code" = dep."currency"
             WHERE dep."status" = 'COMPLETED' AND dep."mode" = 'REAL'
             GROUP BY dep."userId") d
       WHERE u."id" = d."userId"`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "User" u SET "vipWagerUsd" = w.sum
       FROM (SELECT t."userId", COALESCE(SUM(t."amount" * c."usdRate"), 0) AS sum
             FROM "Transaction" t JOIN "Currency" c ON c."code" = t."currency"
             WHERE t."type" = 'BET' AND t."mode" = 'REAL'
             GROUP BY t."userId") w
       WHERE u."id" = w."userId"`,
    );
    const levels = await prisma.vipLevel.findMany({ orderBy: { level: 'asc' } });
    const players = await prisma.user.findMany({
      select: { id: true, vipLevel: true, vipDepositUsd: true, vipWagerUsd: true },
    });
    let raised = 0;
    for (const u of players) {
      let level = 0;
      for (const l of levels) {
        if (u.vipDepositUsd.gte(l.depositRequiredUsd) && u.vipWagerUsd.gte(l.wagerRequiredUsd)) {
          level = Math.max(level, l.level);
        }
      }
      if (level > u.vipLevel) {
        await prisma.user.update({ where: { id: u.id }, data: { vipLevel: level } });
        raised++;
      }
    }
    await prisma.counter.create({ data: { key: 'init:vip-dual-track', value: 1 } });
    console.log(`reconcile: backfilled VIP dual-track counters (${players.length} users, ${raised} raised)`);
  }
}

main()
  .then(() => console.log('reconcile: done'))
  .catch((e) => {
    console.error('reconcile failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
