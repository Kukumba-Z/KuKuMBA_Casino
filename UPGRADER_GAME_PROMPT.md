# Промпт: игра **KuKuMBA Upgrader** (крутящаяся стрелка + сектор-множитель)

> Это **техническое задание-промпт** для реализации новой встроенной игры `upgrader`
> в репозитории KuKuMBA. Оно самодостаточно: содержит механику, математику,
> точные пути файлов, скелеты кода в стиле проекта, дизайн, звук, i18n, тесты и
> критерии приёмки. Отдавай его целиком разработчику или ИИ-агенту.
>
> **Золотое правило проекта:** ничего не изобретай — клонируй существующий
> паттерн. Эталон для Upgrader — **Plinko** (single-shot: ставка → provably-fair
> исход → расчёт в одной транзакции, без свипера) и **Roulette** (математика
> `множитель = RTP / вероятность`). Upgrader — это, по сути, «рулетка на один
> сектор»: и по расчёту, и по способу рендера колеса.

---

## 0. TL;DR механики

Игрок ставит сумму и задаёт **шанс выигрыша** от `0.01%` до `99%`. По кругу
крутится стрелка; на колесе есть **подсвеченный сектор** (win-зона), угловой
размер которого равен шансу. Стрелка останавливается в случайной (provably-fair)
точке: попала в сектор — **выигрыш** `ставка × множитель`, мимо — ставка сгорает.

- **Множитель** выводится из шанса: `множитель = RTP / шанс` (плоский house edge —
  ровно как в рулетке `multiplier = RTP / probability`).
- **Два связанных поля ввода:** «шанс %» и «множитель ×». Правишь одно — второе
  пересчитывается (`× = RTP/шанс`, `шанс = RTP/×`). На сервер уходит **только
  `chance`** как канон; множитель всегда производный.
- **Быстрая игра** (общий тумблер `quick`): стрелка долетает до результата мгновенно.
- **Звук**: свист/тики крутящейся стрелки + аккорд на победу / глухой блип на проигрыш.
- **RTP** правится в админ-панели (регулятор появляется **автоматически**, см. §7).

Ключ игры: `upgrader` · маршрут: `/upgrader` · категория: `MINIGAME` ·
провайдер: `KuKuMBA Originals` · статус: `LIVE`.

---

## 1. Архитектура репозитория (то, на что опираемся)

Монорепо pnpm: `apps/api` (NestJS + Prisma + PostgreSQL), `apps/web`
(React + Vite + TS + Tailwind + TanStack Query + Zustand).

**Каждая встроенная игра — это 4 файла на бэке + страница на фронте:**

```
apps/api/src/modules/games/<game>/
  <game>.engine.ts        # чистая математика, без БД, полностью тестируемо
  <game>.engine.spec.ts   # юнит-тесты движка
  <game>.service.ts       # оркестрация: транзакция, кошелёк, provably-fair, лояльность
  <game>.controller.ts    # HTTP-эндпоинты (+ DTO-валидация class-validator)
```
Игра подключается в `apps/api/src/modules/games/games.module.ts`
(controller + provider + export) и заводится строкой в `apps/api/prisma/seed.ts`.

Фронт: страница `apps/web/src/pages/<Game>.tsx`, маршрут в
`apps/web/src/App.tsx`, визуал в `apps/web/src/components/<game>/*`, тексты в
`apps/web/src/i18n.ts`.

### Общие сервисы, которые дёргает игра (внедряются в конструктор сервиса)
`PrismaService`, `WalletService`, `ProvablyFairService`, `SettingsService`,
`VipService`, `RakebackService`, `ReferralsService`, `RealtimeService`,
`NotificationsService`, `LeaderboardsService`, `StatsService`, `BonusesService`.
Скопируй список 1-в-1 из `plinko.service.ts`.

### Provably-fair (файлы `modules/provably-fair/`)
- `floatFromSeeds(serverSeed, clientSeed, nonce, cursor=0) → float ∈ [0,1)` —
  детерминированный HMAC-SHA256. Это единственный источник случайности.
- `pf.consume(tx, userId)` — **внутри транзакции** лочит строку активного сида
  (`FOR UPDATE`), инкрементит `nonce`, возвращает снапшот
  `{ id, serverSeed, serverSeedHash, clientSeed, nonce }`.
- Сервер публикует `SHA256(serverSeed)` заранее, раскрывает `serverSeed` при
  ротации — игрок перепроверяет историю. Upgrader живёт в **той же цепочке сидов**,
  что рулетка/crash/plinko (просто следующий nonce).

### Деньги (`common/utils/money`)
`D(x)` → Decimal.js; `roundTo(decimal, decimals)` — округление до точности валюты.
В БД суммы — `Decimal(38,18)`. Никогда не считай деньги в `number`.

### Схема БД (Prisma) — новые таблицы НЕ нужны
Переиспользуем `GameRound` и `Bet` (см. `apps/api/prisma/schema.prisma`):
- `GameRound.outcome: Int` — универсальное поле исхода (рулетка: карман 0..36;
  plinko: слот). **Для Upgrader кладём точку остановки в «бипах»:
  `outcome = Math.floor(float * 10000)` (0..9999)** — этого достаточно и для
  анимации, и для аудита.
- `GameRound.outcomeColor: String` — `"green"` (победа) / `"red"` (проигрыш).
- `Bet.betType: String` — используем `"UPGRADER"`.
- `Bet.selection: Json` — снапшот параметров ставки:
  `{ chance, multiplier, rtp, angleBp }`.
- `Bet.multiplier / payout / status` — `WON | LOST` (пуша здесь нет: проигрыш = 0).

> Изменения схемы Prisma **не требуются**. Если всё же добавляешь поле — делай
> `pnpm db:push` и апдейть `seed.ts`, но по умолчанию обходимся существующей схемой.

---

## 2. Математика и provably-fair (точная спецификация)

Пусть `chance ∈ [0.0001, 0.99]` (доля, не проценты), `rtp` — из настроек (см. §7).

```
multiplier(chance, rtp) = rtp / chance          // валовый множитель, включает ставку
expectedReturn          = chance * multiplier   // = rtp  — плоский edge на ЛЮБОМ шансе
```

Розыгрыш раунда:
```
float = floatFromSeeds(serverSeed, clientSeed, nonce)   // ∈ [0,1)
win   = float < chance                                  // win-зона — это интервал [0, chance)
mult  = rtp / chance
payout = win ? roundTo(stake * mult, cur.decimals) : 0
angleBp = floor(float * 10000)                          // точка остановки стрелки (0..9999)
```

**Критично для честности «что вижу — то и посчитано»:** win-зона на колесе
рисуется как дуга **`[0, chance)` от одной и той же нулевой точки отсчёта**, а
стрелка останавливается на угле `float * 360°`. Тогда «стрелка внутри дуги» ⇔
`float < chance` — визуал и расчёт совпадают тождественно, без подгонки.

Диапазоны (при `rtp = 0.99`): шанс `0.01%…99%` ⇒ множитель `≈ ×1.00 … ×9900`.
Поскольку множитель зависит от RTP, при смене RTP админом сдвигается и допустимый
диапазон множителя — клиент всегда берёт актуальный `rtp` из `info`-эндпоинта.

**Связанные поля ввода (канон — `chance`):**
- поле «шанс %»: `chance = pct / 100`, клампится в `[0.0001, 0.99]`;
- поле «множитель ×»: пользователь вводит `M` → `chance = clamp(rtp / M, 0.0001, 0.99)`;
- отображаемый множитель всегда `rtp / chance` (после клампа);
- **на сервер отправляется только `chance`**; сервер сам считает множитель и
  снапшотит `rtp` в `Bet.selection` (правка RTP не переписывает уже сыгранный раунд).

---

## 3. Backend — задачи и скелеты

### 3.1 `upgrader.engine.ts` (чистая математика, зеркало `plinko.engine.ts`)

```ts
import { BadRequestException } from '@nestjs/common';

// Границы шанса как ДОЛЯ (0.01% … 99%).
export const UPGRADER_MIN_CHANCE = 0.0001; // 0.01%
export const UPGRADER_MAX_CHANCE = 0.99;   // 99%

/** Валидирует/клампит шанс; бросает BAD_CHANCE на мусоре. */
export function normalizeChance(chance: unknown): number {
  const c = Number(chance);
  if (!Number.isFinite(c)) throw new BadRequestException('BAD_CHANCE');
  if (c < UPGRADER_MIN_CHANCE || c > UPGRADER_MAX_CHANCE)
    throw new BadRequestException('CHANCE_OUT_OF_RANGE');
  return c;
}

/** Валовый множитель: RTP / шанс — плоский house edge (как в рулетке). */
export function multiplierFor(chance: number, rtp: number): number {
  const target = rtp > 0 && rtp <= 1 ? rtp : 0.99;
  return target / chance;
}

export interface UpgraderSettlement {
  win: boolean;
  multiplier: number; // валовый множитель (на проигрыше payout=0, множитель тот же)
  payout: number;     // stake * multiplier на победе, иначе 0
  angleBp: number;    // точка остановки стрелки, 0..9999
}

/** Расчёт одного спина по честному float ∈ [0,1). Только числа (БД — Decimal). */
export function settle(chance: number, float: number, stake: number, rtp: number): UpgraderSettlement {
  const f = float >= 0 && float < 1 ? float : 0;
  const win = f < chance;                 // win-зона = [0, chance)
  const multiplier = multiplierFor(chance, rtp);
  return { win, multiplier, payout: win ? stake * multiplier : 0, angleBp: Math.floor(f * 10000) };
}
```

### 3.2 `upgrader.engine.spec.ts` (обязательные тесты)
- `multiplierFor`: при `rtp=0.99` даёт `×1.98` на `chance=0.5`, `×9.9` на `0.1`,
  `×0.99×100=×99`... — проверь пару точек.
- **Плоский RTP:** для набора шансов `[0.0001, 0.05, 0.5, 0.99]`
  `chance * multiplierFor(chance, rtp) ≈ rtp` (в пределах 1e-9).
- `settle`: `float < chance` ⇒ win + `payout ≈ stake*mult`; `float ≥ chance` ⇒ lose + `payout=0`.
- Граница: ровно `float === chance` ⇒ **проигрыш** (интервал полуоткрыт).
- `normalizeChance`: клампы/исключения на `0`, `1`, `-1`, `NaN`, за границами.

### 3.3 `upgrader.service.ts` (клонируй `plinko.service.ts` целиком, поправь исход)

Ключевые методы:

**`game()`** — `prisma.game.findUnique({ where: { key: 'upgrader' } })`.

**`info(chanceInput?)`** — всё, что нужно UI для рендера:
```ts
const game = await this.game();
const rtp = game?.rtp ?? (await this.settings.rtp());
const chance = clampToRange(chanceInput ?? 0.5); // дефолт 50%
return {
  key: 'upgrader',
  name: game?.name ?? 'KuKuMBA Upgrader',
  rtp,
  houseEdge: Number((1 - rtp).toFixed(4)),
  minBet: game?.minBet?.toFixed() ?? '0.1',
  maxBet: game?.maxBet?.toFixed() ?? '100000',
  enabled: game?.enabled ?? true,
  descriptionRu: game?.descriptionRu,
  descriptionEn: game?.descriptionEn,
  minChance: UPGRADER_MIN_CHANCE,
  maxChance: UPGRADER_MAX_CHANCE,
  chance,
  multiplier: Number(multiplierFor(chance, rtp).toFixed(4)),
};
```

**`play(userId, dto)`** — 1-в-1 структура `plinko.play`, отличия только в исходе.
Точная последовательность (не пропускай шаги — это инварианты денег/лояльности):

1. `game` есть, `enabled`, `status === 'LIVE'`; иначе `GAME_DISABLED`.
2. `mode` нормализация; `currency` существует и `enabled`; проверки DEMO/REAL
   (`DEMO_MODE_USES_DEMO_CURRENCY`, `REAL_MODE_REQUIRES_REAL_CURRENCY`); demo
   только для originals (`DEMO_ONLY_ORIGINALS`) — копипаст из plinko.
3. `chance = normalizeChance(dto.chance)`.
4. `stake = D(dto.stake)`; `>0`, `>= game.minBet`, `<= game.maxBet`; и
   `<= tableMaxStake(cur.usdRate, isDemo)` (иначе `TABLE_LIMIT_EXCEEDED`).
5. `rtp = game.rtp ?? await settings.rtp()`.
6. `prisma.$transaction(async (tx) => { ... })`:
   1. `wallet.apply(tx, { userId, type:'BET', currency, mode, amount: stake.neg(), refType:'upgrader', description:'Upgrader bet' })`.
   2. `seed = await pf.consume(tx, userId)`;
      `float = floatFromSeeds(seed.serverSeed, seed.clientSeed, seed.nonce)`;
      `{ win, multiplier, payout: gross, angleBp } = settle(chance, float, stake.toNumber(), rtp)`.
   3. `payout = win ? roundTo(stake.mul(D(multiplier)), cur.decimals) : D(0)`
      (округляем до точности валюты — без «пыли»).
   4. `status = win ? 'WON' : 'LOST'`; `outcomeColor = win ? 'green' : 'red'`.
   5. `tx.gameRound.create({ data: { gameId, userId, seedId: seed.id, serverSeedHash,
      clientSeed, nonce, outcome: angleBp, outcomeColor, currency, mode,
      totalStake: stake, totalPayout: payout } })`.
   6. `tx.bet.create({ data: { roundId, gameId, userId, betType:'UPGRADER',
      selection: { chance, multiplier, rtp, angleBp }, stake, currency, mode,
      multiplier: D(multiplier), payout, status } })`.
   7. `if (payout.gt(0)) wallet.apply(tx, { type:'WIN', amount: payout, refType:'upgrader', refId: round.id, ... })`.
   8. **Лояльность только для `REAL`:** `vip.addWager(tx, userId, usdEquivalent)`,
      `rakeback.accrue(tx, userId, currency, stake, Math.max(0, 1 - rtp))`,
      `referrals.onRoundSettled(tx, userId, currency, mode, stake, payout)`.
      Затем всегда `bonuses.onWager(tx, userId, currency, mode, stake, cur.usdRate)`.
   9. Вернуть `balRow`, `vipRes`, `bonusRes`, `seed`, `round`, `bet`, значения исхода.
7. **После коммита (никогда не блокирует ставку):** `user` (username/accountId),
   собрать `feed`; **только для `REAL`** — `realtime.liveBet(feed)` и
   `leaderboards.record({..., coeff: multiplier, usd: payout*usdRate })`;
   всегда `stats.recordRound({ userId, bets:1, stake })`; при `vipRes.leveledUp` —
   `notifications.notify(...)`; при `bonusRes` — `bonuses.notifyWagerEvents(...)`.
8. **Return в UI:**
```ts
return {
  roundId, chance,
  multiplier,               // валовый множитель, применённый сервером
  win, angleBp,             // точка остановки стрелки (0..9999) для анимации
  status, currency, mode,
  stake: stake.toFixed(),
  payout: payout.toFixed(),
  net: payout.minus(stake).toFixed(),
  balance: balRow?.amount.toFixed(),
  provablyFair: { serverSeedHash: seed.serverSeedHash, clientSeed: seed.clientSeed, nonce: seed.nonce },
};
```

**`history(userId, limit=30)`** и **`liveFeed()`** / `recentFromDb()` —
копипаст из plinko (real-money only, newest first). В `history` мапь
`sel.chance`, `bet.multiplier`, `slot→angleBp` при желании.

**`onModuleInit()`** — как в plinko: без-опасный top-up буфера тикера.

### 3.4 `upgrader.controller.ts`

```ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsNumber, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { UPGRADER_MAX_CHANCE, UPGRADER_MIN_CHANCE } from './upgrader.engine';
import { UpgraderService } from './upgrader.service';

class UpgraderPlayDto {
  @IsNumber() stake: number;
  @IsIn(['DEMO', 'REAL']) mode: 'DEMO' | 'REAL';
  // canonical = доля 0.0001..0.99
  @IsNumber() @Min(UPGRADER_MIN_CHANCE) @Max(UPGRADER_MAX_CHANCE) chance: number;
  currency: string;
}

@Controller('games/upgrader')
export class UpgraderController {
  constructor(private upgrader: UpgraderService) {}

  @Public() @Get()
  info(@Query('chance') chance?: string) {
    return this.upgrader.info(chance ? +chance : undefined);
  }

  @Public() @Get('live')
  live() { return this.upgrader.liveFeed(); }

  @Post('play')
  play(@CurrentUser('id') userId: string, @Body() dto: UpgraderPlayDto) {
    return this.upgrader.play(userId, dto as any);
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.upgrader.history(userId, limit ? +limit : 30);
  }
}
```
> Валидацию `currency` (`@IsString()`) добавь как в plinko-DTO.

### 3.5 Подключение
`games.module.ts`: импортируй `UpgraderController`/`UpgraderService`, добавь их
в `controllers`, `providers`, `exports` (рядом с plinko).

### 3.6 Provably-fair verifier (опционально)
Публичный `verify` (`provably-fair.service.ts`) уже возвращает `float`. Для
Upgrader победа проверяется как `float < chance`, так что отдельное поле не
обязательно. Если хочешь — добавь в ответ `verify` вычисляемый `upgraderAngleBp`.

---

## 4. Seed — регистрация игры

В `apps/api/prisma/seed.ts`, в массив `games`, добавь запись (рядом с plinko).
**Именно `provider: 'KuKuMBA Originals'` + `status: 'LIVE'` + `route` делают так,
что игра автоматически получит регулятор RTP в админке (§7).**

```ts
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
    'Апгрейдер: задай шанс выигрыша от 0.01% до 99% — множитель считается сам (×RTP/шанс). ' +
    'Стрелка крутится по колесу и замирает в случайной точке: попала в подсвеченный сектор — ' +
    'забираешь ставку × множитель, мимо — ставка сгорает. Есть быстрая игра. ' +
    'Полностью честно (provably-fair, тот же сид-чейн, что у рулетки), RTP настраивается.',
  descriptionEn:
    'Upgrader: pick a win chance from 0.01% to 99% — the multiplier follows (×RTP/chance). ' +
    'The needle spins around the wheel and stops at a random point: land in the lit sector to ' +
    'take stake × multiplier, miss and the stake burns. Quick-play supported. ' +
    'Fully fair (provably-fair, same seed chain as the roulette), configurable RTP.',
},
```
Запусти `pnpm db:seed` после правок.

---

## 5. Frontend — задачи и скелеты

### 5.1 `pages/Upgrader.tsx` (клон HUD из `pages/Plinko.tsx`)

Переиспользуй как есть: `GameLayout` (`aside` = панель управления),
`GameInfoModal` (правила/честность/ротация сида), `useUI` (`mode, currency,
sound, toggleSound, quick, toggleQuick`), `useBalances`, `useCurrencies`,
`betLimits`/`clampStake`, `debitLocalBalance`, `toast`, `api`/`apiError`.

**ОБЯЗАТЕЛЬНО:** ключ запроса info — `['upgrader-info', chance]`. Панель RTP в
админке инвалидирует `['<gameKey>-info'] = ['upgrader-info']`, а TanStack Query
матчит по префиксу — так множитель/RTP обновляются в игре вживую при правке RTP.

```tsx
const { data: info } = useQuery({
  queryKey: ['upgrader-info', chance],
  queryFn: async () => (await api.get(`/games/upgrader?chance=${chance}`)).data,
});
```

Панель управления (`aside`):
- поле **суммы ставки** с кнопками `½` / `2×` / `max` (копия plinko);
- **два связанных поля** (§2): «Шанс, %» (0.01–99) и «Множитель, ×». `onChange`
  одного пересчитывает второе через актуальный `info.rtp`; канон — `chance`
  (доля). Клампы: шанс `[0.01%, 99%]`, множитель — производный;
- (по желанию) быстрый пресет-слайдер шанса;
- кнопка **Играть** (`crash-action btn-crash-primary`), подпись — сумма+валюта;
- блок «последние результаты» (чипы `×N` с цветом по множителю, как plinko `recent`).

Поток игры (копия plinko `drop`, замени эндпоинт/аргументы):
```tsx
const spin = async () => {
  wheelRef.current?.resumeAudio();
  if (!authed) return toast.error(t('upgrader.needLogin'));
  if (busy || outOfRange) return;
  setBusy(true);
  try {
    const { data } = await api.post('/games/upgrader/play', { stake, currency, mode, chance });
    debitLocalBalance(qc, currency, mode, stake);       // мгновенный оптимистичный дебит
    wheelRef.current?.spinTo(data.angleBp, data.win, data.multiplier); // анимируем ИМЕННО серверный угол
    // истинный баланс раскрываем на приземлении стрелки (в onLand)
  } catch (e) { toast.error(apiError(e)); }
  setBusy(false);
};

const onLand = () => {
  qc.invalidateQueries({ queryKey: ['balances'] });
  qc.invalidateQueries({ queryKey: ['my-bonuses'] });
  qc.invalidateQueries({ queryKey: ['pf-seed'] });
};
```
Кнопки-оверлеи на сцене: звук (`Volume2/VolumeX`), инфо/честность (`Shield`),
быстрая игра (`Zap`, `aria-pressed={quick}`) — точная копия plinko-сцены.

### 5.2 `components/upgrader/UpgraderWheel.tsx` (SVG, эталон — `RouletteWheel.tsx`)

Рендер — **SVG + CSS-transition на `transform: rotate(...)`**, как в
`RouletteWheel` (проще довести до «казино»-красоты, чем canvas; quick-play =
0 мс snap). Компонент управляется императивно через `ref` (метод `spinTo`), либо
через пропсы `spinId/result` — выбери стиль plinko (императивный `engineRef`).

Визуальные требования (см. референс-скрин: тёмный фон, круговая шкала с рисками,
градиентная дуга, крупный центр):
- **Внешняя тик-шкала** по кругу (насечки), метки `0% / 50% / 100%` — как на скрине.
- **Дуга win-зоны** от нулевой точки отсчёта на угол `chance * 360°`. Градиент по
  риску: малый шанс → тёплый/красный край (жирный ×), большой шанс → зелёный
  (мелкий ×). Используй токены темы: `mint → sun → #FFB25C → roul-red`.
  Рисуй дугой `stroke` по окружности (`stroke-dasharray`) либо `path`-сектором
  (см. `segPath`/`polar` в `RouletteWheel`).
- **Стрелка-указатель** от центра к ободу: яркая, со свечением
  (`drop-shadow`/`shadow-[0_0_16px...]`), вращается вокруг центра.
- **Центр**: крупный readout — текущий `множитель ×N.NN` (holo-градиент, класс
  `holo-text`) и под ним `шанс NN.NN%`. На результате центр перекрашивается:
  победа — `mint/holo`, проигрыш — `roul-red`.

Логика спина (зеркало `RouletteWheel` useEffect):
```ts
// финальный угол стрелки = angleBp/10000 * 360, плюс N полных оборотов «для драмы»
const theta = (angleBp / 10000) * 360;
const current = rotRef.current;
const TURNS = fast ? 2 : 6;
const next = current + 360 * TURNS + (((theta - (current % 360)) % 360) + 360) % 360;
rotRef.current = next;
setRot(next);
const dur = fast ? 260 : 3200;            // быстрая игра — доля секунды
setLanded(false);
sfxSpin(dur);                              // звук крутящейся стрелки на всю длительность
// по transitionend (или fallback-таймеру) → setLanded(true) → onLand() → sfx.win()/lose()
```
CSS: `style={{ transform: rotate(${rot}deg), transition: transform ${dur}ms cubic-bezier(0.16,1,0.3,1) }}`.
При `fast`/`quick` длительность ≈ 200–300 мс (стрелка «щёлкает» почти мгновенно).
Пробрасывай методы `resumeAudio()`, `setSound()`, `setFast()` — как plinko-движок.

> **Инвариант честности:** дуга рисуется на `[0, chance)` от той же нулевой точки,
> от которой отсчитывается `theta`. Тогда «стрелка в дуге» ⇔ `data.win` — картинка
> и серверный расчёт совпадают всегда. Не двигай дугу и стрелку в разных системах
> отсчёта.

### 5.3 Карточка в лобби и иконка тикера
- `components/upgrader/UpgraderCardArt.tsx` — арт для карточки каталога
  (мини-колесо со стрелкой и градиентной дугой); аналог `PlinkoCardArt`.
- `components/upgrader/UpgraderGlyph.tsx` — компактный глиф для тикера/лидербордов
  (аналог `PlinkoGlyph`), либо возьми lucide-иконку (напр. `Gauge`/`LocateFixed`).
- В `components/GameCard.tsx`:
  - добавь в map `GAME`: `upgrader: { icon: UpgraderGlyph, grad: 'from-sun/30 to-roul-red/30' }`;
  - в `GameArt`: `if (game.key === 'upgrader') return <UpgraderCardArt />;`.

### 5.4 Маршрут
В `apps/web/src/App.tsx`: импорт `Upgrader` и
`<Route path="/upgrader" element={<Upgrader />} />` (рядом с `/plinko`).

---

## 6. Звук (Web Audio, `apps/web/src/lib/sound.ts`)

Ассетов нет — только синтез. Уже есть `sfx.spin(durationMs)` (замедляющиеся тики
+ финальный «тук») — **подходит под крутящуюся стрелку**, используй его.
Дополнительно (по желанию — «свист» быстрого спина) добавь эффект:

```ts
/** Свист крутящейся стрелки: быстрый частотный «вжух» + плотные тики. */
arrowSpin(durationMs: number) {
  if (!enabled) return;
  const c = audio(); if (!c) return;
  const dur = durationMs / 1000;
  // восходящий свист
  blip(c, { freq: 180, dur, type: 'sawtooth', gain: 0.05, slideTo: 520 });
  // тики, сгущающиеся к старту и редеющие к финишу (ease-out)
  const N = Math.max(18, Math.round(dur * 40));
  for (let k = 1; k <= N; k++) {
    const x = k / N;
    const at = dur * (1 - Math.pow(1 - x, 3));
    blip(c, { freq: k % 2 ? 620 : 500, dur: 0.018, type: 'triangle', gain: 0.08, at });
  }
  blip(c, { freq: 240, dur: 0.12, type: 'triangle', gain: 0.15, at: dur }); // финальный «тук»
}
```
На результате: `sfx.win()` (восходящее арпеджио) на победе, `sfx.lose()`
(глухой нисходящий блип) на проигрыше. Всё звук уважает `useUI.sound`
(`setSoundEnabled`), контекст разблокируется по первому жесту (`resumeAudio`).

---

## 7. Админ-панель и RTP — **ничего кодить не нужно**

RTP-панель `apps/web/src/pages/admin/tabs/SettingsTab.tsx` полностью
data-driven: она показывает регулятор для **каждой** игры, у которой
`status === 'LIVE' && route && /kukumba/i.test(provider)`. Поскольку Upgrader
заводится как `KuKuMBA Originals` / `LIVE` / `route:'/upgrader'`, он **появится в
панели RTP автоматически**, рядом с рулеткой/crash/ponyjack/plinko. Движок читает
`game.rtp` на момент ставки, так что правка применяется без передеплоя. CRUD игры
(вкл/выкл, RTP, статус, описания) уже покрыт вкладкой `GamesTab`.

Проверь только, что фронт-ключ `['upgrader-info', ...]` (см. §5.1) — иначе
живой рефреш RTP в открытой игре не сработает (панель шлёт invalidate
`['upgrader-info']`).

Никаких прав/permission — игровые эндпоинты `play/history` под обычным
`JwtAuthGuard`, `info/live` — `@Public()`.

---

## 8. i18n (`apps/web/src/i18n.ts`)

Добавь блок `upgrader: { ... }` в **обе** секции — `ru` (рядом со строкой 302,
где `plinko:`) и `en` (рядом со строкой 846). Минимальный набор ключей:

```
title, stake, chance, multiplier, play, needLogin,
recent, recentEmpty, sceneIdle ('Крутани стрелку, чтобы начать' / 'Spin the needle to start'),
win ('Победа'/'Win'), lose ('Мимо'/'Miss'),
chanceHint, multiplierHint
```
Переиспользуй общие ключи `roulette.*` там, где plinko их берёт (`limits`,
`maxBtn`, `soundOn/soundOff`, `info`, `quickPlay`, `rotated`).

---

## 9. Тесты и проверки

- `pnpm test` (vitest в `apps/api`) — движок Upgrader должен пройти (§3.2): плоский
  RTP на всех шансах, инверсия множителя, граница win, клампы.
- Ручной прогон (`pnpm dev`, вход `admin@kukumba.local / admin12345`):
  1. Ставка на DEMO — стрелка крутится, звук идёт, баланс дебетуется мгновенно,
     истинный баланс — на приземлении.
  2. `quick` on — стрелка долетает за ~0.2–0.3 с.
  3. Победа при большом шансе (напр. 90%), проигрыш при 1% — статусы/цвета/выплата верны.
  4. В админке измени RTP Upgrader → в открытой игре множитель для того же шанса
     пересчитался.
  5. `POST /api/provably-fair/verify` с `serverSeed/clientSeed/nonce` из ответа
     раунда → `float < chance` совпадает с `win`.
- Проверь отсутствие горизонтального оверфлоу на мобиле (крутящийся SVG клипится
  в круглом контейнере — как в `RouletteWheel`, см. `overflow-hidden rounded-full`).

---

## 10. Критерии приёмки (чек-лист)

- [ ] 4 файла бэка + подключение в `games.module.ts`; сид-запись; `pnpm db:seed`.
- [ ] `play` идёт в **одной** транзакции; деньги — только через `wallet.apply`;
      никаких `number` для сумм.
- [ ] Исход честный: `win = float < chance`; дуга и стрелка в одной системе
      отсчёта; `outcome = angleBp` сохранён.
- [ ] RTP снапшотится в `Bet.selection`; правка RTP не меняет сыгранные раунды.
- [ ] Лояльность (VIP/rakeback/referrals) — только REAL; `bonuses.onWager` — всегда;
      тикер/лидерборды — только REAL; `stats.recordRound` — всегда.
- [ ] Два связанных поля (шанс ↔ множитель), канон `chance`, клампы `0.01%…99%`.
- [ ] Быстрая игра ~0.2–0.3 с; звук крутящейся стрелки + win/lose; уважает `sound`.
- [ ] Игра появилась в каталоге (`GameCard`/`GameArt`) и получила регулятор RTP в
      админке **без правок кода админки**.
- [ ] `queryKey === ['upgrader-info', ...]` (живой рефреш RTP).
- [ ] Юнит-тесты движка зелёные; ручной прогон пройден; нет гориз. оверфлоу.

---

## 11. Что НЕ делаем (границы)

- Не создаём новых таблиц/провайдеров/сущностей — переиспользуем `GameRound`/`Bet`.
- Не трогаем код админки/RBAC — RTP-панель подхватит игру сама.
- Не вводим свою криптографию — только `floatFromSeeds`/`pf.consume`.
- Не считаем деньги во фронте — сервер единственный источник истины; фронт лишь
  анимирует ровно то, что вернул сервер (`angleBp`, `win`, `multiplier`, `payout`).
- Не добавляем мульти-ставки/автоигру в MVP (можно потом) — один спин на нажатие.
```
