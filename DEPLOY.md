# 🚀 Деплой KuKuMBA на VPS (Docker, Ubuntu/Debian, домен kukumba.space)

Полностью контейнеризованный продакшн: **Postgres + Redis + API + nginx + certbot (TLS)**.
Старый сайт на хостовом nginx аккуратно отключаем (с бэкапом), порты 80/443 займёт nginx из Docker.

> ⚠️ Перед запуском с реальными деньгами нужна лицензия на азартные игры, реальный KYC/AML и
> платёжный провайдер. По умолчанию платежи в режиме **sandbox** (реальные средства не двигаются),
> сайт работает на демо/виртуальной валюте. 18+.

Все команды — по SSH под `root` или через `sudo`.

---

## 0. DNS
В панели домена создайте A-записи на IP вашего VPS:
```
kukumba.space      A   <IP_сервера>
www.kukumba.space  A   <IP_сервера>
```
Проверьте: `dig +short kukumba.space` → ваш IP. (Дайте записям распространиться, 5–30 мин.)

## 1. Docker (если ещё нет)
```bash
curl -fsSL https://get.docker.com | sh
docker compose version   # должно показать v2.x
```

## 2. Убрать старый сайт и освободить порты 80/443
```bash
# бэкап старого nginx и контента
sudo tar czf ~/nginx-backup-$(date +%F).tgz /etc/nginx /var/www 2>/dev/null || true

# остановить и отключить хостовый nginx (его заменит nginx из Docker)
sudo systemctl disable --now nginx 2>/dev/null || true
# если стоит apache — тоже:
sudo systemctl disable --now apache2 2>/dev/null || true

# убедиться, что порты свободны (пусто = ок)
sudo ss -ltnp '( sport = :80 or sport = :443 )'
```
> Старый сайт после этого офлайн. Его файлы сохранены в `~/nginx-backup-*.tgz` и `/var/www`.

## 3. Firewall
```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw --force enable
```

## 4. (Только для VPS с 2 ГБ RAM) swap — чтобы сборка не падала
```bash
# если /swapfile уже есть и активен (swapon --show не пуст) — пропустите этот шаг
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 5. Забрать код
```bash
cd /opt
sudo git clone https://github.com/kukumba-hehe/KuKuMBA_Casino.git
cd KuKuMBA_Casino
```

## 6. Настроить секреты
```bash
cp .env.production.example .env.production

# ВАЖНО: симлинк, чтобы docker compose сам подхватывал переменные
# (иначе ошибка "required variable POSTGRES_PASSWORD is missing").
ln -sf .env.production .env

# сгенерировать секреты:
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
nano .env.production
```
Обязательно поменяйте: `POSTGRES_PASSWORD` (**и тот же пароль** в `DATABASE_URL`),
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_PASSWORD`, `CERTBOT_EMAIL`.
На первый запуск оставьте `SEED_ON_START=true`.

> После шага с симлинком все команды `docker compose -f docker-compose.prod.yml …`
> работают без флага `--env-file`.

## 7. Получить TLS-сертификат
```bash
chmod +x deploy/*.sh
sudo ./deploy/init-letsencrypt.sh
```
Скрипт поднимет временный nginx, пройдёт ACME-проверку и выпустит сертификат Let's Encrypt
для `kukumba.space` и `www.kukumba.space`.
(Если что-то отлаживаете — поставьте `CERTBOT_STAGING=1` в `.env.production`, чтобы не упереться в лимиты LE.)

## 8. Запустить весь стек
```bash
sudo docker compose -f docker-compose.prod.yml up -d --build
sudo docker compose -f docker-compose.prod.yml ps
```
Открывайте **https://kukumba.space** 🦄

## 9. После первого запуска
1. Зайдите в админку под `ADMIN_EMAIL` / `ADMIN_PASSWORD`, **смените пароль**.
2. В `.env.production` поставьте `SEED_ON_START=false` и переразверните:
   ```bash
   sudo docker compose -f docker-compose.prod.yml up -d
   ```

---

## Обновление сайта в будущем
```bash
cd /opt/KuKuMBA_Casino && sudo ./deploy/deploy.sh
```
(схема БД синхронизируется автоматически при старте API-контейнера).

## Логи и обслуживание
```bash
# логи
sudo docker compose -f docker-compose.prod.yml logs -f api
sudo docker compose -f docker-compose.prod.yml logs -f web

# бэкап БД
sudo docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U kukumba kukumba | gzip > ~/kukumba-db-$(date +%F).sql.gz

# рестарт / стоп
sudo docker compose -f docker-compose.prod.yml restart
sudo docker compose -f docker-compose.prod.yml down
```
Сертификат продлевается автоматически (сервис `certbot` + nginx перечитывает каждые 6 ч).

> Если симлинк `.env` не делали — добавляйте `--env-file .env.production` к каждой команде
> compose, например: `sudo docker compose --env-file .env.production -f docker-compose.prod.yml ps`.

## Если что-то не так
- **`required variable POSTGRES_PASSWORD is missing`** — compose не видит переменные. Сделайте
  симлинк `ln -sf .env.production .env` (шаг 6) или добавьте `--env-file .env.production` к команде.
- **502 Bad Gateway** — API ещё стартует или упал: `... logs -f api`. Часто ждёт БД (до 60 с на первом запуске).
- **Сертификат не выпускается** — проверьте, что DNS уже указывает на сервер и порт 80 открыт/свободен.
- **Порты заняты** — `sudo ss -ltnp '( sport = :80 or sport = :443 )'`, остановите занявший процесс.
- **Мало памяти при сборке** — добавьте swap (шаг 4).
