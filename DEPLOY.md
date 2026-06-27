# Деплой KuKuMBA на VPS (Docker, Ubuntu/Debian)

Полностью контейнеризованный продакшн. Сервисы из `docker-compose.prod.yml`:

| Сервис    | Образ / роль                                                        |
|-----------|---------------------------------------------------------------------|
| `db`      | `postgres:16-alpine` — БД (том `pgdata`)                            |
| `redis`   | `redis:7-alpine` — адаптер Socket.IO / кэш                          |
| `api`     | NestJS API (`/api`), при старте синхронизирует схему и опц. сидит   |
| `web`     | nginx: статика фронтенда + reverse-proxy на `api` + TLS             |
| `certbot` | выпуск и автопродление Let's Encrypt                               |

Пример домена в конфиге — `kukumba.space`. Старый сайт на хостовом nginx отключаем (с бэкапом),
порты 80/443 займёт контейнер `web`.

> ⚠️ Перед запуском с реальными деньгами нужна лицензия на азартные игры, реальный KYC/AML и
> платёжный провайдер. По умолчанию платежи в режиме **sandbox** (`PAYMENT_PROVIDER=mock`,
> реальные средства не двигаются). 18+.

Все команды — по SSH под `root` или через `sudo`. После шага 6 (симлинк `.env`) флаг
`--env-file` нигде не нужен.

---

## Установка с нуля

### 0. DNS
A-записи на IP вашего VPS:
```
kukumba.space      A   <IP_сервера>
www.kukumba.space  A   <IP_сервера>
```
Проверка: `dig +short kukumba.space` → ваш IP. (Подождите 5–30 мин.)

### 1. Docker
```bash
curl -fsSL https://get.docker.com | sh
docker compose version   # v2.x
```

### 2. Убрать старый сайт и освободить порты 80/443
```bash
sudo tar czf ~/nginx-backup-$(date +%F).tgz /etc/nginx /var/www 2>/dev/null || true
sudo systemctl disable --now nginx 2>/dev/null || true
sudo systemctl disable --now apache2 2>/dev/null || true
sudo ss -ltnp '( sport = :80 or sport = :443 )'   # пусто = ок
```
> Старый сайт уйдёт офлайн; его файлы — в `~/nginx-backup-*.tgz` и `/var/www`.

### 3. Firewall
```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw --force enable
```

### 4. (VPS с 2 ГБ RAM) swap — чтобы сборка не падала
```bash
swapon --show   # если уже есть строка с /swapfile — пропустите шаг
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 5. Забрать код
```bash
cd /opt
sudo git clone https://github.com/kukumba-hehe/KuKuMBA_Casino.git
cd KuKuMBA_Casino
```

### 6. Секреты (важно)
```bash
cp .env.production.example .env.production
ln -sf .env.production .env          # чтобы compose сам подхватывал переменные
nano .env.production
```
Заполните:
- **`POSTGRES_PASSWORD`** — пароль БД. **Только hex/буквы-цифры, без `@ : / ? # %`** (иначе ломается URL).
  Сгенерируйте: `openssl rand -hex 24`. **`DATABASE_URL` задавать не нужно** — он строится автоматически из этого пароля.
- **`JWT_ACCESS_SECRET`**, **`JWT_REFRESH_SECRET`** — каждый `openssl rand -hex 32`.
- **`ADMIN_EMAIL`**, **`ADMIN_PASSWORD`**, **`CERTBOT_EMAIL`**.
- На первый запуск оставьте **`SEED_ON_START=true`**.

### 7. TLS-сертификат
```bash
chmod +x deploy/*.sh
sudo ./deploy/init-letsencrypt.sh
```
(Отлаживаете? Поставьте `CERTBOT_STAGING=1` в `.env.production`, чтобы не упереться в лимиты LE.)

### 8. Запуск
```bash
sudo docker compose -f docker-compose.prod.yml up -d --build
sudo docker compose -f docker-compose.prod.yml logs -f api   # дождитесь "Starting KuKuMBA API"
```
Открывайте **https://kukumba.space**

При старте контейнер `api` делает `prisma db push` (синхронизация схемы), а при
`SEED_ON_START=true` — сид: валюты, игры (рулетка + тайтлы «скоро»), VIP, **аккаунт админа**,
дефолтные права ролей (SUPPORT/MODERATOR), контент-страницы, промокоды, демо-розыгрыш.

### 9. После первого запуска
1. Войдите в админку (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) и **смените пароль** (Профиль → Безопасность).
2. В `.env.production` поставьте `SEED_ON_START=false` и: `sudo docker compose -f docker-compose.prod.yml up -d`.

---

## Обновление сайта
```bash
cd /opt/KuKuMBA_Casino
git pull
sudo docker compose -f docker-compose.prod.yml up -d --build
# или быстро, если менялся только фронт:
# sudo docker compose -f docker-compose.prod.yml up -d --build web
```
Схема БД синхронизируется автоматически при старте API-контейнера. Можно и одной командой:
`sudo ./deploy/deploy.sh`.

## Логи и обслуживание
```bash
sudo docker compose -f docker-compose.prod.yml ps
sudo docker compose -f docker-compose.prod.yml logs -f api
sudo docker compose -f docker-compose.prod.yml restart
# бэкап БД:
sudo docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U kukumba kukumba | gzip > ~/kukumba-db-$(date +%F).sql.gz
```
Сертификат продлевается автоматически (сервис `certbot` + nginx перечитывает каждые 6 ч).

---

## Полная переустановка / снос
Снести контейнеры, тома (БД) и образы только нашего проекта:
```bash
cd /opt/KuKuMBA_Casino
sudo docker compose -f docker-compose.prod.yml down -v --rmi all --remove-orphans
```
(не сработало — по имени: `sudo docker ps -a --filter name=kukumba -q | xargs -r sudo docker rm -f`)

Сохранить уже выпущенный TLS-сертификат, чтобы не упираться в лимит Let's Encrypt:
```bash
sudo cp -r /opt/KuKuMBA_Casino/deploy/certbot ~/kukumba-certbot-backup
```
Удалить папку и поставить заново:
```bash
cd / && sudo rm -rf /opt/KuKuMBA_Casino
# затем повторить «Установку с нуля» (шаги 5–8).
# (если сохраняли сертификат: после clone верните его и пропустите init-letsencrypt:
#   sudo cp -r ~/kukumba-certbot-backup/* /opt/KuKuMBA_Casino/deploy/certbot/ )
```

---

## Если что-то не так
- **`P1000: Authentication failed ... credentials for kukumba are not valid`** — том БД был создан
  с другим паролем. `DATABASE_URL` строится из `POSTGRES_PASSWORD` автоматически, поэтому достаточно
  пересоздать том под текущий пароль (на первом деплое данных не жалко):
  ```bash
  sudo docker compose -f docker-compose.prod.yml down -v
  sudo docker compose -f docker-compose.prod.yml up -d --build
  ```
- **`required variable POSTGRES_PASSWORD is missing`** — нет симлинка `.env`: `ln -sf .env.production .env`
  (или добавляйте `--env-file .env.production` к команде).
- **502 Bad Gateway** — API ещё стартует/упал: `... logs -f api` (на первом запуске ждёт БД до ~60 с).
- **Сертификат не выпускается** — DNS ещё не указывает на сервер, или порт 80 занят/закрыт.
- **Порты заняты** — `sudo ss -ltnp '( sport = :80 or sport = :443 )'`, остановите процесс.
- **Мало памяти при сборке** — добавьте swap (шаг 4).
