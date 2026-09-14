# План разработки: приложение записи и саммари встреч для ADV Group (аналог Plaud AI Note)

## Контекст

ADV Kazakhstan (холдинг из 8 агентств: ADV, Havas, UM, McCann, SEED, Pixy, Mushrooms, Bid Media) хочет мобильное приложение:
запись аудио встречи → транскрибация → структурированный контакт-репорт по шаблону, зависящему от типа встречи.

Исходные материалы (локально в docs/source/, в репозиторий не входят):
- `ADV Contact Report Router 2026.xlsx` — маршрутизатор: матрица «с кем встреча» × «цель встречи» → 12 типов, для 10 из них есть листы с полями, промптом и советами; «Шпаргалка» задаёт, кому рассылать отчёт.
- `ADV_KZ_Universal_AI_Projects_2026 (1).xlsx` — приложение закрывает проекты №1 «Контакт-репорт голосом» (критерий: 3-мин диктовка → готовый отчёт за 20 мин без правок) и №8 «Саммари встреч с Action Plan» (критерий: встреча закончилась → саммари с Action Plan через 5 мин). Правило холдинга: репорт команде в течение 24 ч, клиенту — 48 ч.

Пожелание заказчика: транскрибация желательно на устройстве; если это мешает качеству — на сервере с удалением аудио после пайплайна. Предложенный стек AI: Anthropic API + ElevenLabs API.

## Принятые решения (согласованы с заказчиком в этой сессии)

| Вопрос | Решение |
|---|---|
| Мобильные клиенты | **Первый этап — только нативный iOS: Swift/SwiftUI (iOS 17+)**. Android (Kotlin/Compose) — отдельный следующий этап, в этой сессии не делаем |
| Фоновая запись | **Обязательное требование**: запись продолжается при заблокированном экране и в фоне; сегменты и загрузка не зависят от состояния экрана |
| Бэкенд | **Всё на Railway**: Postgres, Node 22 + TypeScript API, воркер пайплайна, Railway Buckets (S3-совместимое хранилище) для временного аудио |
| Транскрибация | **На сервере — ElevenLabs Scribe v2** (диаризация, RU/KK/EN); аудио удаляется сразу после пайплайна. On-device как основной путь отвергнут по результатам исследования (ниже) |
| Саммари | **Anthropic `claude-opus-5`**, structured outputs, prompt caching; `claude-sonnet-5` как дешёвый режим для черновиков |
| Типы встреч | **Три «с кем» как в роутере**: Внутренняя / Клиент / Вендор-партнёр → 12 подтипов; для двух подтипов без листа (Внутр-Продажи, Вендор-Брифинг) промпты пишем по аналогии и помечаем «на валидацию ADV» |
| Вход | **Email magic link + Google (+ Sign in with Apple на iOS — требование App Store при наличии Google)**, allowlist корпоративных доменов 8 агентств; SSO (SAML) — позже без изменения схемы |

## Таксономия встреч (из роутера)

| С кем | Подтип (code) | Цель | Промпт в Excel | Особенности |
|---|---|---|---|---|
| 🔴 Внутренняя | `internal_sales` Внутр-Продажи (стратсессия / roadmap) | Продажи и новый бизнес | **нет** — написать | — |
| 🔴 Внутренняя | `internal_brief` Внутр-Брифинг | Постановка задачи команде | да | два дедлайна (внутр./клиентский) |
| 🔴 Внутренняя | `internal_status` Внутр-Статус | Синхронизация по проекту | да | светофор ✅/⚠️/❌ по направлениям |
| 🔴 Внутренняя | `internal_management` Внутр-Совещание | Совещание руководства | да | поле «уровень конфиденциальности» |
| 🟢 Внутренняя | `hr_meeting` HR-встреча (1:1 / ревью / онбординг / exit) | Команда и HR | да | **строго конфиденциально** |
| 🔵 Клиент | `client_intro` Клиент-Знакомство | First contact / new business | да | дословные цитаты клиента |
| 🔵 Клиент | `client_brief` Клиент-Брифинг | Бриф от клиента | да | блок «Вопросы к клиенту» критичен; «не озвучен, уточнить» |
| 🔵 Клиент | `client_status` Клиент-Статус | Статус по кампании | да | план/факт числами |
| 🔵 Клиент | `client_debrief` Клиент-Дебрифинг | Post-mortem | да | внутренний блок «не для клиента» |
| 🟡 Вендор | `vendor_brief` Вендор-Брифинг | Брифинг вендора | **нет** — написать | — |
| 🟡 Вендор | `vendor_status` Вендор-Статус | Рабочая встреча с подрядчиком | да | коммерческие условия отдельно |
| 🟡 Вендор | `vendor_negotiation` Вендор-Переговоры | Переговоры по условиям | да | позиции сторон, уступки, внутренняя оценка |

Каждый лист → запись в `meeting_templates`: общие поля (дата/время, участники, место/платформа), специфические поля («Специфика встречи»), промпт со структурой разделов (нумерованные + ACTION PLAN `[Имя] | [Задача] | [Дедлайн]`), советы, список рассылки, SLA. Шаблоны версионируются в БД, чтобы ADV правил промпты без релиза приложения.

Как поля из Excel живут в приложении: до записи пользователь заполняет только то, что знает (необязательная форма «контекст встречи»: 2–3 ключевых поля вроде клиента/проекта, число участников, платформа); остальное AI извлекает из транскрипта, не найденное помечает «не озвучено, уточнить».

## Почему транскрибация на сервере, а не на устройстве

| Вариант | Русский | Казахский | Диаризация | Вердикт |
|---|---|---|---|---|
| Apple SpeechTranscriber (iOS 26+) | да, без лимита длительности, 0 МБ в бандле | **нет** | **нет** | только для будущего режима «конфиденциально, RU-only» на iPhone |
| Android on-device SpeechRecognizer | да (beta) | **нет** | нет | диктовочный API, рвёт сессию на паузах — непригоден для часовых встреч |
| WhisperKit large-v3-turbo (iPhone 15 Pro+) | ~10% WER, ~7× realtime, модель 1.6 ГБ | **45–80% WER** | нет | казахский непригоден |
| whisper.cpp на среднем Android | только `base` в реальном времени | — | нет | не тянет нужный размер модели |

Ни одна on-device система не поддерживает переключение RU↔KK↔EN внутри одной записи; on-device диаризация на «телефоне посреди стола» с 5 спикерами заметно хуже серверной. Приватность закрываем иначе: аудио живёт в bucket минуты и удаляется воркером; ElevenLabs и Anthropic не обучаются на API-данных; Anthropic по умолчанию не хранит запросы (ZDR для `claude-opus-5` доступен по запросу на организацию); Zero Retention у ElevenLabs — Enterprise-контракт (отдельный разговор с заказчиком, если нужна юридическая гарантия).

Опция на Фазу 5: режим «Только на устройстве» для HR и конфиденциальных совещаний — iPhone с iOS 26 + Apple SpeechTranscriber (русский, без меток спикеров), в Claude уходит только текст; ограничения честно показываем в UI.

### Сравнение облачных STT (сентябрь 2026)

| Провайдер | Казахский | Русский | Диаризация | $/час | Лимит | Retention |
|---|---|---|---|---|---|---|
| **ElevenLabs Scribe v2** | да (тир «high», 5–10% WER) | да (тир «excellent», ≤5%) | да, до 32 спикеров | **$0.22** | 10 ч / 5 ГБ | ZRM только Enterprise; на данных не обучают |
| Yandex SpeechKit | да, нативный `kk-KZ` | лучший разговорный | да, ~8 спикеров | ~$0.5–0.9 | async 4 ч+ | резидентность RU/KZ |
| AssemblyAI Universal | да | да | да | $0.29 | ~10 ч | настраиваемый |
| Google Chirp 3 | нет | да | нет для RU/KK | ~$0.96 | 8 ч | — |
| Deepgram Nova-3 | нет | да | да | $0.26 | ~10 ч | — |
| OpenAI gpt-4o-transcribe | слабо | да | ограниченно | ~$0.36 | **25 МБ на файл** | 30 дней |

Scribe v2: `diarize=true`, `num_speakers` (подсказка), `timestamps_granularity=word`, `keyterms` до 1000 терминов (бренды, имена, жаргон агентства), `source_url` (presigned GET из нашего bucket), опционально `webhook=true`. Провайдер прячется за интерфейсом `SttProvider`; второй адаптер — Yandex SpeechKit для встреч преимущественно на казахском / требований резидентности.

Риск, проверяемый пилотом до фиксации провайдера: code-switching RU/KK/EN у Scribe не задокументирован, а разговорный казахский на телефоне «на столе» будет хуже бенчмарков. Пилот: 3–5 реальных записей ADV прогоняем через ElevenLabs, Yandex, AssemblyAI; меряем WER по казахским фрагментам и ошибки диаризации отдельно.

## Архитектура

```
 iOS (Swift)            [Android — следующий этап, тот же API]
      │  запись сегментами 5 мин в фоне и при блокировке (AAC 16 кГц mono 32–48 kbps ≈ 1.2–1.8 МБ/сегмент)
      │  PUT сегмента по presigned URL ещё во время встречи (URLSession background)
      ▼
 Railway Bucket `audio-temp` (S3-совместимый, приватный, presigned URLs, TTL 15 мин)
      │
 API (Node 22 + TS, Hono + zod-openapi, Better Auth, Drizzle) ── Postgres (Railway)
      │  POST /meetings/:id/finalize → pg-boss job `meeting.process`
      ▼
 Worker (тот же пакет, другой entrypoint; Docker с ffmpeg)
      1. скачать сегменты → ffmpeg concat → merged.m4a → bucket
      2. ElevenLabs Scribe v2 (source_url, diarize) → transcript → БД
      3. удалить все аудио-объекты встречи из bucket
      4. Claude claude-opus-5 (шаблон + контекст + транскрипт, structured output) → report → БД
      5. push (APNs / FCM) «Отчёт готов»
      cron: sweep аудио старше 48 ч, повтор зависших job
      ▼
 Приложение: SSE /meetings/:id/events (или polling) для прогресса; экспорт DOCX/PDF/MD рендерит сервер
```

Почему так:
- Воркер без лимита времени (в отличие от serverless) держит синхронный вызов Scribe (1–3 мин на часовую запись) и ffmpeg. Webhook-режим ElevenLabs оставляем как оптимизацию, не в MVP.
- Сегменты по 5 минут: страховка от краша/разряда (потеряется максимум 5 минут), почти всё загружено к концу встречи → отчёт через 3–5 минут после «Стоп».
- Один пакет `apps/server` с двумя entrypoints (`api`, `worker`) — общие схема БД, конфиг, типы; на Railway это два сервиса из одного Dockerfile с разными start-командами.

### Стек сервера

| Компонент | Выбор | Зачем |
|---|---|---|
| HTTP | Hono + `@hono/zod-openapi` | типизированные схемы, OpenAPI для генерации DTO под Swift/Kotlin |
| Auth | Better Auth: плагины `magic-link`, `bearer` (токен для мобилок), `organization` (холдинг → агентства → роли), `admin`; провайдеры Google и Apple через ID token (`signIn.social` с `idToken`) | самостоятельный auth без внешнего SaaS, мультитенантность из коробки |
| БД | Postgres (Railway) + Drizzle ORM + drizzle-kit миграции | — |
| Очередь | pg-boss (поверх Postgres, без Redis) | ретраи, backoff, cron, идемпотентность по `meeting_id` |
| Хранилище | Railway Buckets через `@aws-sdk/client-s3` (presigned PUT/GET, multipart для импорта больших файлов) | «всё на Railway»; запасной вариант — Cloudflare R2 (тот же S3 API) |
| Аудио | ffmpeg в Docker-образе воркера | склейка сегментов, нормализация в 16 кГц mono |
| STT | ElevenLabs API (`/v1/speech-to-text`, `model_id=scribe_v2`) за интерфейсом `SttProvider` | — |
| LLM | `@anthropic-ai/sdk`: `claude-opus-5`, streaming, `output_config.format` (JSON schema), `cache_control` на system, `fallbacks: "default"` (обработка refusal) | перед кодом прочитать `typescript/claude-api/README.md` из скилла claude-api |
| Email | Resend (magic link, рассылка отчётов) | единственный внешний сервис помимо AI |
| Push | APNs (token-based, `.p8`) + FCM HTTP v1 (`firebase-admin` только для push) | — |
| Экспорт | DOCX через `docx`, PDF через `pdfkit` + встроенный Noto Sans (кириллица), MD — из структурированного JSON отчёта | единый вид отчётов на обеих платформах |
| Логи/ошибки | pino + Sentry; таблица `usage` (секунды STT, токены, стоимость по встрече) | контроль бюджета |
| Локальная разработка | docker-compose: Postgres + MinIO (эмуляция bucket) | — |

## Модель данных (Postgres)

- `organizations` (холдинг) → `agencies` (8) → `users` / `members` (роль: `member` / `agency_admin` / `holding_admin`) — таблицы Better Auth `organization` + свои поля; `allowed_domains` на организации.
- `meeting_templates` — id, code, group (`internal` / `client` / `vendor` / `hr`), title, goal, color, common_fields[], specific_fields[] (label, hint, key), system_prompt, report_sections[] (key, heading, guidance), tips[], distribution_hint, sla_hours, confidentiality (`standard` / `restricted`), version, is_active, is_draft (для двух дописанных). Сид из Excel — скрипт `scripts/seed-templates.ts` парсит xlsx.
- `meetings` — owner_id, agency_id, template_id + template_version, title, started_at, ended_at, duration_sec, status (`recording` → `uploading` → `queued` → `processing` → `transcribing` → `summarizing` → `done` / `failed`), status_detail, context_fields jsonb, participants_hint jsonb, num_speakers_hint, language_hint, platform, confidentiality, markers jsonb (закладки с таймкодом и заметкой), source (`recorded` / `imported`), error.
- `audio_objects` — meeting_id, kind (`segment` / `merged` / `import`), seq, object_key, size_bytes, duration_sec, uploaded_at, deleted_at. Удаляются воркером; cron дочищает старше 48 ч.
- `transcripts` — meeting_id, provider, provider_request_id, languages[], full_text, segments jsonb (start, end, speaker_id, text), words jsonb (опционально), speakers jsonb (speaker_id → display_name, редактирует пользователь), stt_seconds, cost.
- `reports` — meeting_id, version, template_version, model, effort, sections jsonb (по структуре шаблона), action_items jsonb (assignee, task, deadline, done), decisions[], open_questions[], client_requests[], next_meeting jsonb, internal_only_keys[], missing_info[], markdown, input_tokens, output_tokens, cost, created_by (`pipeline` / `regenerate`).
- `shares` — meeting_id, recipient_email / user_id, scope (`report` / `report_transcript`), expires_at, created_by.
- `devices` — user_id, platform, push_token.
- `usage_events` — org/agency/user, meeting_id, kind (stt/llm/export), amount, cost_usd.
- `pgboss.*` — очередь.

Доступ (в коде API, единый слой `authorize()`): владелец видит свои встречи и расшаренные; `agency_admin` — встречи агентства кроме `restricted`; `holding_admin` — всё кроме `restricted`; `restricted` (HR, совещание «только для директоров») — только владелец и явные `shares`.

## API (основное)

- `POST /auth/*` — Better Auth (magic link, Google/Apple ID token, сессии bearer).
- `GET /templates` — активные шаблоны с полями и советами (кешируется в приложении).
- `POST /meetings` — создать (template, context_fields, hints) → `meeting_id`.
- `POST /meetings/:id/segments` → `{seq}` → presigned PUT URL; `POST /meetings/:id/segments/:seq/complete`.
- `POST /meetings/:id/imports` — multipart presigned URLs для импортированного файла.
- `POST /meetings/:id/finalize` — закрыть запись, поставить job.
- `GET /meetings`, `GET /meetings/:id` (транскрипт + последний отчёт), `GET /meetings/:id/events` (SSE прогресса).
- `PATCH /meetings/:id/speakers` — переименовать спикеров; `POST /meetings/:id/reports` — регенерация (другой шаблон / после правок / другой effort).
- `GET /meetings/:id/export?format=docx|pdf|md` — файл.
- `POST /meetings/:id/shares`, `DELETE /meetings/:id` (удаляет транскрипт/отчёт; аудио уже удалено).
- `POST /devices` — push-токен.
- Admin (Фаза 3): `GET/PUT /admin/templates`, `GET /admin/usage`, `GET/POST /admin/members`.

## Пайплайн (воркер, job `meeting.process`)

1. `merge`: скачать сегменты по порядку → `ffmpeg -f concat … -c:a aac -b:a 48k -ar 16000 -ac 1 merged.m4a` → загрузить в bucket → `audio_objects(kind=merged)`.
2. `transcribe`: presigned GET (TTL 2 ч) → `SttProvider.transcribe({ sourceUrl, diarize: true, numSpeakers, keyterms: [словарь агентства + участники из контекста], language: hint|auto })` → сохранить `transcripts`; статус `transcribing` → `summarizing`.
3. `purge_audio`: удалить все объекты встречи из bucket, проставить `deleted_at`. (Выполняется до саммари, чтобы аудио не пережило сбой LLM.)
4. `summarize`: собрать промпт → Claude → валидировать JSON → рендер markdown → `reports`; статус `done`.
5. `notify`: push + (Фаза 5) рассылка по списку из шпаргалки.
6. Каждый шаг идемпотентен (проверяет, что уже сделано), ретраи 3× с backoff; при финальном фейле — статус `failed` с понятным текстом и кнопка «Повторить» в приложении (аудио для повтора берётся с устройства, если ещё есть).
7. Cron: `audio.sweep` (каждый час, объекты старше 48 ч), `jobs.stuck` (встречи в `processing` дольше 30 мин → в очередь заново).

Целевое время: ≤5 мин от «Стоп» до отчёта для часовой встречи (upload хвоста ~10 с, merge ~30 с, Scribe 1–3 мин, Claude 30–90 с).

## Саммари в Claude (дизайн промпта)

- **System (кешируется `cache_control`, стабильный префикс)**: роль «ассистент медиа-агентства ADV», глобальные правила (только факты из транскрипта и контекста; не найденное → «не озвучено, уточнить»; цитаты дословно там, где просит шаблон; внутренние блоки помечать «не для клиента»; язык русский, термины/бренды не переводить; имена спикеров из карты спикеров, иначе «Спикер N»), затем структура и правила конкретного шаблона (разделы из Excel-промпта, советы переведены в инструкции: «два дедлайна», «светофор», «кто утвердил бриф»).
- **User**: метаданные (тип, дата, длительность, платформа), контекст, введённый пользователем, карта спикеров, закладки с таймкодами, транскрипт компактно `[мм:сс] Спикер 2: …`.
- **Structured output** (`output_config.format`, JSON schema): `title, summary, participants[], sections[] (в порядке шаблона), action_items[] {assignee, task, deadline, quote}, decisions[], open_questions[], client_requests[], next_meeting, internal_only_keys[], missing_info[]`.
- Markdown/DOCX/PDF рендерятся детерминированно из JSON по структуре шаблона (нумерация как в Excel) — единый вид отчётов холдинга.
- Стоимость: часовая встреча ≈ 25–30k входных токенов → ~$0.25 на Opus 5 (или ~$0.10 на Sonnet 5) + $0.22 STT ≈ **$0.5 за час встречи**.
- Фаза 3: eval-набор из 5–10 реальных транскриптов ADV с эталонными отчётами, LLM-judge по рубрике, подстройка промптов по шаблонам (скилл claude-api: `build-eval` / `hillclimb`).

## Мобильные приложения

UX iOS-приложения (UI на русском; тот же флоу позже повторяется на Android):
1. Список встреч (статус, тип, длительность; поиск; фильтр по типу/агентству).
2. «Новая запись» → экран 1: три карточки (🔴 Внутренняя / 🔵 С клиентом / 🟡 С вендором) + «недавние типы» → экран 2: подтипы с целью и советами (бейдж «конфиденциально» у HR / совещания) → экран 3 (пропускаемый): контекст встречи (клиент/проект, участники-чипсы, число спикеров, платформа, конфиденциальность) → «Начать запись».
3. Экран записи: таймер, индикатор уровня, пауза/продолжить, «Отметка» (закладка + заметка), стоп; запись продолжается при блокировке экрана и в фоне (Live Activity на экране блокировки); индикатор загрузки сегментов.
4. Экран обработки: статусы пайплайна в реальном времени; можно уйти — придёт push.
5. Экран встречи: вкладки «Отчёт» (разделы, чек-лист action items, кнопки «Экспорт», «Поделиться», «Регенерировать») и «Транскрипт» (по спикерам, переименование спикера, синхронное воспроизведение, если аудио ещё на устройстве).
6. Импорт файла через share sheet (Zoom/Teams/диктофон) → тот же флоу с выбором типа.
7. Настройки: хранение аудио на устройстве (удалять после отчёта / через 7 дней / вручную), аккаунт, выход.

### iOS (Swift 6, SwiftUI, iOS 17+) — единственный клиент первого этапа
- Запись: `AVAudioEngine` input tap → `AVAudioFile` AAC 16 кГц mono; ротация файла каждые 5 мин без остановки движка (закрываем один `AVAudioFile`, открываем следующий внутри tap-очереди); обработка `interruptionNotification` (звонок → пауза → авто-возобновление по `.shouldResume`) и смены маршрута (Bluetooth-гарнитура/AirPods).
- Загрузка: `URLSession` с background configuration, PUT сегмента на presigned URL, повтор при ошибке, продолжается при заблокированном экране и после ухода приложения в фон; multipart для импорта больших файлов.
- Хранение: SwiftData (встречи, сегменты, очередь загрузок, кеш шаблонов); токен в Keychain.
- Вход: `GoogleSignIn-iOS` и `AuthenticationServices` (Sign in with Apple) → ID token → API; magic link через Universal Links (AASA на домене API).
- Push: APNs (`UNUserNotificationCenter`).
- Воспроизведение: `AVPlayer` с подсветкой текущего сегмента транскрипта.
- Распространение: TestFlight для пилотной группы, затем App Store / Apple Business Manager.
- Проверка в разработке: iOS Simulator MCP (сборка, запуск, скриншоты, inspect), реальное устройство для фона/блокировки/прерываний.

#### Фоновая запись при заблокированном экране (обязательное требование)
Механика iOS, которую реализуем и проверяем:
- `UIBackgroundModes: audio` в Info.plist + `AVAudioSession` категория `.playAndRecord` (mode `.default`, options `[.mixWithOthers, .allowBluetooth]`), сессия активирована **до** ухода в фон; пока движок пишет звук, iOS не усыпляет процесс — так работают «Диктофон» и Plaud. `.mixWithOthers` снижает риск, что чужое воспроизведение прервёт нашу сессию.
- Файлы сегментов и хранилище SwiftData создаём с защитой `.completeUntilFirstUserAuthentication` (не `.complete`), иначе запись на диск при заблокированном экране упадёт.
- Live Activity (ActivityKit, iOS 17 интерактивные кнопки через App Intents) на экране блокировки и в Dynamic Island: таймер, индикатор «идёт запись», кнопки «Пауза» и «Стоп» — пользователь видит, что запись жива, не разблокируя телефон. Входит в iOS MVP.
- Восстановление: при прерывании (звонок, Siri, будильник) ставим паузу, по окончании возобновляем и пишем новый сегмент; при принудительном завершении процесса при следующем запуске находим незагруженные сегменты и дозагружаем; потеря ограничена одним 5-минутным сегментом.
- Ограничения, которые честно показываем пользователю: iOS не даёт стартовать запись из фона (только из открытого приложения); оранжевый индикатор микрофона в статус-баре — норма; во время телефонного звонка микрофон занят системой.
- Тесты на реальном устройстве (не симулятор): 60 мин с заблокированным экраном → все сегменты на месте и загружены; входящий звонок посреди записи → пауза/возобновление без потери предыдущих сегментов; режим энергосбережения; переключение на AirPods; убийство приложения из переключателя → сохранённые сегменты дозагружаются при следующем запуске.

### Android (следующий этап, не в этой сессии) — задел из исследования
`MediaRecorder` с `setMaxDuration` + `setNextOutputFile` (бесшовная ротация сегментов), foreground service `foregroundServiceType="microphone"` с уведомлением пауза/стоп, WorkManager для загрузки, Room/Hilt/Retrofit, Credential Manager для Google, App Links для magic link, FCM. Сервер и API от этого не меняются.

## Структура репозитория (папка проекта, монорепо, pnpm)

```
apps/server/            # Node 22 + TS: src/api (Hono), src/worker (pg-boss), src/db (Drizzle), src/pipeline, src/stt, src/llm, src/export, Dockerfile
apps/ios/               # Xcode проект, SwiftUI, SPM (единственный клиент первого этапа)
apps/admin/             # Фаза 3: веб-админка шаблонов и usage (React/Vite, отдельный сервис Railway)
                        # apps/android/ появится на следующем этапе
packages/shared/        # JSON schema отчёта, OpenAPI, сид шаблонов (templates.json из Excel), словари
infra/                  # docker-compose (Postgres, MinIO), railway.json, скрипты деплоя
docs/                   # этот план, ADR, промпты шаблонов, инструкции для ADV
scripts/                # seed-templates.ts (парсинг xlsx), e2e пайплайна на тестовом файле
```

## Статус (14 сентября 2026)

- ✅ Фаза 0 — монорепо, сервер, схема БД, 12 шаблонов из Excel, auth, Railway (Postgres + bucket + api + worker) задеплоен.
- ✅ Фаза 1 — пайплайн end-to-end проверен с заглушками провайдеров и с реальной загрузкой в Railway Bucket; экспорт DOCX/PDF/MD; SSE. Пилот STT на реальных записях — ждёт ключи ElevenLabs/Anthropic и записи ADV.
- ✅ Фаза 2 (основное) — iOS MVP собран и прогнан в симуляторе: вход, выбор типа, запись, Live Activity (стоп из Dynamic Island в фоне), фоновая загрузка, отчёт/транскрипт, экспорт. Не проверено на реальном устройстве: блокировка экрана 60 мин, звонок, AirPods. Push (APNs) — код есть, ключ `.p8` не задан.
- ✅ Ключи Anthropic / ElevenLabs / Resend / APNs заведены в Railway; реальный прогон пайплайна успешен (локально и в проде); Sign in with Apple работает нативно.
- ✅ Добавлено сверх плана: вкладка «Задачи» (живые action items, справочник ответственных холдинга, настройки сроков и напоминания), роли спикеров с нумерацией «Клиент N» и «Это я», выбор коллег из аккаунтов для шаринга, ручная правка текста отчёта перед экспортом, ИИ-правка по инструкциям с подсказками из контекста.
- ✅ TestFlight: билд 17 (0.1.0) загружен и обработан, внутренняя группа ADV Internal, приглашение получено. Репозиторий опубликован: https://github.com/glymskii/adv-meetings
- ⏳ Далее: чек-лист фоновой записи на устройстве (60 мин при блокировке, звонок, AirPods); пилот STT на реальных записях ADV; валидация двух черновых шаблонов; подтверждение домена ADV в Resend; сотрудники ADV в TestFlight (внешняя группа + Beta App Review).

## Фазы и результаты

| Фаза | Срок | Результат |
|---|---|---|
| **0. Фундамент** | нед. 1 | монорепо; Railway: Postgres, bucket, сервисы `api` и `worker`; схема + миграции; сид 12 шаблонов из Excel (2 дописанных помечены draft); Better Auth (magic link, Google, Apple, allowlist доменов); OpenAPI; docker-compose для локалки; CI (lint/test) |
| **1. Пайплайн end-to-end на сервере** | нед. 2–3 | загрузка файла через API → merge → Scribe → purge → Claude → отчёт → экспорт DOCX/PDF/MD; SSE статуса; push-заглушка; **пилот STT** на 3–5 реальных записях ADV (ElevenLabs vs Yandex vs AssemblyAI) → фиксация провайдера и `keyterms` |
| **2. iOS MVP** | нед. 3–6 | вход; выбор типа; **запись в фоне и при заблокированном экране** сегментами + Live Activity; загрузка; прогресс; отчёт + транскрипт; переименование спикеров; экспорт/шаринг; push; настройки хранения аудио; TestFlight |
| **3. Качество и паритет с Plaud (iOS)** | нед. 6–8 | импорт файлов через share sheet; регенерация по другому шаблону; «Спросить у AI» по транскрипту; поиск/папки; админка шаблонов и usage; eval-набор и подстройка промптов; пилот с 10–20 сотрудниками ADV, сбор правок к отчётам |
| **4. Android** | следующий этап, по решению ADV | Kotlin/Compose клиент на тот же API (задел — раздел «Android» выше) |
| **5. После пилота** | по решению ADV | SSO (SAML); авто-рассылка по списку «отправить кому» (e-mail/Telegram); календарь (авто-название и подсказка типа); режим «только на устройстве» для iOS 26 (HR/конфиденциальные); Yandex SpeechKit как второй провайдер; аналитика использования по агентствам |

Порядок внутри сессии разработки: Фаза 0 → Фаза 1 (сервер проверяем без мобилки, через скрипт с тестовым аудио) → Фаза 2 iOS. Прогресс трекается через TodoWrite, крупные куски — отдельными turn'ами.

## Верификация

- **Сервер**: vitest — рендер шаблонов, сборка промпта, JSON → markdown/DOCX/PDF (кириллица), авторизация (RLS-подобный слой), идемпотентность шагов; интеграционный `scripts/e2e-pipeline.ts`: тестовый файл (3-мин RU/KK запись) → полный пайплайн против реальных ElevenLabs/Anthropic (стоит центы) → проверка, что в bucket не осталось объектов, в БД есть транскрипт с ≥2 спикерами и отчёт со всеми разделами шаблона; замер времени на 60-мин файле (цель ≤5 мин).
- **iOS**: сборка и прогон в симуляторе через iOS Simulator MCP (скриншоты экранов, inspect дерева доступности); на реальном устройстве — чек-лист из раздела «Фоновая запись при заблокированном экране»: 60 мин с заблокированным экраном, входящий звонок посреди записи (пауза/возобновление, сегменты не теряются), энергосбережение, AirPods, убийство приложения (теряется ≤1 сегмент, остальные дозагружаются), выход в TestFlight.
- **Сквозной сценарий приёмки (критерий ADV №8)**: реальная 60-мин встреча → отчёт в приложении ≤5 мин → DOCX открывается в Word с кириллицей → в bucket пусто → в логах нет текста транскрипта.
- **Качество отчётов**: 5–10 транскриптов с эталонами от ADV, рубрика (полнота action items, отсутствие выдумок, соблюдение структуры), сравнение Opus 5 vs Sonnet 5 по качеству/стоимости.
- **Безопасность**: presigned URL с TTL 15 мин и привязкой к объекту; токены в Keychain/EncryptedSharedPreferences; `restricted` встречи недоступны admin'ам; удаление аккаунта удаляет данные.

## Стоимость эксплуатации (оценка)

| Статья | Оценка |
|---|---|
| Railway (Postgres + api + worker + bucket) | ~$25–40/мес |
| ElevenLabs Scribe v2 | $0.22 за час аудио |
| Claude Opus 5 | ~$0.25 за часовую встречу (Sonnet 5 ~ $0.10) |
| Resend, APNs/FCM, Sentry | ~$0–20/мес |
| При 200 часах встреч/мес по холдингу | ≈ $100–130/мес переменных + ~$50 фиксированных |

## Риски и как снимаем

- Казахский / code-switching у Scribe — пилот на реальных записях до фиксации; адаптер Yandex SpeechKit в запасе.
- Фоновая запись на iOS: единственные штатные причины остановки — прерывание системой (звонок/Siri) или принудительное завершение приложения; закрываем сегментами по 5 мин, авто-возобновлением и дозагрузкой при следующем запуске; проверяем чек-листом на реальном устройстве до TestFlight. (Для будущего Android отдельный риск — агрессивное энергосбережение Xiaomi/Huawei.)
- Railway Buckets: проверить presigned multipart и лимиты на Фазе 0; запасной вариант — Cloudflare R2 без изменения кода (S3 API).
- Качество отчётов по шаблонам — eval-цикл с ADV на Фазе 4; шаблоны правятся в БД без релиза.
- Два дописанных шаблона (Внутр-Продажи, Вендор-Брифинг) — помечены draft до валидации ADV.

## Что нужно от заказчика / для старта (не блокирует Фазу 0)

- Ключи: Anthropic API, ElevenLabs API (PAYG), Resend; авторизация Railway MCP или Railway CLI (`railway login`).
- Аккаунты для распространения: Apple Developer Program (APNs `.p8`, TestFlight, Sign in with Apple), Google Cloud OAuth client ID для Sign in with Google (iOS + web). Google Play Console и Firebase (FCM) понадобятся только на этапе Android.
- Домен для API (нужен для Universal Links / App Links и magic link).
- Список корпоративных доменов 8 агентств для allowlist.
- 3–5 реальных записей встреч (RU/KK/EN, 4+ участника) для пилота STT; 5–10 транскриптов с эталонными отчётами для eval.
- Валидация двух дописанных шаблонов; решение по срокам хранения транскриптов/отчётов и по необходимости Zero Retention контракта с ElevenLabs.
