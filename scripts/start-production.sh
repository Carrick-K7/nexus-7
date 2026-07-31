#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
password_file="${NEXUS7_DB_PASSWORD_FILE:-/deploy/nexus-7/shared/db-password}"
db_host="${NEXUS7_DB_HOST:-127.0.0.1}"
db_port="${NEXUS7_DB_PORT:-55433}"
db_name="${NEXUS7_DB_NAME:-nexus7}"
db_user="${NEXUS7_DB_USER:-nexus7}"
release_revision_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.deploy-sha"

if [[ ! -r "${password_file}" ]]; then
  echo "Database password file is not readable: ${password_file}" >&2
  exit 1
fi

db_password="$(tr -d '\r\n' < "${password_file}")"
export DATABASE_URL="postgresql://${db_user}:${db_password}@${db_host}:${db_port}/${db_name}"
if [[ -r "${release_revision_file}" ]]; then
  export NEXUS_RELEASE_REVISION
  NEXUS_RELEASE_REVISION="$(tr -d '\r\n' < "${release_revision_file}")"
fi

case "${mode}" in
  web)
    exec npm run start -- -H "${HOSTNAME:-127.0.0.1}" -p "${PORT:-3220}"
    ;;
  worker)
    exec npm run worker:symbiosis
    ;;
  migrate)
    exec npm run db:migrate
    ;;
  *)
    echo "Usage: $0 {web|worker|migrate}" >&2
    exit 2
    ;;
esac
