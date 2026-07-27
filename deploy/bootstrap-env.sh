#!/bin/sh
set -eu

cd "$(dirname "$0")"
umask 077

if [ ! -f .env.source ]; then
  echo "deploy/.env.source is required" >&2
  exit 1
fi

# shellcheck disable=SC1091
. ./.env.source

random_secret() {
  openssl rand -hex 32
}

cat >.env <<EOF
APP_ORIGIN=https://interview.andrihari.my.id
APP_PORT=8081
PG_DATABASE=interviewai
PG_USER=interviewai
PG_PASSWORD=$(random_secret)
JWT_ACCESS_SECRET=$(random_secret)
JWT_REFRESH_SECRET=$(random_secret)
GEMINI_API_KEY=${GEMINI_API_KEY}
GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.1-flash-live-preview}
GEMINI_ANALYSIS_MODEL=${GEMINI_ANALYSIS_MODEL:-gemini-2.5-flash}
ACCESS_TOKEN_TTL=${ACCESS_TOKEN_TTL:-15m}
REFRESH_TOKEN_TTL=${REFRESH_TOKEN_TTL:-7d}
CV_MAX_SIZE_MB=${CV_MAX_SIZE_MB:-5}
EOF

chmod 600 .env
rm -f .env.source
echo "Production environment created."
