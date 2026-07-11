# Sexcoin — план-промпт реализации игры

> Этот документ — самодостаточное техническое задание (промпт) для агента-исполнителя или разработчика.
> Он описывает добавление новой оригинальной игры **Sexcoin** (coinflip 18+ с серией и кэшаутом)
> в казино-платформу KuKuMBA. Все пути файлов, имена классов, эндпоинты и паттерны ниже проверены
> по текущему коду репозитория — следуй им, не изобретая новых конвенций.

---

## 1. Концепция игры

**Sexcoin** — подбрасывание монеты в режиме «серии» (референс — coinflip на play2x):

- Игрок делает ставку и угадывает сторону монеты. Стороны: **пенис** (аналог «орла»)
  и **вагина** (аналог «решки»). Изображения на гранях — детализированная векторная
  эротическая графика, нарисованная кодом (SVG), в общем стиле казино.
- Монета подбрасывается: угадал — множитель растёт, можно **продолжить серию** или
  **забрать выигрыш** в любой момент. Не угадал — ставка сгорает.
- Полностью честная (provably-fair, общий сид-чейн платформы), RTP настраивается из админки.
- Атмосфера: фоновая эротическая музыка (синтезируется Web Audio API), звук вращения монеты,
  3D-анимация вращения при броске.
- Возрастной гейт не нужен (казино само по себе 18+).

### Математика (конвенция платформы: edge только в выплате)

- Монета честная: `P(пенис) = P(вагина) = 0.5`. Исход НЕ подкручивается — RTP влияет
  только на множитель, как во всех играх платформы (`multiplier = RTP / probability`).
- Множитель после `k` угаданных флипов: **`mult(k) = RTP × 2^k`** (округление до 2 знаков
  для отображения). EV кэшаута на любой глубине = `0.5^k × RTP × 2^k = RTP` — плоский edge,
  как у crash и mines.
- При дефолтном **RTP 0.97**: ×1.94 → ×3.88 → ×7.76 → … (первый шаг совпадает с референсом ×1.94).
- Кап серии: **`MAX_STREAK = 20`** (при RTP 0.97 это ≈ ×1 017 000 — в духе капа ×1 000 000
  у crash). На капе — принудительный автозабор.
- Rakeback/house edge: `houseEdge = 1 − rtp`, как везде.

---

## 2. Контекст репозитория и обязательные конвенции

- Монорепо pnpm: `apps/api` (NestJS + Prisma + PostgreSQL + Socket.IO), `apps/web`
  (React 18 + Vite + Tailwind + TanStack Query + Zustand + react-i18next).
- **Шаблон для копирования — игра Mines** (`apps/api/src/modules/games/mines/`,
  `apps/web/src/pages/Mines.tsx`): у неё структурно та же механика
  «продолжай пока не проиграл, забери в любой момент, множитель-лестница».
- **Правило «no binary assets»**: в репо нет ни одного файла картинки/звука. Вся графика —
  inline SVG React-компоненты, весь звук — синтез Web Audio API. Sexcoin не должен стать
  исключением: никаких .png/.mp3.
- Деньги — только `Prisma.Decimal(38,18)` через хелперы `apps/api/src/common/utils/money.ts`
  (`D`, `roundTo`, `toNumber`). Все движения — через append-only ledger `WalletService.apply`.
- Дизайн: тёмная тема, glassmorphism (`.glass`, `.card`), пастельная палитра Tailwind
  (`night`, `lav`, `bubble`, `mint`, `sky`, `sun`), шрифт заголовков Unbounded.
  Без «прыгающих» spring-анимаций.

---

## 3. Бэкенд

### 3.1. Новый модуль `apps/api/src/modules/games/sexcoin/`

Создать 4 файла по образу и подобию `mines/`:

#### `sexcoin.engine.ts` — чистая математика (без БД и Nest)

```ts
export type CoinSide = 'penis' | 'vagina';
export const MAX_STREAK = 20;

// Сторона i-го флипа серии из provably-fair флоата (cursor = индекс флипа)
export function flipResult(float: number): CoinSide;        // float < 0.5 ? 'penis' : 'vagina'

// Множитель после k угаданных флипов: RTP * 2^k, округлённый до 2 знаков
export function multiplierFor(k: number, rtp: number): number;

// Вся лестница [mult(1)..mult(MAX_STREAK)] для UI
export function multiplierLadder(rtp: number): number[];

// Реплей серии: по сидам и логу догадок пересчитать результаты и статус
// (паттерн mines.engine.ts -> replay: доске не доверяем, храним только лог)
export function replay(seeds: SeedTuple, guesses: CoinSide[]): {
  results: CoinSide[]; streak: number; busted: boolean;
};
```

#### `sexcoin.controller.ts`

`@Controller('games/sexcoin')`, эндпоинты зеркалят `mines.controller.ts`:

| Метод | Путь | Тело | Назначение |
|---|---|---|---|
| GET | `/api/games/sexcoin` | — | Инфо (name, rtp, limits, descriptions) — `@Public()` |
| GET | `/api/games/sexcoin/live` | — | Лента последних ставок — `@Public()` |
| POST | `/api/games/sexcoin/start` | `{stake, currency, mode}` | Открыть серию (списать ставку) |
| POST | `/api/games/sexcoin/flip` | `{roundId, guess: 'penis'\|'vagina'}` | Флип (аналог `pick` у Mines) |
| POST | `/api/games/sexcoin/cashout` | `{roundId}` | Забрать по текущему множителю |
| GET | `/api/games/sexcoin/active` | — | Восстановить активный раунд после перезагрузки |
| GET | `/api/games/sexcoin/round/:id` | — | Состояние раунда |
| GET | `/api/games/sexcoin/history` | — | История игрока |

DTO — инлайн-классы с `class-validator` в файле контроллера (как `StartDto` у Mines).
`@CurrentUser('id')` для userId; глобальный `JwtAuthGuard` уже стоит.

#### `sexcoin.service.ts`

Класс `SexcoinService`, инжектит те же 12 зависимостей, что `MinesService`:
`PrismaService, WalletService, ProvablyFairService, SettingsService, VipService,
RakebackService, ReferralsService, RealtimeService, NotificationsService,
LeaderboardsService, StatsService, BonusesService`.

Поток (копировать структуру Mines один-в-один):

1. **start** — в одной `prisma.$transaction`:
   - валидация: DEMO-режим ⇔ валюта `DEMO`, только Originals (`isOriginalGame`);
     лимиты `game.minBet/maxBet` + `tableMaxStake` из `apps/api/src/common/utils/bet-limits.ts`;
   - `rtp = game.rtp ?? (await this.settings.rtp())` — и **снапшот в selection**
     (смена RTP админом не должна менять раунд в полёте);
   - списание: `wallet.apply(tx, { type: 'BET', amount: stake.neg(), refType: 'sexcoin', ... })`;
   - `seed = await this.pf.consume(tx, userId)` — **один nonce на всю серию**;
   - `GameRound` с `outcome: 0, outcomeColor: 'pending'` + `Bet` со `status: 'PENDING'`,
     `selection = { rtp, guesses: [], lastActionAt }`.
2. **flip** — залочить PENDING-ставку (`lockPending`: `SELECT ... FOR UPDATE`, проверка статуса),
   добавить guess в лог, пересчитать серию через `replay` — результат каждого флипа берётся из
   `floatFromSeeds(serverSeed, clientSeed, nonce, cursor = flipIndex)` (паттерн Mines, cursor на тайл):
   - не угадал → расчёт LOST внутри транзакции (`applySettlement`);
   - угадал и `streak === MAX_STREAK` → принудительный автозабор WON;
   - иначе → обновить selection, вернуть view с текущим/следующим множителем.
3. **cashout** — требует `streak >= 1`; расчёт WON: `payout = roundTo(stake × mult(streak), cur.decimals)`,
   `wallet.apply(tx, { type: 'WIN', amount: payout, refId: round.id, ... })`.
4. **Единый путь закрытия** `applySettlement(tx, betId, state)` — финализирует Bet + GameRound,
   платит WIN; лояльность **только REAL**: `vip.addWager`, `rakeback.accrue(..., 1 - rtp)`,
   `referrals.onRoundSettled`, затем `bonuses.onWager` (оба режима).
5. **Post-commit, fire-and-forget** (REAL only для фида): `realtime.liveBet(...)`,
   `void leaderboards.record(...)`; для всех: `void stats.recordRound(...)`.
6. **Свипер**: `@Interval(15_000) sweep()` — раунды без действий дольше
   `SEXCOIN_ACTION_TIMEOUT_MS = 120_000`: автозабор при `streak >= 1`, иначе PUSH-рефанд
   (точно как Mines).
7. **viewOf** — публичное представление раунда: только `{ serverSeedHash, clientSeed, nonce }`
   из PF-данных (сырой serverSeed не покидает сервер до ротации сида), лог флипов, streak,
   `currentMultiplier`, `nextMultiplier`, `cashoutAmount`, `multipliers` (лестница).

#### `sexcoin.engine.spec.ts` — vitest (см. §6).

### 3.2. Provably-fair маппер

В `apps/api/src/modules/provably-fair/provably-fair.crypto.ts` добавить рядом с
`rouletteResult`/`crashResult`:

```ts
/** Coinflip: float < 0.5 → 'penis' (орёл), иначе 'vagina' (решка). */
export function sexcoinFlip(serverSeed: string, clientSeed: string, nonce: number, flipIndex: number): CoinSide;
```

Использует существующий `floatFromSeeds(serverSeed, clientSeed, nonce, cursor = flipIndex)`.
Ничего в сервисе `ProvablyFairService` менять не нужно — `consume/rotate/verify` универсальны.

### 3.3. Регистрация модуля

`apps/api/src/modules/games/games.module.ts` — добавить `SexcoinController` в `controllers`,
`SexcoinService` в `providers` и `exports`. **`app.module.ts` не трогать** — все зависимости
глобальные.

### 3.4. Каталог: запись в `apps/api/prisma/seed.ts`

Добавить в массив игр после mines (`sortOrder: 5`):

```ts
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
```

### 3.5. RTP из админки — уже работает, нового кода не нужно

- `PATCH /api/admin/games/sexcoin` → `AdminService.patchGame` (permission `games.manage`)
  принимает `rtp` как долю (`0.97`) или процент (`97`), нормализует через `normalizeRtp`.
- UI: админка → вкладка «Игры» (`apps/web/src/pages/admin/tabs/GamesTab.tsx`).
- Сервис читает `game.rtp` при старте каждого раунда и снапшотит в `Bet.selection` —
  активные серии не затрагиваются, новые идут по новому RTP. Изменение пишется в `AuditLog`.

---

## 4. Фронтенд

### 4.1. Страница `apps/web/src/pages/Sexcoin.tsx` (шаблон — `Mines.tsx`)

- Каркас: `GameLayout` с `aside` (панель ставки 340px).
- Сцена: по центру — компонент `<Coin>` (см. 4.2) на glass-подложке; вокруг —
  чип «серия N» и чип «×M коэфф.» (как на референсе); угловые кнопки:
  звук (`Volume2/VolumeX`, флаг `sound` из `useUI`), info/fairness (щит → `GameInfoModal`),
  турбо (`Zap`, флаг `quick` из `useUI`).
- Панель ставки (паттерн всех игр): stake-инпут с санитайзером, `½ / 2× / Max`,
  лимиты `betLimits(currency, mode)` + `clampStake` из `apps/web/src/lib/bets.ts`,
  код валюты суффиксом в инпуте.
- Состояния действия:
  - **idle** → кнопка «Играть» (`.crash-action .btn-crash-primary`); после старта —
  - **выбор стороны** → две большие кнопки-монеты «Пенис» / «Вагина» (мини-версии граней);
    над ними — **«Забрать {sum}»** (`.crash-action .btn-crash-mint`), активна при streak ≥ 1;
  - **flip in flight** → монета крутится, кнопки заблокированы;
  - **проигрыш/выигрыш** → стингер, тост, возврат в idle.
- Лестница множителей `view.multipliers` горизонтальной лентой (как у Mines), подсветка
  текущего и следующего; чипы «недавние результаты» (сессионные) под сценой.
- Данные: `useQuery(['game','sexcoin'])` → `GET /games/sexcoin`; `useBalances()`;
  `useQuery(['pf-seed'])` + ротация — как у всех игр. При маунте — `GET /games/sexcoin/active`
  для восстановления серии после перезагрузки.
- Оптимистичный баланс: `debitLocalBalance` при старте, `creditLocalBalance` когда анимация
  выигрыша долетела (`apps/web/src/lib/balances.ts`).
- Quick-режим: анимация не играется, результат показывается мгновенно.
- Ошибки — через существующий маппер `apiError` + тосты.

### 4.2. Монета: `apps/web/src/components/sexcoin/Coin.tsx`

3D-вращение чистым CSS (без canvas):

- Контейнер с `perspective`; внутренний диск `transform-style: preserve-3d`, две грани
  (SVG) с `backface-visibility: hidden`, вторая повёрнута `rotateY(180deg)`.
- Бросок: transition `transform` ~2.2–2.6 c, `cubic-bezier(0.16,1,0.3,1)` (замедление как у
  рулетки), целевой угол = N полных оборотов (6–8) + 0° или 180° в зависимости от результата
  с сервера. Завершение — `onTransitionEnd` + таймаут-фолбэк (паттерн `RouletteWheel.tsx`).
- Ребро монеты — псевдо-гурт: тонкий цилиндр из повторяющегося linear-gradient.
- Свечение: мягкий `drop-shadow`/radial-глоу (зелёный при выигрыше, красный при проигрыше,
  нейтральный тёплый в покое — как glow монеты на референсе).
- `size` проп — те же грани используются в кнопках выбора стороны и в карточке лобби.

### 4.3. Грани монеты: `apps/web/src/components/sexcoin/CoinFaces.tsx`

Два SVG-компонента `PenisFace` и `VaginaFace` (viewBox ~ `0 0 200 200`):

- Общее для обеих: внешнее эмбосс-кольцо с насечкой (гурт), металлический
  `radialGradient` с бликом сверху-слева, внутренняя фаска, лёгкая виньетка по краю —
  чтобы монета читалась как объёмный металл.
- **PenisFace** («орёл»): рельефное векторное изображение пениса — многослойные path'ы
  с градиентной заливкой телесных тонов поверх золотой монеты (`sun`-палитра),
  тени/полутона через полупрозрачные слои и `feGaussianBlur`-подсветки для
  псевдореалистичного объёма.
- **VaginaFace** («решка»): рельефное векторное изображение вагины в той же технике,
  монета в розово-лиловой гамме (`bubble`/`lav`-палитра).
- Цель — максимум детализации и «реализма», достижимого вектором: минимум 4–6 слоёв
  формы, свет/тень, никаких плоских «эмодзи»-силуэтов.

### 4.4. Карточка лобби: `apps/web/src/components/sexcoin/SexcoinCardArt.tsx`

Inline SVG `viewBox="0 0 200 150"` (как `CrashCardArt`):

- Тёмный градиентный фон в палитре night + неоновые розово-лиловые радиальные свечения;
- Две монеты (уменьшенные `PenisFace`/`VaginaFace`) в лёгком развороте с бликами,
  между ними искры/частицы; надпись «SEXCOIN» шрифтом Unbounded с holo-переливом;
- Бейджи RTP и «Originals» карточка добавит сама (`GameCard`).

### 4.5. Звук: `apps/web/src/components/sexcoin/synth.ts`

Класс `Synth` по образцу `apps/web/src/components/plinko/engine.ts` и
`class Synth` из `apps/web/src/components/crash/engine.ts`:

- Собственный `AudioContext` + мастер-гейн с лимитером; генерируемый impulse для
  `ConvolverNode` (лёгкая реверберация).
- **Фоновая музыка** (луп, «эротический» буду́ар-лаунж): темп ~72–80 BPM; тёплый суб-бас
  (синус + мягкая пила через lowpass), приглушённые джазовые аккорды (minor7/9) на
  detuned-осцилляторах через lowpass с медленным LFO, breathy-пэды из фильтрованного шума
  (bandpass ~1–2 кГц с медленным свипом), редкая мягкая перкуссия (щётки из шума, боковая
  компрессия баса). Интенсивность слегка растёт с длиной серии (как tiers у crash).
- **SFX**:
  - `flip(durationMs)` — вращение монеты: noise через bandpass со свипом вверх-вниз
    синхронно с анимацией + металлический шиммер (ring-mod двух осцилляторов);
  - `land()` — звон приземления (короткий металлический удар: осцилляторы с быстрым decay);
  - `win()` / `lose()` — стингеры в тон музыке;
  - `cashout()` — «кассовый» глиссандо-аккорд.
- Разблокировка аудио по первому `pointerdown/keydown` (паттерн `CrashScene.tsx`),
  автосуспенд на `visibilitychange/pagehide`, метод `setSound(bool)` привязан к флагу
  `sound` из `useUI` (+ `setSoundEnabled` для общего sfx, если используется).

### 4.6. Интеграции

- **Роут**: в `apps/web/src/App.tsx` — статический импорт `Sexcoin` и
  `<Route path="/sexcoin" element={<Sexcoin />} />` внутри блока `<Layout>`
  (лениво не грузим — в проекте нет lazy-роутов). Путь обязан совпадать с `route` из seed.
- **Карточка**: в `apps/web/src/components/GameCard.tsx` — ветка
  `if (game.key === 'sexcoin') return <SexcoinCardArt />;` в `GameArt` и запись в `GAME`-мапу:
  `sexcoin: { icon: SexcoinGlyph, grad: 'from-bubble/30 to-lav/30' }` (маленький глиф-монетка
  для лайв-ленты; `GameIcon` подхватит её автоматически через `gameMeta`).
- **i18n**: блок `sexcoin: { ... }` в **оба** словаря `ru` и `en` в `apps/web/src/i18n.ts`
  (EN типизирован по RU — компилятор не даст пропустить ключ). Минимум ключей:
  `title, stake, play, penis, vagina, cashout, potential, nextMult, current, series,
  win, lose, recent, needLogin, quickPlay, soundOn, soundOff, info` — по аналогии с `mines.*`.

---

## 5. Чего делать НЕ нужно

- Не менять схему Prisma — модели `Game/GameRound/Bet/Transaction/Balance` покрывают всё.
- Не добавлять новые permissions — RTP/CRUD закрыт существующим `games.manage`.
- Не трогать `app.module.ts`, `ProvablyFairService`, `WalletService`.
- Не добавлять бинарные ассеты (картинки, mp3) и внешние библиотеки (howler, framer-motion…).
- Не строить отдельный Zustand-стор для раунда — локальный state страницы, как у всех игр.

---

## 6. Тесты

`apps/api/src/modules/games/sexcoin/sexcoin.engine.spec.ts` (vitest, конфиг уже есть):

1. `multiplierFor`: `mult(1) = 1.94` при RTP 0.97; `mult(k) = round2(rtp × 2^k)`; монотонность.
2. Плоский EV: для k = 1..20 `0.5^k × (rtp × 2^k) ≈ rtp` (до округления).
3. `flipResult`/`sexcoinFlip`: детерминизм — одинаковые сиды+nonce+cursor дают одинаковую
   сторону; распределение по большому сэмплу флоатов ≈ 50/50.
4. `replay`: лог догадок + сиды → корректные streak/busted; busted останавливает серию.
5. Кап: на `MAX_STREAK` серия закрывается автозабором.

---

## 7. Критерии приёмки (ручная проверка)

1. `pnpm setup` (или `pnpm db:push && pnpm db:seed`) → `pnpm dev` — API и web поднимаются.
2. В лобби `/games` в секции «KuKuMBA Originals» появилась карточка Sexcoin с SVG-артом,
   бейджем RTP 97% и holo-бейджем Originals; клик ведёт на `/sexcoin`.
3. Полный цикл в DEMO: старт → монета крутится со звуком → выбор стороны → серия из
   нескольких флипов → «Забрать» платит ровно `stake × RTP × 2^streak` (по ledger);
   проигрыш сжигает ставку; баланс в шапке меняется синхронно с анимацией.
4. Перезагрузка страницы во время серии → `GET /games/sexcoin/active` восстанавливает раунд.
5. Брошенная серия: через ~2 минуты свипер автозабирает (streak ≥ 1) или возвращает PUSH.
6. Админка → Игры → Sexcoin: смена RTP на 0.90 → новые серии платят ×1.80 за шаг,
   активная серия в полёте — по старому RTP; действие видно в аудит-логе.
7. Fairness: в `GameInfoModal` виден hash/clientSeed/nonce; после ротации сида
   `POST /api/provably-fair/verify` воспроизводит флоаты раундов.
8. Музыка стартует после первого клика по странице, глушится тумблером звука вместе с SFX;
   при переключении вкладки — пауза. Quick-режим отключает анимацию и звук броска.
9. Реальные ставки попадают в живую ленту (`'bet'` по сокету), лидерборды и статистику;
   DEMO — нет.
10. `pnpm -r typecheck` / линт и vitest по engine — зелёные.
