#!/bin/sh
set -eu

base_url="${BASE_URL:?Set BASE_URL to the deployed HTTPS URL.}"

for attempt in $(seq 1 90); do
  live_status="$(curl --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' "$base_url/api/health/live" || true)"
  ready_status="$(curl --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' "$base_url/api/health/ready" || true)"

  if [ "$live_status" = "200" ] && [ "$ready_status" = "200" ]; then
    echo "Deployment health checks passed for $base_url"
    exit 0
  fi

  echo "Waiting for deployment health (attempt $attempt/90; live=$live_status ready=$ready_status)..."
  sleep 10
done

echo "Deployment health checks failed after 15 minutes (live=$live_status ready=$ready_status)." >&2
exit 1
