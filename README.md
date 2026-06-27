# KuKuMBA — модульная казино-платформа

Онлайн-казино на NestJS + React. Сегодня одна полностью рабочая игра — **provably-fair
рулетка**, плюс **каталог игр** с карточками будущих тайтлов от провайдеров (статус «скоро»).
Вокруг — полный набор функций: мультивалютный кошелёк (демо + реал, фиат + крипта),
депозиты/выводы, бонусы, промокоды, рефералка, VIP, кешбэк, розыгрыши, чат, уведомления, KYC,
поддержка, ответственная игра и **админ-панель с ролями и правами (RBAC)**.

Интерфейс — RU + EN, тёмная тема, glassmorphism.

> ⚠️ **О реальных деньгах.** Архитектура поддерживает реальные деньги (фиат и крипта), но по
> умолчанию подключён **sandbox-провайдер платежей** — реальные средства не двигаются. Запуск с
> реальными деньгами требует настоящего платёжного провайдера, лицензии на азартные игры и
> соблюдения KYC/AML в вашей юрисдикции. Это ответственность владельца. 18+.

---

## Возможности

- **Игры и лобби** — каталог (`/games`) с фильтрами по категории/провайдеру и поиском, данные
  берутся из БД (`Game`). Встроенные игры имеют внутренний маршрут, тайтлы провайдеров заводятся
  со статусом `COMING_SOON`. Карточка показывает RTP и провайдера.
- **Рулетка** — европейское колесо (37 ячеек, одно зеро), provably-fair (HMAC-SHA256).
  RTP **настраивается** (по умолчанию реальный европейский **97.3%**, house edge 2.7%); множитель
  каждой ставки выводится из RTP: `payout = RTP / probability`. RTP указан в описании игры.
- **Мультивалютный кошелёк** — режимы **DEMO** и **REAL**; валюты: `DEMO, USD, EUR, RUB, BTC,
  ETH, USDT, TON, TRX, SOL, BNB, XMR`. **USDT мультисетевой** (ERC20/TRC20/TON/SOL/BSC).
  Все движения — через append-only **ledger** с блокировкой строк.
- **Депозиты/выводы** — модульные адаптеры (`PaymentProvider`); по умолчанию `MockProvider` (sandbox).
- **Бонусы**, **промокоды**, **рефералка** (комиссия с каждой ставки), **VIP** (XP → уровни,
  кешбэк/рейкбэк), **кешбэк** от чистых потерь.
- **Розыгрыши** — от админа/партнёров; призовой фонд и кол-во победителей, provably-fair выбор.
- **Чат**, **уведомления**, онлайн-счётчик и **лента живых ставок** (Socket.IO).
- **KYC**, **поддержка** (тикеты + FAQ), **ответственная игра** (лимиты, самоисключение).
- **Админ-панель с RBAC** — роли `USER / PARTNER / SUPPORT / MODERATOR / ADMIN` и **редактируемая
  матрица прав** (роль × право). ADMIN имеет полный доступ; для остальных ролей каждое действие
  включается/выключается из UI. Разделы: дашборд, пользователи, роли/права, игры (CRUD), депозиты,
  выводы, промокоды, бонусы, розыгрыши, валюты, рассылки, тикеты, модерация чата, транзакции,
  контент-страницы, настройки (включая RTP), аудит. Каждое изменяющее действие пишется в `AuditLog`.

## Технологии

| Слой      | Стек                                                               |
|-----------|--------------------------------------------------------------------|
| Backend   | NestJS (модульный) · Prisma · PostgreSQL · Socket.IO · JWT (Passport) |
| Frontend  | React · Vite · TypeScript · Tailwind CSS · TanStack Query · Zustand |
| Realtime  | Socket.IO (онлайн, живые ставки, чат, пуш уведомлений)             |
| Монорепо  | pnpm workspaces                                                    |

Каждая фича — отдельный NestJS-модуль (`apps/api/src/modules/*`). Доступ к админ-API
обеспечивают глобальные guard'ы: `JwtAuthGuard` → `RolesGuard` → `PermissionsGuard`
(`@RequirePermission(...)`).

## Структура

```
.
├─ apps/
│  ├─ api/                         # NestJS backend
│  │  ├─ prisma/schema.prisma      # вся схема БД
│  │  ├─ prisma/seed.ts            # сиды (валюты, игры, VIP, админ, права ролей, контент, …)
│  │  └─ src/modules/*             # auth, users, games/roulette, wallet, payments, raffles,
│  │                               #   permissions, admin, chat, notifications, vip, …
│  └─ web/                         # React + Vite frontend
├─ deploy/                         # Docker/nginx/certbot для продакшна
├─ docker-compose.prod.yml
├─ .env.example / .env.production.example
└─ package.json                    # pnpm workspace + скрипты
```

## Запуск (локально)

### 1. Требования
Node ≥ 20, pnpm, PostgreSQL 14+, Redis (опционально — для масштабирования realtime).

### 2. Окружение
```bash
cp .env.example .env
# отредактируйте DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET и т.д.
```

### 3. Установка + БД одной командой
```bash
pnpm setup     # install + prisma generate + db push + seed
```
Или по шагам:
```bash
pnpm install
pnpm prisma:generate     # сгенерировать Prisma Client
pnpm db:push             # применить схему к БД
pnpm db:seed             # наполнить БД
```

### 4. Старт
```bash
pnpm dev                 # api (:3000) и web (:5173) параллельно
# или по отдельности:
pnpm dev:api
pnpm dev:web
```
Откройте **http://localhost:5173**. API — на **http://localhost:3000/api**.

### Что создаёт сид
Валюты, игры (рулетка `LIVE` + несколько `COMING_SOON` тайтлов-заглушек), VIP-уровни,
аккаунт **админа**, дефолтные права ролей (SUPPORT/MODERATOR), контент-страницы, промокоды и
демо-розыгрыш.

- **Админ:** `admin@kukumba.local` / `admin12345` (переопределяется `ADMIN_EMAIL` / `ADMIN_PASSWORD`).
- **Промокоды:** `KUKUMBA`, `WELCOME50`, `VIPBOOST`.
- Тестовые игроки не создаются — новый пользователь получает демо-баланс и уникальный **Account ID** при регистрации.

### Сети с ограниченным доступом (Prisma engines)
`pnpm install` не запускает postinstall Prisma (его CDN может быть недоступен за прокси). Если
загрузчик движков не работает, скачайте бинарники и укажите их через переменные окружения:
```bash
export PRISMA_QUERY_ENGINE_LIBRARY=/path/libquery_engine-<platform>.so.node
export PRISMA_SCHEMA_ENGINE_BINARY=/path/schema-engine-<platform>
# при необходимости: export NODE_EXTRA_CA_CERTS=/path/ca-bundle.crt
```

## Provably-fair и RTP

1. Сервер генерирует `serverSeed` и публикует `SHA256(serverSeed)` **до** ставки.
2. У игрока есть `clientSeed` (можно менять) и `nonce` (растёт с каждым спином).
3. Исход: `floor( f(HMAC_SHA256(serverSeed, "clientSeed:nonce")) × 37 )`.
4. При смене сида старый `serverSeed` раскрывается — историю можно перепроверить
   (`POST /api/provably-fair/verify`).
5. RTP задаётся выплатами: `multiplier(bet) = RTP / probability(bet)`, поэтому матожидание любой
   ставки равно `ставка × RTP`. Значение настраивается: глобально в `game.rtp` и/или у конкретной
   игры (поле `Game.rtp`), без передеплоя.

## Роли и права (RBAC)

- Роли: `USER`, `PARTNER`, `SUPPORT`, `MODERATOR`, `ADMIN`. Реестр прав — в коде
  (`apps/api/src/modules/permissions/permissions.registry.ts`), а кто что может — в таблице
  `RolePermission` (редактируется во вкладке **Roles** админки).
- **ADMIN** проходит любую проверку. Остальным ролям права выдаются точечно; по умолчанию финансы,
  смена ролей и настройки — только ADMIN.
- Любое действие гейтится `@RequirePermission('<право>')`; админ-SPA скрывает недоступные вкладки и
  кнопки по `GET /api/admin/me`.

## Платежи: sandbox → реальный провайдер

Реализуйте интерфейс `PaymentProvider` (`apps/api/src/modules/payments/providers/`) для нужного
крипто-шлюза/фиат-PSP и подключите его в `payments.module.ts` вместо `MockProvider`. Остальная
система не меняется.

## Тесты
```bash
pnpm test     # юнит-тесты: payout-математика рулетки и provably-fair RNG (детерминизм, равномерность)
```

## Ответственная игра
18+. Лимиты депозита/потерь/оборота и самоисключение — в Профиле. Играйте ответственно.
