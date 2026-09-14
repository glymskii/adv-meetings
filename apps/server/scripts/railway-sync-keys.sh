#!/usr/bin/env bash
# Переносит ключи API из apps/server/.env в оба сервиса Railway (api, worker) и перезапускает их.
# Использование: pnpm --filter @adv/server env:railway
set -euo pipefail
cd "$(dirname "$0")/../../.."   # корень репозитория (там railway link)

ENV_FILE="apps/server/.env"
[ -f "$ENV_FILE" ] || { echo "Нет $ENV_FILE"; exit 1; }

get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^"//; s/"$//'; }

ARGS=()
# APNs: ключ из файла .p8 → одна строка с \n (в Railway многострочные значения неудобны)
P8="$(get APNS_PRIVATE_KEY_FILE)"
if [ -n "$P8" ] && [ -f "$P8" ]; then
  ARGS+=("APNS_PRIVATE_KEY=$(awk 'BEGIN{ORS="\\n"} {print}' "$P8")")
  echo "  APNS_PRIVATE_KEY: из файла $P8"
fi
for KEY in ANTHROPIC_API_KEY ELEVENLABS_API_KEY RESEND_API_KEY EMAIL_FROM ALLOWED_EMAIL_DOMAINS APNS_KEY_ID APNS_TEAM_ID APNS_BUNDLE_ID APNS_PRODUCTION; do
  VAL="$(get "$KEY")"
  if [ -n "$VAL" ]; then
    ARGS+=("$KEY=$VAL")
    echo "  $KEY: ${VAL:0:6}… (${#VAL} символов)"
  else
    echo "  $KEY: пусто — пропускаю"
  fi
done

[ ${#ARGS[@]} -gt 0 ] || { echo "Нечего переносить"; exit 1; }

for SERVICE in api worker; do
  echo "→ railway variable set … --service $SERVICE"
  railway variable set "${ARGS[@]}" --service "$SERVICE" --skip-deploys >/dev/null
done
echo "→ перезапуск сервисов"
railway service redeploy --service api --yes >/dev/null 2>&1 || railway redeploy --service api --yes >/dev/null
railway service redeploy --service worker --yes >/dev/null 2>&1 || railway redeploy --service worker --yes >/dev/null
echo "Готово. Проверка: railway variable list --service worker | grep -E 'ANTHROPIC|ELEVENLABS|RESEND'"
