#!/bin/sh
set -eu

base_url="${BASE_URL:?Set BASE_URL to the deployed HTTPS URL.}"

live_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$base_url/api/health/live")"
ready_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$base_url/api/health/ready")"

if [ "$live_status" != "200" ]; then
  echo "Liveness check failed with HTTP $live_status" >&2
  exit 1
fi

if [ "$ready_status" != "200" ]; then
  echo "Readiness check failed with HTTP $ready_status" >&2
  exit 1
fi

echo "Deployment health checks passed for $base_url"
