#!/bin/sh
# Builds the current checkout and (re)starts it on this host at 127.0.0.1:11120.
set -eu
cd "$(dirname "$0")/.."

# Commit SHA when there is one, so the running image names its source.
if tag=$(git rev-parse --short=12 HEAD 2>/dev/null); then
  git diff --quiet HEAD -- . && [ -z "$(git ls-files --others --exclude-standard)" ] || tag="$tag-dirty"
else
  tag="uncommitted-$(date +%Y%m%d%H%M%S)"
fi

if [ ! -f deploy/.env ]; then
  (umask 077 && printf 'APP_PASSWORD=%s\n' "$(openssl rand -base64 18 | tr -d '/+=')" > deploy/.env)
  echo "Created deploy/.env with a random APP_PASSWORD"
fi

docker build --tag "focus-dashboard:$tag" --tag focus-dashboard:latest .
IMAGE_TAG="$tag" docker compose -f deploy/compose.yml up --detach --wait --wait-timeout 60
curl -fsS http://127.0.0.1:11120/api/health
echo
echo "Deployed focus-dashboard:$tag"
