import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { genReferralCode } from '../src/common/utils/ids';
import { DEFAULT_GRANTS } from '../src/modules/permissions/permissions.registry';
import { genServerSeed, hashServerSeed } from '../src/modules/provably-fair/provably-fair.crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding KuKuMBA…');

  // ── Currencies ───────────────────────────────────────────────────────
  // Accounts are held in fiat only (USD/EUR/RUB) plus the DEMO play-money coin.
  // Crypto is just a future deposit rail — the gateway converts it to the chosen
  // fiat — so no crypto currency rows exist. USD is the base (usdRate = 1).
  const currencies = [
    { code: 'DEMO', name: 'Demo Coins', type: 'DEMO', symbol: 'KMB', decimals: 2, networks: [], usdRate: 0.1, sortOrder: 0 },
    { code: 'USD', name: 'US Dollar', type: 'FIAT', symbol: '$', decimals: 2, networks: [], usdRate: 1, sortOrder: 1 },
    { code: 'EUR', name: 'Euro', type: 'FIAT', symbol: '€', decimals: 2, networks: [], usdRate: 1.08, sortOrder: 2 },
    { code: 'RUB', name: 'Russian Ruble', type: 'FIAT', symbol: '₽', decimals: 2, networks: [], usdRate: 0.011, sortOrder: 3 },
  ];
  const CURRENCY_CODES = currencies.map((c) => c.code);
  for (const c of currencies) {
    await prisma.currency.upsert({
      where: { code: c.code },
      create: { ...(c as any), minDeposit: 0, minWithdrawal: 0, enabled: true, isDefault: c.code === 'USD' },
      update: { ...(c as any) },
    });
  }
  // Forget any previously-seeded currency (e.g. old crypto) and balances held in it.
  await prisma.balance.deleteMany({ where: { currency: { notIn: CURRENCY_CODES } } });
  await prisma.currency.deleteMany({ where: { code: { notIn: CURRENCY_CODES } } });

  // ── Games catalog ─────────────────────────────────────────────────────
  // The lobby/games grid is fully data-driven: built-in games (route set) and
  // "coming soon" provider titles live here, so new games need no code changes.
  const ROULETTE_RTP = 0.973; // European single-zero: house edge 2.7% (1/37)
  const games: Array<Prisma.GameCreateInput & { key: string }> = [
    {
      key: 'roulette',
      name: 'KuKuMBA Roulette',
      type: 'roulette',
      category: 'ROULETTE',
      provider: 'KuKuMBA Originals',
      status: 'LIVE',
      route: '/roulette',
      rtp: ROULETTE_RTP,
      minBet: 0.01,
      maxBet: 100000,
      sortOrder: 0,
      descriptionRu:
        'Классическая европейская рулетка: 37 ячеек (0–36), честный результат (provably-fair). RTP 97.3% — преимущество казино 2.7%.',
      descriptionEn:
        'Classic European roulette: 37 pockets (0–36), provably-fair outcomes. RTP 97.3% — a 2.7% house edge.',
    },
    // ── Coming soon — provider slots ──────────────────────────────────────
    {
      key: 'sweet-bonanza',
      name: 'Sweet Bonanza',
      type: 'slots',
      category: 'SLOTS',
      provider: 'Pragmatic Play',
      status: 'COMING_SOON',
      rtp: 0.9648,
      sortOrder: 10,
      descriptionRu: 'Слот Pragmatic Play с механикой tumble и множителями. RTP 96.48%. Скоро у нас.',
      descriptionEn: 'Pragmatic Play slot with tumble mechanics and multipliers. RTP 96.48%. Coming soon.',
    },
    {
      key: 'gates-of-olympus',
      name: 'Gates of Olympus',
      type: 'slots',
      category: 'SLOTS',
      provider: 'Pragmatic Play',
      status: 'COMING_SOON',
      rtp: 0.965,
      sortOrder: 11,
      descriptionRu: 'Множители до x500 от Зевса. RTP 96.5%. Скоро у нас.',
      descriptionEn: 'Zeus multipliers up to x500. RTP 96.5%. Coming soon.',
    },
    {
      key: 'book-of-dead',
      name: 'Book of Dead',
      type: 'slots',
      category: 'SLOTS',
      provider: "Play'n GO",
      status: 'COMING_SOON',
      rtp: 0.9421,
      sortOrder: 12,
      descriptionRu: 'Приключенческий слот про Древний Египет. RTP 94.21%. Скоро у нас.',
      descriptionEn: 'Ancient-Egypt adventure slot. RTP 94.21%. Coming soon.',
    },
    {
      key: 'starburst',
      name: 'Starburst',
      type: 'slots',
      category: 'SLOTS',
      provider: 'NetEnt',
      status: 'COMING_SOON',
      rtp: 0.9609,
      sortOrder: 13,
      descriptionRu: 'Культовый слот NetEnt с расширяющимися вайлдами. RTP 96.09%. Скоро у нас.',
      descriptionEn: 'Iconic NetEnt slot with expanding wilds. RTP 96.09%. Coming soon.',
    },
    // ── Coming soon — live games ──────────────────────────────────────────
    {
      key: 'lightning-roulette',
      name: 'Lightning Roulette',
      type: 'roulette',
      category: 'LIVE',
      provider: 'Evolution',
      status: 'COMING_SOON',
      rtp: 0.9719,
      sortOrder: 20,
      descriptionRu: 'Live-рулетка с живым дилером и множителями. RTP 97.19%. Скоро у нас.',
      descriptionEn: 'Live roulette with a real dealer and multipliers. RTP 97.19%. Coming soon.',
    },
    {
      key: 'crazy-time',
      name: 'Crazy Time',
      type: 'live',
      category: 'LIVE',
      provider: 'Evolution',
      status: 'COMING_SOON',
      rtp: 0.9508,
      sortOrder: 21,
      descriptionRu: 'Live game-show с бонус-раундами. RTP 95.08%. Скоро у нас.',
      descriptionEn: 'Live game-show with bonus rounds. RTP 95.08%. Coming soon.',
    },
    // ── KuKuMBA mini-games ────────────────────────────────────────────────
    {
      key: 'crash',
      name: 'VODKA WIN Crash',
      type: 'crash',
      category: 'MINIGAME',
      provider: 'KuKuMBA Originals',
      status: 'LIVE',
      route: '/crash',
      rtp: 0.99,
      minBet: 0.01,
      maxBet: 100000,
      sortOrder: 1,
      descriptionRu:
        'Crash-игра: множитель растёт, пока герой держится — забери выигрыш до того, как его развезёт. До ×1 000 000. Provably-fair (тот же сид-чейн, что у рулетки), RTP 99%.',
      descriptionEn:
        'Crash game: the multiplier climbs while the hero holds on — cash out before he keels over. Up to ×1,000,000. Provably-fair (same seed chain as the roulette), 99% RTP.',
    },
    {
      key: 'ponyjack',
      name: 'Ponyjack',
      type: 'blackjack',
      category: 'CARDS',
      provider: 'KuKuMBA Originals',
      status: 'LIVE',
      route: '/ponyjack',
      rtp: 0.995,
      minBet: 0.01,
      maxBet: 100000,
      sortOrder: 2,
      descriptionRu:
        'Блэкджек с пони: собери 21, дилер останавливается на всех 17. Понижек (21 с раздачи) платит 3:2, доступны дабл и сплит. Provably-fair (бесконечная колода на том же сид-чейне), RTP 99.5% при оптимальной игре.',
      descriptionEn:
        'Blackjack with ponies: make 21, the dealer stands on all 17s. A Ponyjack (natural 21) pays 3:2; double and split available. Provably-fair (infinite shoe on the same seed chain), 99.5% RTP with optimal play.',
    },
    {
      key: 'dice',
      name: 'KuKuMBA Dice',
      type: 'dice',
      category: 'MINIGAME',
      provider: 'KuKuMBA Originals',
      status: 'COMING_SOON',
      rtp: 0.99,
      sortOrder: 31,
      descriptionRu: 'Классический dice с настраиваемым шансом. Provably-fair, RTP 99%. Скоро у нас.',
      descriptionEn: 'Classic dice with adjustable win chance. Provably-fair, RTP 99%. Coming soon.',
    },
    {
      key: 'plinko',
      name: 'KuKuMBA Plinko',
      type: 'plinko',
      category: 'MINIGAME',
      provider: 'KuKuMBA Originals',
      status: 'LIVE',
      route: '/plinko',
      rtp: 0.99,
      minBet: 0.01,
      maxBet: 100000,
      sortOrder: 3,
      descriptionRu:
        'Роняй шар и смотри, как он скачет по пинам к множителям. Три уровня риска (низкий/средний/высокий) и от 8 до 16 рядов: чем ближе к краю — тем жирнее икс (до ×1000), в центре — скромнее. Полностью случайно и честно (provably-fair, тот же сид-чейн, что у рулетки), RTP 99%.',
      descriptionEn:
        'Drop the ball and watch it bounce down the pins into a multiplier slot. Three risk levels (low/medium/high) and 8 to 16 rows: the closer to the edge, the fatter the multiplier (up to ×1000); the centre pays modestly. Fully random and fair (provably-fair, same seed chain as the roulette), 99% RTP.',
    },
    {
      key: 'upgrader',
      name: 'KuKuMBA Upgrader',
      type: 'upgrader',
      category: 'MINIGAME',
      provider: 'KuKuMBA Originals',
      status: 'LIVE',
      route: '/upgrader',
      rtp: 0.99,
      minBet: 0.01,
      maxBet: 100000,
      sortOrder: 4,
      descriptionRu:
        'Апгрейдер: задай шанс выигрыша от 0.01% до 97% — множитель считается сам (от ×1.02 до ×9900). ' +
        'Стрелка летит по кругу колеса и замирает в случайной точке: попала в подсвеченную зону — ' +
        'забираешь ставку × множитель, мимо — ставка сгорает. Есть быстрая игра. ' +
        'Полностью честно (provably-fair, тот же сид-чейн, что у рулетки).',
      descriptionEn:
        'Upgrader: pick a win chance from 0.01% to 97% — the multiplier follows (×1.02 up to ×9900). ' +
        'The needle flies around the wheel rim and stops at a random point: land in the lit zone to ' +
        'take stake × multiplier, miss and the stake burns. Quick-play supported. ' +
        'Fully fair (provably-fair, same seed chain as the roulette).',
    },
    {
      key: 'mines',
      name: 'KuKuMBA Mines',
      type: 'mines',
      category: 'MINIGAME',
      provider: 'KuKuMBA Originals',
      status: 'LIVE',
      route: '/mines',
      rtp: 0.99,
      minBet: 0.01,
      maxBet: 100000,
      sortOrder: 5,
      descriptionRu:
        'Мины: поле 5×5, от 2 до 24 мин на выбор. Открывай клетки — каждый найденный кристалл ' +
        'поднимает множитель, забрать выигрыш можно в любой момент, а мина сжигает ставку. ' +
        'Открыл все безопасные клетки — автозабор по максимальному множителю (до ×5 200 000). ' +
        'Provably-fair (тот же сид-чейн, что у рулетки), RTP 99%.',
      descriptionEn:
        'Mines: a 5×5 board with 2 to 24 mines of your choice. Open tiles — every crystal found ' +
        'raises the multiplier, cash out any time, hit a mine and the stake burns. ' +
        'Clear every safe tile for an auto-cashout at the top multiplier (up to ×5,200,000). ' +
        'Provably-fair (same seed chain as the roulette), 99% RTP.',
    },
    {
      key: 'sexcoin',
      name: 'Sexcoin',
      type: 'coinflip',
      category: 'MINIGAME',
      provider: 'KuKuMBA Originals',
      status: 'LIVE',
      route: '/sexcoin',
      rtp: 0.97,
      minBet: 0.01,
      maxBet: 100000,
      sortOrder: 6,
      descriptionRu:
        'Sexcoin: пикантный коинфлип 18+. Угадай сторону монеты — пенис или вагина. ' +
        'Каждый угаданный бросок умножает выигрыш (×1.94 за шаг при RTP 97%), забрать можно ' +
        'в любой момент, ошибка сжигает ставку. Серия до 20 бросков (свыше ×1 000 000). ' +
        'Provably-fair (тот же сид-чейн, что у рулетки), RTP настраивается.',
      descriptionEn:
        'Sexcoin: a spicy 18+ coinflip. Guess the side — penis or vagina. Every correct flip ' +
        'multiplies the win (×1.94 per step at 97% RTP), cash out any time, one miss burns the ' +
        'stake. Streaks up to 20 flips (over ×1,000,000). Provably-fair (same seed chain as ' +
        'the roulette), configurable RTP.',
    },
  ];
  for (const g of games) {
    const { key, ...rest } = g;
    await prisma.game.upsert({ where: { key }, create: { key, ...rest }, update: rest });
  }

  // ── VIP ladder ────────────────────────────────────────────────────────
  // 21 ступень (0–20) по миру My Little Pony. Прокачка двумя треками: сумма
  // депозитов И сумма ставок (ставок нужно в WAGER_TO_DEPOSIT раз больше), обе
  // в USD-эквиваленте. Первые уровни намеренно дешёвые, чтобы новички быстро
  // получали статус. Кешбэк: 2% + 0.75%/уровень. Рейкбэк: доля от house edge,
  // 5% на 1-м уровне, +1.5%/уровень (см. RakebackService — казино всегда
  // оставляет себе бо́льшую часть маржи).
  const WAGER_TO_DEPOSIT = 5;
  const VIP_LADDER: Array<{
    name: string; icon: string; color: string; deposit: number; perksRu?: string; perksEn?: string;
  }> = [
    { name: 'Foal', icon: 'horseshoe', color: '#9AA4C7', deposit: 0, perksRu: 'Старт пути — кешбэк уже работает', perksEn: 'Start of the journey — cashback already works' },
    { name: 'Apple Bloom', icon: 'apple', color: '#F26B8A', deposit: 10, perksRu: 'Открывается рейкбэк', perksEn: 'Rakeback unlocks' },
    { name: 'Sweetie Belle', icon: 'bell', color: '#D9A6F2', deposit: 25 },
    { name: 'Scootaloo', icon: 'scooter', color: '#FF9A5C', deposit: 50 },
    { name: 'Bon Bon', icon: 'candy', color: '#7FD1E8', deposit: 100 },
    { name: 'Lyra Heartstrings', icon: 'lyre', color: '#9AE8C9', deposit: 200, perksRu: 'Доступ к VIP-розыгрышам', perksEn: 'Access to VIP raffles' },
    { name: 'Derpy Hooves', icon: 'bubbles', color: '#C9CCD6', deposit: 350 },
    { name: 'DJ Pon-3', icon: 'headphones', color: '#4FD8E8', deposit: 550 },
    { name: 'Octavia Melody', icon: 'notes', color: '#C7A6E0', deposit: 800 },
    { name: 'Big McIntosh', icon: 'apple-half', color: '#E8604C', deposit: 1200 },
    { name: 'Spitfire', icon: 'flame', color: '#FFB347', deposit: 1750, perksRu: 'Приоритетная поддержка', perksEn: 'Priority support' },
    { name: 'Trixie', icon: 'wizard-hat', color: '#8FA7F2', deposit: 2500 },
    { name: 'Starlight Glimmer', icon: 'sparkle', color: '#B87FE8', deposit: 3500 },
    { name: 'Applejack', icon: 'cowboy-hat', color: '#FFA94D', deposit: 5000 },
    { name: 'Pinkie Pie', icon: 'balloon', color: '#FF8FD0', deposit: 7500 },
    { name: 'Fluttershy', icon: 'butterfly', color: '#FFE38F', deposit: 11000, perksRu: 'Персональный менеджер', perksEn: 'Personal manager' },
    { name: 'Rarity', icon: 'gem', color: '#B79CED', deposit: 16000 },
    { name: 'Rainbow Dash', icon: 'bolt', color: '#5CD1FF', deposit: 23000 },
    { name: 'Twilight Sparkle', icon: 'star6', color: '#A56EFF', deposit: 32000, perksRu: 'Закрытые VIP-розыгрыши', perksEn: 'Invite-only VIP raffles' },
    { name: 'Princess Luna', icon: 'moon', color: '#6E7BFF', deposit: 45000 },
    { name: 'Princess Celestia', icon: 'sun', color: '#FFD86E', deposit: 60000, perksRu: 'Максимальный кешбэк и рейкбэк', perksEn: 'Maximum cashback and rakeback' },
  ];
  for (let level = 0; level < VIP_LADDER.length; level++) {
    const v = VIP_LADDER[level];
    const row = {
      name: v.name,
      icon: v.icon,
      color: v.color,
      depositRequiredUsd: v.deposit,
      wagerRequiredUsd: v.deposit * WAGER_TO_DEPOSIT,
      cashbackPercent: +(2 + 0.75 * level).toFixed(2),
      rakebackPercent: level === 0 ? 0 : +(5 + 1.5 * (level - 1)).toFixed(1),
      perksRu: v.perksRu ?? null,
      perksEn: v.perksEn ?? null,
    };
    await prisma.vipLevel.upsert({ where: { level }, create: { level, ...row }, update: row });
  }
  // Drop legacy levels beyond the ladder and clamp any user parked above it.
  await prisma.vipLevel.deleteMany({ where: { level: { gte: VIP_LADDER.length } } });
  await prisma.user.updateMany({
    where: { vipLevel: { gte: VIP_LADDER.length } },
    data: { vipLevel: VIP_LADDER.length - 1 },
  });

  // ── Account ID counter ────────────────────────────────────────────
  await prisma.counter.upsert({ where: { key: 'account' }, create: { key: 'account', value: 100000 }, update: {} });

  // ── Users: admin only (no seeded test players) ──────────────────────
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
    where: { userId_currency_mode: { userId: admin.id, currency: 'USD', mode: 'REAL' } },
    create: { userId: admin.id, currency: 'USD', mode: 'REAL', amount: 5000 },
    update: {},
  });

  // The account counter stays at 100000 (admin's id); the next real sign-up gets 100001.

  // ── Bonuses ──────────────────────────────────────────────────────────
  // Bonuses are REAL money only — demo is free via the demo top-up, so no demo
  // bonuses exist. The no-deposit/welcome offers are modest real grants (admin
  // can retune amounts or disable them in the panel).
  const bonuses = [
    { key: 'welcome', name: 'Welcome Bonus', type: 'WELCOME', currency: 'USD', amount: 5, wagerMultiplier: 10, descriptionRu: 'Приветственный бонус 5 USD для новых игроков.', descriptionEn: '5 USD welcome bonus for new players.' },
    { key: 'nodep', name: 'No-Deposit Spark', type: 'NO_DEPOSIT', currency: 'USD', amount: 2, wagerMultiplier: 15, descriptionRu: 'Бездепозитный бонус 2 USD — без пополнения.', descriptionEn: '2 USD, no deposit needed.' },
    { key: 'deposit100', name: '100% First Deposit', type: 'DEPOSIT', currency: 'USD', amount: 0, percent: 100, maxAmount: 500, wagerMultiplier: 3, descriptionRu: '100% к первому депозиту до 500 USD.', descriptionEn: '100% first deposit match up to 500 USD.' },
    // Терм-конфиг еженедельного кешбэка: сумма считается в CashbackService
    // ((депозиты − выводы за 7 дней) × процент VIP-уровня), отсюда берётся
    // только отыгрыш. currency=null — строка не попадает в каталог бонусов.
    { key: 'cashback', name: 'Weekly Cashback', type: 'CASHBACK', currency: null, amount: 0, wagerMultiplier: 3, sticky: false, descriptionRu: 'Еженедельный кешбэк: (депозиты − выводы за 7 дней) × процент VIP-уровня. Вейджер ×3.', descriptionEn: 'Weekly cashback: (deposits − withdrawals over 7 days) × your VIP percent. Wagering ×3.' },
  ];
  for (const b of bonuses) {
    await prisma.bonus.upsert({ where: { key: b.key }, create: b as any, update: b as any });
  }

  // ── Promo codes ─────────────────────────────────────────────────
  const promos = [
    { code: 'KUKUMBA', type: 'BALANCE', currency: 'DEMO', amount: 1000, mode: 'DEMO', perUserLimit: 1 },
    { code: 'WELCOME50', type: 'BALANCE', currency: 'DEMO', amount: 500, mode: 'DEMO', perUserLimit: 1 },
  ];
  for (const p of promos) {
    await prisma.promoCode.upsert({ where: { code: p.code }, create: p as any, update: {} });
  }
  // The VIP_XP promo type is gone together with XP — drop the legacy code.
  await prisma.promoCode.deleteMany({ where: { code: 'VIPBOOST' } });

  // ── App settings ───────────────────────────────────────────────
  const settings: Record<string, any> = {
    'platform.name': 'KuKuMBA',
    'game.rtp': 0.973,
    // Referral revenue share: the referrer's fraction of a referral's net losses.
    'referral.lossCommission': 0.1,
    'payments.requireKycForWithdrawal': false,
    'payments.autoApproveWithdrawals': false,
    // Cashback accrual window in days (admin-tunable; percentages live on VipLevel).
    'cashback.periodDays': 7,
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  // The per-bet wager commission is replaced by the loss revenue share above.
  await prisma.appSetting.deleteMany({ where: { key: 'referral.wagerCommission' } });

  // ── Game providers (aggregators) ───────────────────────────────
  // A sandbox aggregator so the launch/callback loop is testable end-to-end.
  // Secrets are configured from the admin panel (encrypted at rest), not seeded.
  await prisma.gameProvider.upsert({
    where: { key: 'mock' },
    create: { key: 'mock', name: 'Mock Aggregator', kind: 'MOCK', enabled: true },
    update: {},
  });

  // ── RBAC default grants (idempotent; never overrides later admin edits) ──
  for (const [role, perms] of Object.entries(DEFAULT_GRANTS)) {
    for (const permission of perms) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role: role as any, permission } },
        create: { role: role as any, permission, allowed: true },
        update: {},
      });
    }
  }

  // ── Content pages (RU + EN) ───────────────────────────────────────
  const pages: Array<{ key: string; ru: { t: string; b: string }; en: { t: string; b: string } }> = [
    {
      key: 'about',
      ru: { t: 'О KuKuMBA', b: 'KuKuMBA — няшное, но серьёзное казино: честная provably-fair рулетка (RTP 97.3%) и crash-игра VODKA WIN (RTP 99%), а скоро — слоты и live-игры от ведущих провайдеров. Мы верим в прозрачность, заботу об игроках и магию единорогов.' },
      en: { t: 'About KuKuMBA', b: 'KuKuMBA is a cute-yet-serious casino: a fair provably-fair roulette (97.3% RTP) and the VODKA WIN crash game (99% RTP), with slots and live games from leading providers coming soon. We believe in transparency, player care, and unicorn magic.' },
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

  // ── Demo raffle (starts empty; real players join from the UI) ─────────────
  const existingRaffle = await prisma.raffle.findFirst({ where: { title: 'KuKuMBA Mega Giveaway' } });
  if (!existingRaffle) {
    const serverSeed = genServerSeed();
    await prisma.raffle.create({
      data: {
        title: 'KuKuMBA Mega Giveaway',
        descriptionRu: 'Большой розыгрыш от администрации: 300 USD на троих победителей!',
        descriptionEn: 'Big admin giveaway: 300 USD for three winners!',
        creatorType: 'ADMIN',
        creatorName: 'KuKuMBA Team',
        createdById: admin.id,
        currency: 'USD',
        mode: 'REAL',
        prizePool: 300,
        winnersCount: 3,
        entryCost: 0,
        maxEntriesPerUser: 1,
        status: 'OPEN',
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
  }

  console.log('Seed complete.');
  console.log(`   Admin: ${process.env.ADMIN_EMAIL || 'admin@kukumba.local'} / ${process.env.ADMIN_PASSWORD || 'admin12345'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
