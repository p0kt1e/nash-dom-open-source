# Архитектура

```text
Telegram Mini App
      |
      v
React + TypeScript + Vite
      |
      v
Cloudflare Worker (API)
      |
      v
Cloudflare D1 (данные)
```

## Где что находится

| Путь | Назначение |
| --- | --- |
| `frontend/` | Интерфейс приложения |
| `worker/src/` | API и проверка Telegram-авторизации |
| `worker/migrations/` | Миграции базы |
| `scripts/` | Скрипты установки |

## Доступ к данным

- Авторизация проверяется на сервере на основе Telegram.
- Разрешённые пользователи задаются через `TELEGRAM_ALLOWED_IDS`.
- У каждой отдельной установки своя D1-база.
- Пользователи одной установки работают с общими данными.

## Для разработчиков

[Исходный код и инструкция](https://github.com/p0kt1e/nash-dom-open-source) · [Задачи](https://github.com/p0kt1e/nash-dom-open-source/issues)
