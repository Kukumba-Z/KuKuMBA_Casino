import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { genReferralCode } from '../src/common/utils/ids';
import { genServerSeed, hashServerSeed } from '../src/modules/provably-fair/provably-fair.crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding KuKuMBA…');

  // ── Currencies (demo + fiat + crypto, USDT multi-network) ────────────────
  const currencies = [
    { code: 'DEMO', name: 'Demo Coins', type: 'DEMO', symbol: '🦄', decimals: 2, networks: [], usdRate: 0.1, sortOrder: 0 },
    { code: 'USD', name: 'US Dollar', type: 'FIAT', symbol: '$', decimals: 2, networks: [], usdRate: 1, sortOrder: 1 },
    { code: 'EUR', name: 'Euro', type: 'FIAT', symbol: '€', decimals: 2, networks: [], usdRate: 1.08, sortOrder: 2 },
    { code: 'RUB', name: 'Russian Ruble', type: 'FIAT', symbol: '₽', decimals: 2, networks: [], usdRate: 0.011, sortOrder: 3 },
    { code: 'BTC', name: 'Bitcoin', type: 'CRYPTO', symbol: '₿', decimals: 8, networks: ['BTC'], usdRate: 65000, sortOrder: 4 },
    { code: 'ETH', name: 'Ethereum', type: 'CRYPTO', symbol: 'Ξ', decimals: 8, networks: ['ERC20'], usdRate: 3200, sortOrder: 5 },
    { code: 'USDT', name: 'Tether', type: 'CRYPTO', symbol: '₮', decimals: 6, networks: ['ERC20', 'TRC20', 'TON', 'SOL', 'BSC'], usdRate: 1, sortOrder: 6 },
    { code: 'TON', name: 'Toncoin', type: 'CRYPTO', symbol: 'TON', decimals: 6, networks: ['TON'], usdRate: 6, sortOrder: 7 },
    { code: 'TRX', name: 'TRON', type: 'CRYPTO', symbol: 'TRX', decimals: 6, networks: ['TRC20'], usdRate: 0.12, sortOrder: 8 },
    { code: 'SOL', name: 'Solana', type: 'CRYPTO', symbol: 'SOL', decimals: 6, networks: ['SOL'], usdRate: 150, sortOrder: 9 },
    { code: 'BNB', name: 'BNB', type: 'CRYPTO', symbol: 'BNB', decimals: 8, networks: ['BSC'], usdRate: 600, sortOrder: 10 },
    { code: 'XMR', name: 'Monero', type: 'CRYPTO', symbol: 'ɱ', decimals: 8, networks: ['XMR'], usdRate: 160, sortOrder: 11 },
  ];
  for (const c of currencies) {
    await prisma.currency.upsert({
      where: { code: c.code },
      create: { ...(c as any), minDeposit: 0, minWithdrawal: 0, enabled: true, isDefault: c.code === 'DEMO' },
      update: { ...(c as any) },
    });
  }

  // ── The game ──────────────────────────────────────────────────────────────
  await prisma.game.upsert({
    where: { key: 'roulette' },
    create: {
      key: 'roulette',
      name: 'KuKuMBA Roulette',
      type: 'roulette',
      rtp: 0.99,
      minBet: 0.1,
      maxBet: 100000,
      descriptionRu:
        'Европейская рулетка KuKuMBA: 37 ячеек, честный результат (provably-fair) и RTP 99% — преимущество казино всего 1%.',
      descriptionEn:
        'KuKuMBA European roulette: 37 pockets, provably-fair outcomes and a 99% RTP — a tiny 1% house edge.',
    },
    update: { rtp: 0.99 },
  });

  // ── VIP ladder ──────────────────────────────────────────────────────────────
  const vip = [
    { level: 0, name: 'Foal', xpRequired: 0, cashbackPercent: 0, rakebackPercent: 0, weeklyBonus: 0, color: '#9AA4C7', perksRu: 'Старт пути', perksEn: 'Start of the journey' },
    { level: 1, name: 'Pony', xpRequired: 100, cashbackPercent: 1, rakebackPercent: 0.5, weeklyBonus: 1, color: '#7CC4FF', perksRu: 'Кешбэк 1%', perksEn: '1% cashback' },
    { level: 2, name: 'Unicorn', xpRequired: 1000, cashbackPercent: 2, rakebackPercent: 1, weeklyBonus: 5, color: '#B79CED', perksRu: 'Кешбэк 2% + рейкбэк', perksEn: '2% cashback + rakeback' },
    { level: 3, name: 'Pegasus', xpRequired: 5000, cashbackPercent: 3, rakebackPercent: 1.5, weeklyBonus: 15, color: '#7EE7C7', perksRu: 'Персональный менеджер', perksEn: 'Personal manager' },
    { level: 4, name: 'Alicorn', xpRequired: 20000, cashbackPercent: 5, rakebackPercent: 2, weeklyBonus: 50, color: '#FF8FD0', perksRu: 'Кешбэк 5%', perksEn: '5% cashback' },
    { level: 5, name: 'Crystal', xpRequired: 75000, cashbackPercent: 7, rakebackPercent: 2.5, weeklyBonus: 150, color: '#FFD86E', perksRu: 'VIP-турниры', perksEn: 'VIP tournaments' },
    { level: 6, name: 'Celestial', xpRequired: 200000, cashbackPercent: 9, rakebackPercent: 3, weeklyBonus: 500, color: '#FFB36E', perksRu: 'Эксклюзивные розыгрыши', perksEn: 'Exclusive raffles' },
    { level: 7, name: 'Cosmic', xpRequired: 500000, cashbackPercent: 12, rakebackPercent: 4, weeklyBonus: 1500, color: '#FF6EC7', perksRu: 'Максимальные привилегии', perksEn: 'Maximum privileges' },
  ];
  for (const v of vip) {
    await prisma.vipLevel.upsert({ where: { level: v.level }, create: v as any, update: v as any });
  }

  // ── Account ID counter ──────────────────────────────────────────────────────
  await prisma.counter.upsert({ where: { key: 'account' }, create: { key: 'account', value: 100000 }, update: {} });

  // ── Users: admin + two demo players ──────────────────────────────────────────
  async function ensureUser(opts: {
    email: string; username: string; password: string; role?: any; accountId: number; demo?: number;
  }) {
    const passwordHash = await bcrypt.hash(opts.password, 10);
    const user = await prisma.user.upsert({
      where: { email: opts.email },
      create: {
        email: opts.email,
        username: opts.username,
        passwordHash,
        accountId: opts.accountId,
        role: opts.role ?? 'USER',
        referralCode: genReferralCode(),
        emailVerified: true,
      },
      update: { role: opts.role ?? 'USER' },
    });
    if (opts.demo) {
      await prisma.balance.upsert({
        where: { userId_currency_mode: { userId: user.id, currency: 'DEMO', mode: 'DEMO' } },
        create: { userId: user.id, currency: 'DEMO', mode: 'DEMO', amount: opts.demo },
        update: {},
      });
    }
    return user;
  }

  const admin = await ensureUser({
    email: (process.env.ADMIN_EMAIL || 'admin@kukumba.local').toLowerCase(),
    username: process.env.ADMIN_USERNAME || 'kukumba_admin',
    password: process.env.ADMIN_PASSWORD || 'admin12345',
    role: 'ADMIN',
    accountId: 100000,
    demo: 100000,
  });
  // give the admin some real funds to exercise admin tooling
  await prisma.balance.upsert({
    where: { userId_currency_mode: { userId: admin.id, currency: 'USDT', mode: 'REAL' } },
    create: { userId: admin.id, currency: 'USDT', mode: 'REAL', amount: 5000 },
    update: {},
  });

  const p1 = await ensureUser({ email: 'pinkie@kukumba.local', username: 'PinkiePie', password: 'player123', accountId: 100001, demo: 5000 });
  const p2 = await ensureUser({ email: 'twilight@kukumba.local', username: 'TwilightSpark', password: 'player123', accountId: 100002, demo: 5000 });
  await prisma.counter.update({ where: { key: 'account' }, data: { value: 100002 } });

  // ── Bonuses ──────────────────────────────────────────────────────────────────
  const bonuses = [
    { key: 'welcome', name: 'Welcome Bonus', type: 'WELCOME', currency: 'DEMO', amount: 1000, wagerMultiplier: 1, descriptionRu: 'Приветственный бонус 1000 демо-монет.', descriptionEn: '1000 demo coins welcome bonus.' },
    { key: 'nodep', name: 'No-Deposit Spark', type: 'NO_DEPOSIT', currency: 'DEMO', amount: 500, wagerMultiplier: 2, descriptionRu: 'Бездепозитный бонус 500 демо-монет.', descriptionEn: '500 demo coins, no deposit needed.' },
    { key: 'deposit100', name: '100% First Deposit', type: 'DEPOSIT', currency: 'USDT', amount: 0, percent: 100, maxAmount: 500, wagerMultiplier: 3, descriptionRu: '100% к первому депозиту до 500 USDT.', descriptionEn: '100% first deposit match up to 500 USDT.' },
  ];
  for (const b of bonuses) {
    await prisma.bonus.upsert({ where: { key: b.key }, create: b as any, update: b as any });
  }

  // ── Promo codes ──────────────────────────────────────────────────────────────
  const promos = [
    { code: 'KUKUMBA', type: 'BALANCE', currency: 'DEMO', amount: 1000, mode: 'DEMO', perUserLimit: 1 },
    { code: 'WELCOME50', type: 'BALANCE', currency: 'DEMO', amount: 500, mode: 'DEMO', perUserLimit: 1 },
    { code: 'VIPBOOST', type: 'VIP_XP', vipXp: 500, mode: 'DEMO', perUserLimit: 1 },
  ];
  for (const p of promos) {
    await prisma.promoCode.upsert({ where: { code: p.code }, create: p as any, update: {} });
  }

  // ── App settings ─────────────────────────────────────────────────────────────
  const settings: Record<string, any> = {
    'platform.name': 'KuKuMBA',
    'game.rtp': 0.99,
    'referral.wagerCommission': 0.005,
    'payments.requireKycForWithdrawal': false,
    'payments.autoApproveWithdrawals': false,
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  // ── Content pages (RU + EN) ──────────────────────────────────────────────────
  const pages: Array<{ key: string; ru: { t: string; b: string }; en: { t: string; b: string } }> = [
    {
      key: 'about',
      ru: { t: 'О KuKuMBA', b: 'KuKuMBA — няшное, но серьёзное казино с одной честной игрой: рулеткой с RTP 99%. Мы верим в прозрачность (provably-fair), заботу об игроках и магию единорогов. 🦄' },
      en: { t: 'About KuKuMBA', b: 'KuKuMBA is a cute-yet-serious casino with one fair game: 99% RTP roulette. We believe in transparency (provably-fair), player care, and unicorn magic. 🦄' },
    },
    {
      key: 'responsible-gaming',
      ru: { t: 'Ответственная игра', b: 'Играйте ради удовольствия. Устанавливайте лимиты депозитов, потерь и времени в разделе «Профиль → Ответственная игра». Доступно самоисключение. Если игра перестала приносить радость — сделайте паузу. 18+.' },
      en: { t: 'Responsible Gaming', b: 'Play for fun. Set deposit, loss and time limits under Profile → Responsible Gaming. Self-exclusion is available. If gambling stops being fun, take a break. 18+.' },
    },
    {
      key: 'private-game',
      ru: { t: 'Приватная игра', b: 'Режим приватной игры скрывает ваши ставки из общей ленты и чата. Включается в настройках профиля. Ваши результаты видите только вы.' },
      en: { t: 'Private Play', b: 'Private play hides your bets from the public feed and chat. Toggle it in profile settings. Only you see your results.' },
    },
    {
      key: 'contacts',
      ru: { t: 'Контакты', b: 'Поддержка: support@kukumba.local • Telegram: @kukumba_support • Партнёрам: partners@kukumba.local' },
      en: { t: 'Contacts', b: 'Support: support@kukumba.local • Telegram: @kukumba_support • Partners: partners@kukumba.local' },
    },
    {
      key: 'privacy',
      ru: { t: 'Конфиденциальность', b: 'Мы храним минимум данных, необходимых для работы аккаунта и соответствия требованиям. Данные не передаются третьим лицам, кроме случаев, предусмотренных законом.' },
      en: { t: 'Privacy', b: 'We store the minimum data needed to run your account and stay compliant. Data is not shared with third parties except as required by law.' },
    },
    {
      key: 'terms',
      ru: { t: 'Условия', b: 'Используя KuKuMBA, вы подтверждаете, что вам 18+ и азартные игры разрешены в вашей юрисдикции. Демо-режим не предполагает реальных выплат.' },
      en: { t: 'Terms', b: 'By using KuKuMBA you confirm you are 18+ and gambling is legal in your jurisdiction. Demo mode has no real payouts.' },
    },
  ];
  for (const p of pages) {
    await prisma.contentPage.upsert({ where: { key_locale: { key: p.key, locale: 'ru' } }, create: { key: p.key, locale: 'ru', title: p.ru.t, body: p.ru.b }, update: { title: p.ru.t, body: p.ru.b } });
    await prisma.contentPage.upsert({ where: { key_locale: { key: p.key, locale: 'en' } }, create: { key: p.key, locale: 'en', title: p.en.t, body: p.en.b }, update: { title: p.en.t, body: p.en.b } });
  }

  // ── Demo raffle with participants ────────────────────────────────────────────
  const existingRaffle = await prisma.raffle.findFirst({ where: { title: 'KuKuMBA Mega Giveaway' } });
  if (!existingRaffle) {
    const serverSeed = genServerSeed();
    const raffle = await prisma.raffle.create({
      data: {
        title: 'KuKuMBA Mega Giveaway',
        descriptionRu: 'Большой розыгрыш от администрации: 10 000 демо-монет на троих победителей!',
        descriptionEn: 'Big admin giveaway: 10,000 demo coins for three winners!',
        creatorType: 'ADMIN',
        creatorName: 'KuKuMBA Team',
        createdById: admin.id,
        currency: 'DEMO',
        mode: 'DEMO',
        prizePool: 10000,
        winnersCount: 3,
        entryCost: 0,
        maxEntriesPerUser: 1,
        status: 'OPEN',
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
    await prisma.raffleEntry.createMany({
      data: [
        { raffleId: raffle.id, userId: p1.id, tickets: 1 },
        { raffleId: raffle.id, userId: p2.id, tickets: 1 },
      ],
    });
  }

  console.log('✅  Seed complete.');
  console.log(`   Admin: ${process.env.ADMIN_EMAIL || 'admin@kukumba.local'} / ${process.env.ADMIN_PASSWORD || 'admin12345'}`);
  console.log('   Players: PinkiePie / player123, TwilightSpark / player123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
