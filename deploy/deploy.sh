#!/usr/bin/env bash
# Deploys one release on the production server:
# database backup -> pull images -> migrate -> swap containers -> health check -> roll back on failure.
#
# The release workflow calls it over SSH. The GitHub key in ~/.ssh/authorized_keys may run only this script
# (command="..."), so the requested version arrives in SSH_ORIGINAL_COMMAND and is the only input accepted.
# Manual use on the server:  bash deploy/deploy.sh v1.4.0
#
# Output ends up in public GitHub Actions logs (the repository is public): never print container logs or
# configuration here, write them to files on the server instead.
#
# The whole body sits in main(), called on the last line. Bash reads a script while running it, and the
# `git checkout` below replaces this file on disk; main() makes bash parse everything before it starts.

set -Eeuo pipefail
umask 077  # backups and logs hold personal data

main() {
  local version="${1:-${SSH_ORIGINAL_COMMAND:-}}"
  if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Usage: deploy.sh vX.Y.Z" >&2
    exit 2
  fi

  local app_dir
  app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$app_dir"
  trap 'echo "deploy.sh: failed at line $LINENO" >&2' ERR

  exec 9>"$app_dir/.deploy.lock"
  if ! flock --nonblock 9; then
    echo "Another deploy is running." >&2
    exit 1
  fi

  local previous=''
  [[ -f .deployed_version ]] && previous="$(<.deployed_version)"
  if [[ "$version" == "$previous" ]]; then
    echo "$version is already deployed."
    exit 0
  fi
  # Django rejects requests whose Host is not in ALLOWED_HOSTS, so the health check sends the real domain.
  HEALTH_HOST="$(grep -E '^DJANGO_ALLOWED_HOSTS=' .env | head -n 1 | cut -d= -f2- | tr -d "\"' " | cut -d, -f1)"
  mkdir -p backups logs

  log "Deploying $version (previous: ${previous:-none})"

  # The compose file and this script must match the images, so the server checks out the release tag.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Tracked files are modified on the server; commit or discard them first." >&2
    exit 1
  fi
  git fetch --quiet --force --tags origin
  git checkout --quiet --detach "refs/tags/$version"

  export APP_VERSION="$version"
  docker compose pull --quiet web frontend
  docker compose up --detach --no-build --wait db

  local backup="backups/db-$(date -u +%Y%m%dT%H%M%SZ)-before-$version.sql.gz"
  log "Database backup: $backup"
  docker compose exec -T db pg_dump -U ls_app -d lighterschedule_db --no-owner | gzip >"$backup.part"
  mv "$backup.part" "$backup"
  ls -1t backups/db-*.sql.gz | tail -n +15 | xargs --no-run-if-empty rm --

  # Before the swap: if a migration fails, the old version keeps serving. Migrations must stay
  # backward compatible (expand/contract), because the old code runs on the new schema for a moment.
  log "Migrating"
  docker compose run --rm --no-deps web python manage.py migrate --noinput

  log "Starting $version"
  docker compose up --detach --no-build web frontend

  if wait_healthy "$version"; then
    echo "$version" >.deployed_version
    docker image prune --force >/dev/null
    log "Deployed $version"
    return 0
  fi

  local logfile="logs/failed-$version-$(date -u +%Y%m%dT%H%M%SZ).log"
  docker compose logs --no-color --tail=200 web frontend >"$logfile" 2>&1 || true
  log "Health check failed for $version; container logs on the server: $logfile"

  if [[ -n "$previous" ]]; then
    log "Rolling back to $previous"
    git checkout --quiet --detach "refs/tags/$previous"
    export APP_VERSION="$previous"
    docker compose pull --quiet web frontend || true
    docker compose up --detach --no-build web frontend
    if wait_healthy "$previous"; then
      log "Rolled back to $previous"
    else
      log "ROLLBACK FAILED: the site may be down, check the server now"
    fi
  else
    log "No previous release recorded, nothing to roll back to"
  fi
  log "Migrations are not reverted. Backup taken before this deploy: $backup"
  exit 1
}

# Healthy = the API reports this exact version with a working database, and the frontend answers.
wait_healthy() {
  local want="$1" body
  for _ in $(seq 1 30); do
    body="$(curl --fail --silent --max-time 3 \
      -H "Host: $HEALTH_HOST" -H 'X-Forwarded-Proto: https' \
      http://127.0.0.1:8000/api/health/ || true)"
    if [[ "$body" == *"\"status\":\"ok\""* && "$body" == *"\"version\":\"$want\""* ]] &&
      curl --fail --silent --max-time 3 --output /dev/null http://127.0.0.1:3000/; then
      return 0
    fi
    sleep 2
  done
  return 1
}

log() {
  echo "[$(date -u +%H:%M:%S)] $*"
}

main "$@"
