# Установка

Можно поднять собственную копию «Нашего дома» с отдельным Telegram-ботом и собственной базой данных.

## Что понадобится

- Node.js и Git
- Аккаунт Cloudflare
- Telegram-бот, созданный через [@BotFather](https://t.me/BotFather)

## Основные шаги

1. Клонировать [репозиторий](https://github.com/p0kt1e/nash-dom-open-source).
2. Создать Telegram-бота и сохранить токен.
3. Создать базу Cloudflare D1.
4. Настроить `worker/wrangler.jsonc` на основе `worker/wrangler.example.jsonc`.
5. Применить миграции командой `./scripts/setup-db.sh`.
6. Указать секреты Worker: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_IDS`, `FRONTEND_ORIGIN`.
7. Опубликовать Worker.
8. Настроить `VITE_API_URL` в `frontend/.env.local`, собрать интерфейс и опубликовать его в Cloudflare Pages.
9. Подключить HTTPS-адрес к Telegram-боту через `/setmenubutton`.
10. Проверить вход через Telegram.

**Подробные команды и нюансы:** [README](https://github.com/p0kt1e/nash-dom-open-source#установка).

> Токены и личные настройки не нужно коммитить в Git. Для каждой установленной копии предусмотрена отдельная база.
