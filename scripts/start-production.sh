#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
case "$mode" in web|worker|research|authorize-research|migrate) ;; *) echo "Usage: $0 {web|worker|research|authorize-research|migrate}" >&2; exit 2;; esac
shift
if [[ "$mode" == worker && -e /etc/carrick/nexus7/city-retired.json ]]; then
  echo "The archived city writer is disabled by the operator retirement record." >&2
  exit 1
fi
if [[ "$mode" == authorize-research && "$(id -u)" != 0 ]]; then
  echo "Research authorization requires the local operator boundary." >&2
  exit 1
fi
password_file="${NEXUS7_DB_PASSWORD_FILE:-/deploy/nexus-7/shared/db-password}"
export NEXUS7_DB_HOST="${NEXUS7_DB_HOST:-127.0.0.1}"
export NEXUS7_DB_PORT="${NEXUS7_DB_PORT:-55433}"
export NEXUS7_DB_NAME="${NEXUS7_DB_NAME:-nexus7}"
export NEXUS7_DB_USER="${NEXUS7_DB_USER:-nexus7}"
release_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release_revision_file="$release_root/.deploy-sha"
if [[ ! -r "$password_file" ]]; then
  echo "Required database credential is unavailable." >&2
  exit 1
fi
# The private value is read only by the startup process and never printed or passed in argv.
db_password="$(tr -d '\r\n' < "$password_file")"
export DATABASE_URL
DATABASE_URL="$(NEXUS7_DB_PASSWORD="$db_password" node -e 'const u=new URL("postgresql://localhost"); u.hostname=process.env.NEXUS7_DB_HOST; u.port=process.env.NEXUS7_DB_PORT; u.username=process.env.NEXUS7_DB_USER; u.password=process.env.NEXUS7_DB_PASSWORD; u.pathname="/"+process.env.NEXUS7_DB_NAME; process.stdout.write(u.toString())')"
unset db_password
if [[ -r "$release_revision_file" ]]; then
  export NEXUS_RELEASE_REVISION
  NEXUS_RELEASE_REVISION="$(tr -d '\r\n' < "$release_revision_file")"
fi

case "$mode" in
  web) exec npm run start -- -H "${HOSTNAME:-127.0.0.1}" -p "${PORT:-3220}" ;;
  worker) exec npm run worker:symbiosis -- "$@" ;;
  research) exec npm run worker:research -- "$@" ;;
  authorize-research) exec node --import tsx "$release_root/scripts/authorize-research.ts" "$@" ;;
  migrate) exec npm run db:migrate ;;
esac
