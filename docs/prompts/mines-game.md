# Промпт: игра «KuKuMBA Mines» (Мины)

> Скопируй всё, что ниже линии, в новую сессию агента, запущенную в корне этого
> репозитория.

---

Ты работаешь в монорепо **KuKuMBA Casino** (pnpm workspaces): `apps/api` — NestJS +
Prisma + PostgreSQL, `apps/web` — React + Vite + Tailwind + TanStack Query + Zustand.
Твоя задача — добавить новую provably-fair мини-игру **«KuKuMBA Mines»** («Мины»),
полностью повторив архитектурные паттерны уже существующих игр. Ничего не изобретай
заново: каждая подсистема (деньги, честность, лояльность, звук, дизайн, админка,
i18n) в проекте уже есть — твоя работа состоит в аккуратном зеркалировании.

## 0. Сначала прочитай референсы

Перед тем как писать код, изучи эти файлы — они и есть спецификация паттернов:

**Бэкенд:**
- `apps/api/src/modules/games/ponyjack/ponyjack.engine.ts` и `ponyjack.service.ts` —
  **главный референс**. Ponyjack — единственная многоходовая игра (deal → actions →
  settle), и Mines устроена так же: раунд открывается со статусом `PENDING`,
  игрок шлёт действия, деньги рассчитываются один раз в `applySettlement`,
  брошенные раунды дорешивает свипер. Скопируй эту структуру метод в метод.
- `apps/api/src/modules/games/upgrader/upgrader.service.ts` — самый свежий и
  чистый пример «одноходовой» игры: валидация ставки, чек-лист DEMO/REAL,
  loyalty-эффекты, live-фид, — бери оттуда формулировки и порядок проверок.
- `apps/api/src/modules/games/upgrader/upgrader.engine.spec.ts` и
  `ponyjack.engine.spec.ts` — стиль юнит-тестов (vitest).
- `apps/api/src/modules/provably-fair/provably-fair.crypto.ts` — `floatFromSeeds`
  с параметром `cursor` (Ponyjack тянет карту №i через cursor=i — мины тянутся так же).
- `apps/api/src/common/utils/money.ts` (`D`, `roundTo`), `bet-limits.ts`
  (`tableMaxStake`), `games.ts` (`isOriginalGame`).
- `apps/api/prisma/seed.ts` — блок `games` (регистрация каталога).

**Фронтенд:**
- `apps/web/src/pages/Upgrader.tsx` — эталон страницы игры: HUD в `aside`,
  сцена в карточке, кнопки звука/инфо/турбо, работа с балансом
  (`debitLocalBalance` + инвалидация на приземлении), лимиты ставки.
- `apps/web/src/pages/Ponyjack.tsx` — как страница переподключается к активному
  раунду через `GET /active` после перезагрузки.
- `apps/web/src/components/GameLayout.tsx`, `GameInfoModal.tsx`, `GameCard.tsx`.
- `apps/web/src/lib/sound.ts` — синтезированные эффекты (Web Audio, без бинарных
  ассетов), `lib/bets.ts`, `lib/balances.ts`, `store/ui.ts` (тумблеры
  `sound`/`quick`).
- `apps/web/src/i18n.ts` — блоки `upgrader` в **обоих** словарях (ru и en).
- `apps/web/tailwind.config.js` и `index.css` — дизайн-токены.

Посмотри также коммит `3444c06` (`git show 3444c06 --stat`) — это полный чек-лист
файлов, которые трогает добавление одной игры.

## 1. Правила игры

Классические «Мины» (как у Stake/CSGO-сайтов), одиночная игра против дома:

- Поле **5×5 = 25 клеток**. Перед стартом игрок выбирает **количество мин
  `m ∈ [2..24]`** и ставку.
- Ставка списывается при старте раунда. Мины прячутся по полю (provably fair,
  см. §3), игрок их не видит.
- Игрок открывает клетки по одной. Открыл безопасную — текущий множитель растёт;
  открыл мину («бум») — раунд проигран, ставка сгорает, поле раскрывается.
- В любой момент **после хотя бы одной открытой клетки** игрок может нажать
  «Забрать» и получить `ставка × текущий множитель`.
- Открыл все `25 − m` безопасных клеток — автокэшаут по максимальному множителю.
- Один активный раунд на игрока (как `PONYJACK_ROUND_ACTIVE`).

## 2. Математика (в стиле дома: только payout несёт edge)

Во всех играх казино действует один закон: **исход равномерен и честен, edge живёт
только в множителе**: `multiplier = RTP / probability` (рулетка, crash, upgrader —
см. комментарии в их engine). Mines — не исключение:

- Вероятность выжить после `k` безопасных открытий при `m` минах:
  `P(k) = C(25−m, k) / C(25, k)`.
- Гросс-множитель кэшаута после `k` открытий:
  **`mult(m, k) = RTP × C(25, k) / C(25−m, k)`**.
  Матожидание кэшаута на любой глубине = `RTP × ставка` — плоский edge, ровно как
  у остальных игр.
- Считай биномиальное отношение **инкрементально**, без факториалов:
  `mult(m, k) = RTP × ∏_{i=0..k−1} (25−i)/(25−m−i)` — иначе переполнение.
- `k = 0` даёт `mult = RTP < 1` — поэтому кэшаут с нулём открытий запрещён
  (ошибка `MINES_NOTHING_TO_CASHOUT`).
- Введи кап `MINES_MAX_MULT = 1_000_000` (зеркало `CRASH_MAX_MULT`): в глубоких
  углах (например m=12, полная зачистка) честный множитель превышает 5 млн —
  движок клампит, UI показывает ужеклампленное значение.
- **RTP админ-настраиваемый**: читается как `game.rtp ?? settings.rtp()` в момент
  старта раунда и **снапшотится в `Bet.selection`** — ретюн RTP админом никогда не
  меняет уже открытый раунд (ровно как в ponyjack/upgrader). Мусорный RTP —
  фолбэк на 0.99 (см. `multiplierFor` в upgrader.engine).

## 3. Provably fair и философия «ничего секретного в БД»

Раскладка мин — детерминированная функция закоммиченного сида, **никогда не
хранится** и пересчитывается заново на каждом чтении/действии (философия
ponyjack: «nothing secret sits in a queryable column»):

- Раскладка: **Fisher–Yates**-перестановка массива `[0..24]`, где свап №i берёт
  индекс из `floatFromSeeds(serverSeed, clientSeed, nonce, cursor=i)`; первые `m`
  элементов перестановки — мины. Один `pf.consume(tx, userId)` на раунд (та же
  цепочка сидов и nonce, что у рулетки/ponyjack).
- Состояние раунда = чистая функция `replay(seeds, minesCount, picks)`; в
  `Bet.selection` хранится только `{ rtp, minesCount, picks: number[], lastActionAt }`.
- Клиент может присылать **только номер клетки**, никогда состояние. Сервер
  валидирует легальность (клетка 0..24, не открыта, раунд `PENDING`).
- Пока раунд `PENDING`, позиции мин **не попадают ни в один ответ API**; полная
  раскладка (`minePositions`, `boomTile`) отдаётся только в settled-view.
- `serverSeedHash`/`clientSeed`/`nonce` — в каждом view, как везде.

## 4. Бэкенд: `apps/api/src/modules/games/mines/`

Prisma-схему **не менять** — `Bet.selection` это Json, `betType` строка (`'MINES'`).

### `mines.engine.ts` — чистая математика, без БД
- Константы: `MINES_GRID = 25`, `MINES_MIN = 2`, `MINES_MAX = 24`,
  `MINES_MAX_MULT = 1_000_000`.
- `normalizeMines(unknown): number` — целое 2..24, иначе `BadRequestException('MINES_BAD_COUNT')`.
- `mineLayout(seeds, m): Set<number>` — Fisher–Yates из §3.
- `multiplierFor(m, k, rtp): number` — формула из §2 с капом.
- `replay(seeds, m, picks): MinesState` — прогоняет picks по раскладке; бросает
  `MINES_BAD_TILE` / `MINES_TILE_ALREADY_OPEN` / `MINES_ROUND_OVER` на нелегальном
  логе. `MinesState = { phase: 'PLAYING' | 'SETTLED', picks, safeCount, boomTile: number | null, win: boolean, mines: number[] /* пустой пока PLAYING — наружу не отдаётся */ }`.
  Полная зачистка (`safeCount === 25−m`) переводит в `SETTLED / win`.
- Развёрнутый doc-комментарий в шапке — в стиле upgrader.engine (математика,
  закон плоского edge, почему RTP снапшотится).

### `mines.engine.spec.ts` — vitest, зеркало ponyjack/upgrader спеков
- Детерминизм раскладки (одинаковые сиды → одинаковые мины), ровно `m` мин,
  все в 0..24.
- Равномерность: по многим нонсам каждая клетка минируется с частотой ≈ m/25.
- Формула множителя: ручные значения (например m=3,k=1 → RTP×25/22), инкремент
  против прямого биномиального расчёта, кап.
- Плоский EV: для нескольких (m, k) эмпирически `P(выжить k) × mult(m,k) ≈ RTP`.
- Нелегальные picks бросают; полная зачистка → SETTLED win; бум → SETTLED lose.

### `mines.service.ts` — зеркало `PonyjackService`
- Конструктор с тем же набором сервисов (wallet, pf, settings, vip, rakeback,
  referrals, realtime, notifications, leaderboards, stats, bonuses).
- `MINES_ACTION_TIMEOUT_MS = 120_000`.
- `info(mines?)` — rtp, houseEdge, minBet/maxBet, enabled, descriptionRu/En,
  `minMines`, `maxMines`, `gridSize: 25`, `actionTimeoutMs` и **лестница
  множителей** `multipliers: number[]` (mult при k=1..25−m) для выбранного `m` —
  UI рисует её и «следующий множитель» из неё (аналог payout-таблицы plinko/ponyjack).
- `start(userId, { stake, currency, mode, mines })`:
  чек-лист валидаций **дословно как в upgrader.play / ponyjack.deal**
  (GAME_DISABLED, CURRENCY_DISABLED, DEMO↔DEMO, REAL↔не-DEMO,
  `DEMO_ONLY_ORIGINALS` через `isOriginalGame`, BAD_STAKE, STAKE_BELOW_MIN/ABOVE_MAX,
  `tableMaxStake`); один активный раунд (свипни просроченный, иначе
  `MINES_ROUND_ACTIVE`); RTP-снапшот; в транзакции: `wallet.apply(BET)` →
  `pf.consume` → `gameRound.create` (outcome 0, outcomeColor `'pending'`) →
  `bet.create` (status `PENDING`, selection `{ rtp, minesCount, picks: [], lastActionAt }`).
- `pick(userId, roundId, tile)`: row-lock (`lockPending` c `SELECT … FOR UPDATE`,
  как в ponyjack), `replay` до и после, запись нового selection; бум или полная
  зачистка → `applySettlement` в той же транзакции.
- `cashout(userId, roundId)`: требует `safeCount ≥ 1`; settle по текущему
  множителю. Кэшаут/пик, прилетевший в уже решённый раунд, возвращает
  `finalView` (идемпотентность, как ponyjack `act`).
- `applySettlement(tx, betId, state)` — **единственное место, где двигаются
  деньги при закрытии**: `payout = roundTo(stake × mult, cur.decimals)` (или 0),
  `wallet.apply(WIN)` при payout>0, статусы WON/LOST (+PUSH для рефанда свипера),
  `gameRound.update` (`outcome = safeCount`, `outcomeColor` green/red/push,
  totalPayout), loyalty только REAL (`vip.addWager`, `rakeback.accrue` с
  `Math.max(0, 1−rtp)`, `referrals.onRoundSettled`), затем `bonuses.onWager`
  (после выплаты — порядок как у рулетки).
- `afterSettle(...)` — пост-коммит: `stats.recordRound` всегда;
  `realtime.liveBet` + `leaderboards.record` только REAL; VIP-уведомление о
  левел-апе; `bonuses.notifyWagerEvents`. Скопируй из ponyjack.
- `state(userId, roundId)`, `activeRound(userId)`, `history(userId, limit)`
  (только settled, REAL, ≤100), `liveFeed()` — зеркала ponyjack.
- Свипер `@Interval(15_000)`: раунд без действий дольше таймаута —
  **автокэшаут по текущему множителю при `safeCount ≥ 1`**, при нуле открытий —
  **возврат ставки как PUSH** (multiplier 1, payout = stake). Деньги игрока
  никогда не застревают. Идемпотентно под row-lock.
- **View (`viewOf`)** — всё, что рендерит UI. PENDING: `{ roundId, phase: 'PLAYING',
  status, minesCount, picks, safeCount, currentMultiplier, nextMultiplier,
  cashoutAmount, stake, currency, mode, multipliers (лестница), autoCashoutAt,
  serverNow, balance?, provablyFair }` — **без** позиций мин. SETTLED: плюс
  `status WON|LOST|PUSH, minePositions, boomTile, multiplier, payout`.

### `mines.controller.ts` — зеркало ponyjack.controller
- `@Public() GET /games/mines` (`?mines=` для лестницы), `@Public() GET /games/mines/live`,
  `POST /games/mines/start`, `POST /games/mines/pick` (`{ roundId, tile }`),
  `POST /games/mines/cashout` (`{ roundId }`), `GET /games/mines/active`,
  `GET /games/mines/round/:id`, `GET /games/mines/history`.
- DTO на class-validator: `@IsInt() @Min(2) @Max(24) mines`,
  `@IsInt() @Min(0) @Max(24) tile`, `@IsIn(['DEMO','REAL']) mode`, и т.д.

### Регистрация
- `games.module.ts`: добавить `MinesController` / `MinesService` в
  controllers/providers/exports.
- `prisma/seed.ts`, блок KuKuMBA mini-games:
  ```
  key: 'mines', name: 'KuKuMBA Mines', type: 'mines', category: 'MINIGAME',
  provider: 'KuKuMBA Originals', status: 'LIVE', route: '/mines',
  rtp: 0.99, minBet: 0.01, maxBet: 100000, sortOrder: 5,
  ```
  Описания (Ru/En) — в стиле соседних: правила в двух-трёх предложениях +
  «Provably-fair (тот же сид-чейн, что у рулетки), RTP 99%».
  **Не пиши** в описаниях «RTP настраивается» — это операторская деталь, её
  специально вычистили из игрового текста (см. коммит `e423565`).

### Админка — менять НИЧЕГО не нужно
RTP-панель в `pages/admin/tabs/SettingsTab.tsx` — data-driven: она рендерит ручку
для каждой игры с `status === 'LIVE' && route && isOriginal(provider)`. Поскольку
mines регистрируется как LIVE-ориджинал с маршрутом, ручка RTP появится сама;
полный CRUD доступен в GamesTab. Сервис обязан читать `game.rtp` при старте
раунда — тогда ретюн из админки действует на новые раунды мгновенно.

## 5. Фронтенд: `apps/web`

### Страница `src/pages/Mines.tsx`
`GameLayout` с `aside`, по образцу Upgrader.tsx:

- **Aside, карточка управления:** ставка (инпут c паттерном Upgrader: очистка
  ввода, `clampStake`/`betLimits`, тултип лимитов, кнопки ½ / 2× / Max,
  суффикс валюты), выбор числа мин 2..24 (компактный степпер + ряд пресетов,
  например 2 / 3 / 5 / 10 / 24), блок «Потенциальный выигрыш»: текущий множитель,
  следующий множитель, сумма кэшаута. Главная кнопка (`crash-action
  btn-crash-primary`): вне раунда — «Играть» со ставкой, в раунде — «Забрать
  N CUR» (disabled, пока `safeCount === 0`). Во время раунда ставка и число мин
  заблокированы. Ниже — карточка «Последние раунды» (чипы ×mult, зелёные/красные,
  как `recent` в Upgrader).
- **Сцена, карточка:** сетка `grid grid-cols-5` из 25 кнопок-плиток,
  `aspect-square rounded-2xl border border-white/10 bg-white/[0.03]`,
  hover-подсветка только на кликабельных. Открытая безопасная — кристалл/подкова
  (инлайн-SVG) в mint/lav с мягким свечением (`shadow-glow-mint`); мина —
  roul-red вспышка. По settle раскрывается всё поле: неоткрытые плитки
  приглушённые, бумнувшая — с красной рамкой. Анимации — CSS scale/фейд
  (~150–250 мс), **без bouncy/spring** (правило дизайн-системы в шапке
  tailwind.config.js). Турбо (`quick` из `useUI`) убирает задержки раскрытия.
- **Угловые кнопки сцены** — точно как в Upgrader: звук (Volume2/VolumeX +
  `setSoundEnabled`), инфо (Shield → `GameInfoModal` с rtp/описанием/лимитами/
  сидом и ротацией), турбо (Zap + `toggleQuick`).
- **Деньги и данные:** `useQuery(['mines-info', mines])`; на `start` —
  `debitLocalBalance`; по settle — инвалидация `['balances']`, `['my-bonuses']`,
  `['pf-seed']`. На маунте — `GET /games/mines/active` и восстановление доски
  (паттерн Ponyjack.tsx). Каждый pick — POST, доска рендерит **только ответ
  сервера**, никакой клиентской логики исхода.
- Не залогинен — тост + ссылка на `/login`, как в Upgrader.

### Точки подключения
- `App.tsx`: `<Route path="/mines" element={<Mines />} />` (+lazy-импорт как у
  соседей).
- `components/mines/MinesGlyph.tsx` (моно-иконка для тикера/карточки) и
  `MinesCardArt.tsx` (SVG-арт тайла лобби: мини-поле 5×5 с парой кристаллов и
  миной, ночной градиент) — по образцу `upgrader/UpgraderGlyph.tsx` и
  `UpgraderCardArt.tsx`.
- `GameCard.tsx`: ветка в `GameArt` (`game.key === 'mines'`) + запись в `GAME`
  реестре (`mines: { icon: MinesGlyph, grad: 'from-mint/30 to-roul-red/30' }`).
- `i18n.ts`: блок `mines` в **обоих** словарях (ru ~строка 316, en ~875):
  title, stake, minesLabel, play, cashout, potential, nextMult, current,
  needLogin, recent, recentEmpty, sceneIdle, win, lose, boom и т.п.

### Звук — `src/lib/sound.ts`
Всё синтезируется через Web Audio (никаких бинарных файлов). Добавь:
- `sfx.reveal(step: number)` — короткий стеклянный «поп» на безопасное открытие;
  частота растёт с каждым шагом (`step` = номер открытия), эскалация напряжения
  как у Stake. Реализация — 1–2 `blip` с freq ≈ `440 × 2^(step/12)` c мягким капом.
- `sfx.boom()` — низкий взрыв: короткий saw/noise-берст со слайдом вниз
  (~120→40 Гц, 0.3–0.4 с) поверх глухого удара.
- Кэшаут — существующий `sfx.win()`; клик по плитке до ответа — можно
  `sfx.chip()`. Все эффекты — no-op при выключенном звуке (проверка `enabled`
  уже в паттерне).

## 6. Чего НЕ делать
- Не менять Prisma-схему, общий wallet/pf/bonuses-код, чужие игры и админку.
- Не хранить позиции мин ни в какой колонке и не отдавать их в PENDING-ответах.
- Не доверять клиенту: множитель, исход и выплату считает только сервер.
- Не добавлять бинарные ассеты (звук — синтез, арт — инлайн-SVG).
- Не писать «RTP настраивается» в player-facing описаниях.
- Не использовать bouncy/spring-анимации.

## 7. Приёмка
1. `pnpm --filter @kukumba/api test` — все тесты зелёные (включая новые
   `mines.engine.spec.ts`); `pnpm build` — api и web собираются без ошибок.
2. Ручной прогон (dev-стенд, `pnpm dev`): старт → серия pick → кэшаут; старт →
   бум; полная зачистка на 24 минах (1 клетка) → автокэшаут; перезагрузка
   страницы посреди раунда → доска восстановилась; повторный старт при активном
   раунде → `MINES_ROUND_ACTIVE`; кэшаут с 0 открытий отклонён; таймаут →
   свипер дорешал (≥1 pick — кэшаут, 0 — рефанд PUSH).
3. DEMO-режим работает (DEMO-валюта, ориджинал), REAL-ставки попадают в
   live-тикер, лидерборды, VIP/rakeback/referrals/бонус-вейджер.
4. Смена RTP в админке (Настройки → панель RTP) меняет множители **новых**
   раундов и лестницу в UI; открытый раунд доигрывается по снапшоту.
5. Карточка в лобби с артом и бейджем Original; RU и EN тексты; звук и турбо
   работают; на мобильном нет горизонтального скролла страницы.
6. Один коммит в стиле репозитория: `feat(mines): add KuKuMBA Mines game
   (5x5 grid, 2-24 mines, cashout ladder)` с телом-описанием, как у `3444c06`.
