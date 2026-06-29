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
}

main()
  .then(() => console.log('reconcile: done'))
  .catch((e) => {
    console.error('reconcile failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
