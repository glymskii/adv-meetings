# ADV Meetings

Мобильное приложение для ADV Kazakhstan: запись встречи → транскрибация (ElevenLabs Scribe v2, диаризация) → контакт-репорт по шаблону из «ADV Contact Report Router 2026» (Claude). Аналог Plaud AI Note.

## Структура

```
apps/server/      Node 22 + TypeScript: API (Hono) и воркер пайплайна (pg-boss, ffmpeg)
apps/ios/         iOS-приложение (SwiftUI, iOS 17+) — первый этап
packages/shared/  templates.json — 12 шаблонов контакт-репортов ADV (курируемые), templates.raw.json — дамп Excel
infra/            docker-compose (Postgres + MinIO) для локальной разработки
docs/             PLAN.md — план проекта; source/ — исходные Excel заказчика
scripts/          extract-templates.ts — извлечение сырых шаблонов из Excel
```

## Локальный запуск сервера

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d        # Postgres :5439, MinIO :9000/:9001
cp apps/server/.env.example apps/server/.env             # заполнить ключи (или FAKE_PROVIDERS=true)
pnpm --filter @adv/server dev:bucket                     # bucket audio-temp в MinIO
pnpm db:migrate && pnpm db:seed                          # схема + 12 шаблонов + 8 агентств
pnpm dev                                                 # API на :3000
pnpm worker                                              # воркер пайплайна
```

Проверка: `curl localhost:3000/health`, OpenAPI — `localhost:3000/api/openapi.json`.

Без ключей `RESEND_API_KEY` одноразовые коды входа печатаются в лог API. `FAKE_PROVIDERS=true` подменяет ElevenLabs/Anthropic заглушками — пайплайн (склейка ffmpeg → «транскрипт» → удаление аудио → «отчёт» → экспорт) проходит целиком.

## Пайплайн

1. Приложение создаёт встречу (`POST /api/meetings`, выбранный шаблон + контекст), пишет аудио сегментами по 5 минут и заливает их по presigned URL (`POST /api/meetings/:id/segments` → PUT → `…/complete`).
2. `POST /api/meetings/:id/finalize` ставит job в очередь `meeting.process`.
3. Воркер: склейка сегментов (ffmpeg, AAC 16 кГц mono) → ElevenLabs Scribe v2 (`source_url`, diarize, keyterms) → **удаление аудио из bucket** → Claude (`claude-opus-5`, structured output по структуре шаблона) → отчёт (JSON + markdown) → push.
4. Прогресс: `GET /api/meetings/:id/events` (SSE). Экспорт: `GET /api/meetings/:id/export?format=docx|pdf|md|txt`.

Cron в воркере: `audio.sweep` (удаляет аудио старше `AUDIO_RETENTION_HOURS`), `meetings.stuck` (перепоставляет зависшие).

## Деплой (Railway)

Проект `adv-meetings`: Postgres, bucket `audio-temp` (ams), сервисы `api` и `worker` из одного образа `apps/server/Dockerfile` (контекст — корень репозитория). `api` при старте применяет миграции и сид шаблонов.

```bash
railway up --service api --detach -m "…"
railway up --service worker --detach -m "…"
```

Переменные окружения — см. `apps/server/.env.example`. Ключи `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `RESEND_API_KEY` задаются в Railway.

## Тесты

```bash
pnpm --filter @adv/server test        # vitest: сегментация STT, рендер отчётов, промпт
pnpm --filter @adv/server typecheck
```
