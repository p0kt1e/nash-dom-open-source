# Наш дом 🏡

Органайзер для домашних дел в Telegram

Здесь можно вести списки покупок, следить за запасами продуктов и бытовых вещей, планировать дела и учитывать расходы

Приложением можно пользоваться одному или вместе с другими людьми

Исходный код открыт. Можно установить приложение у себя, создать собственного Telegram-бота и подключить отдельную базу данных

## Что есть в приложении

- Задачи и списки покупок
- Учёт домашних запасов
- История расходования запасов
- Аналитика и прогноз окончания запасов
- Расходы и бюджет
- Меню на неделю
- Питомцы и расписание ухода за ними

Некоторые функции ещё дорабатываются

## Как всё устроено

Интерфейс написан на React, TypeScript и Vite

Серверная часть работает на Cloudflare Workers, данные хранятся в Cloudflare D1

Приложение открывается через Telegram Mini App

В проекте есть несколько основных папок:

- `frontend/` - интерфейс
- `worker/src/` - API и проверка авторизации
- `worker/migrations/` - таблицы базы данных
- `scripts/` - скрипты для установки

## Установка

Понадобятся Node.js, Git, аккаунт Cloudflare и Telegram

### 1. Скачиваем проект

```bash
git clone https://github.com/p0kt1e/nash-dom-open-source.git
cd nash-dom-open-source
```

### 2. Создаём Telegram-бота

Откройте [@BotFather](https://t.me/BotFather) и создайте бота через `/newbot`

BotFather выдаст токен. Сохраните его, он понадобится для подключения приложения

### 3. Создаём базу данных

Авторизуйтесь в Cloudflare:

```bash
npx wrangler login
```

Создайте базу D1:

```bash
npx wrangler d1 create nash-dom-db
```

После создания Cloudflare покажет `database_id`

Скопируйте шаблон настроек:

```bash
cp worker/wrangler.example.jsonc worker/wrangler.jsonc
```

Откройте `worker/wrangler.jsonc` и замените `YOUR_D1_DATABASE_ID` на ID своей базы

Примените миграции:

```bash
./scripts/setup-db.sh
```

Скрипт создаст необходимые таблицы в указанной базе

### 4. Настраиваем доступ

Для локальной разработки скопируйте пример переменных:

```bash
cp worker/.dev.vars.example worker/.dev.vars
```

В файле нужно указать:

- `TELEGRAM_BOT_TOKEN` - токен от BotFather
- `TELEGRAM_ALLOWED_IDS` - Telegram ID пользователей, которым разрешён доступ
- `FRONTEND_ORIGIN` - адрес интерфейса

Для опубликованного Worker настройте переменные:

```bash
cd worker
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_ALLOWED_IDS
npx wrangler secret put FRONTEND_ORIGIN
```

Каждая команда попросит ввести значение. Токен и другие настройки не нужно записывать в код

После настройки опубликуйте Worker:

```bash
npx wrangler deploy
```

Cloudflare покажет адрес Worker. Сохраните его для настройки интерфейса

Вернитесь в корень проекта:

```bash
cd ..
```

Токены, личные настройки и резервные копии базы не должны попадать в Git

### 5. Запускаем интерфейс

```bash
cp frontend/.env.example frontend/.env.local
```

В `frontend/.env.local` укажите адрес своего Worker:

```env
VITE_API_URL=https://your-worker.your-subdomain.workers.dev
```

Установите зависимости и запустите приложение:

```bash
cd frontend
npm ci
npm run dev
```

Для работы с Telegram Mini App понадобится опубликованный HTTPS-адрес интерфейса

### 6. Публикуем интерфейс

Соберите приложение:

```bash
cd frontend
npm ci
npm run build
```

В Cloudflare откройте **Workers & Pages** и создайте проект Pages

Подключите свой GitHub-репозиторий и укажите:

- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment variable:** `VITE_API_URL` - адрес опубликованного Worker без `/api`

После публикации Cloudflare выдаст HTTPS-адрес сайта

### 7. Подключаем Telegram Mini App

Откройте @BotFather и выберите созданного бота

Через `/setmenubutton` настройте кнопку меню, указав HTTPS-адрес интерфейса из Cloudflare Pages

После этого приложение можно открывать прямо из Telegram

### 8. Проверяем доступ

Откройте приложение через Telegram под аккаунтом, ID которого добавлен в `TELEGRAM_ALLOWED_IDS`

Если API возвращает ошибку авторизации, проверьте настройки Worker и убедитесь, что приложение открыто именно через Telegram

## Доступ к данным

Приложение проверяет авторизацию Telegram на сервере

Доступ к API получают только пользователи, чьи Telegram ID указаны в настройках Worker

У каждой установленной копии своя база данных. Пользователи одной копии работают с общими данными, но не получают доступ к данным других установок

## Разработка

Проект пока в разработке

Основные функции уже работают, но часть разделов ещё тестируется. Дальше планирую доработать интерфейс, упростить установку и добавить новые возможности

