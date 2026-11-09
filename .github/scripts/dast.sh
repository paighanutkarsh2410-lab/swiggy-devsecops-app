#!/usr/bin/env bash
# Dynamic application security testing (DAST): starts the images CI just
# built with Docker Compose, then runs the OWASP ZAP baseline scan against
# the customer app and the partner console.
#
# The baseline scan crawls each site (including the JavaScript-driven pages,
# with ZAP's AJAX spider) and passively checks every response: security
# headers, cookies, information leaks, error pages and more. It does not
# attack the app. Any alert that .github/dast/rules.tsv does not explicitly
# ignore fails the build.
#
# Usage: dast.sh <image-tag>
# Needs BACKEND_IMAGE, FRONTEND_IMAGE and PARTNER_IMAGE (image names without
# a tag). Reports are written to ./zap-reports.
set -euo pipefail

export IMAGE_TAG="${1:?image tag required}"
: "${BACKEND_IMAGE:?}" "${FRONTEND_IMAGE:?}" "${PARTNER_IMAGE:?}"

# ZAP 2.17.0, pinned by digest.
ZAP_IMAGE="ghcr.io/zaproxy/zaproxy:2.17.0@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af"
COMPOSE=(docker compose -f docker-compose.yml -f .github/dast/docker-compose.dast.yml)
REPORTS="$PWD/zap-reports"

# Throwaway secrets for this run only.
( umask 077
  {
    echo "DB_PASSWORD=$(openssl rand -hex 16)"
    echo "JWT_SECRET=$(openssl rand -hex 32)"
  } > .env )

cleanup() {
  "${COMPOSE[@]}" logs --no-color > "$REPORTS/compose.log" 2>&1 || true
  "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
  rm -f .env
}
mkdir -p "$REPORTS"
trap cleanup EXIT

docker pull -q "$ZAP_IMAGE" >/dev/null &
"${COMPOSE[@]}" up -d --no-build --wait --wait-timeout 180
wait

# ZAP runs as a non-root user and writes its reports into the mounted folder.
chmod 777 "$REPORTS"
cp .github/dast/rules.tsv "$REPORTS/"

status=0
scan() {
  local name="$1" url="$2" code=0
  echo "::group::ZAP baseline scan: $name ($url)"
  docker run --rm --network host -v "$REPORTS:/zap/wrk:rw" "$ZAP_IMAGE" \
    zap-baseline.py -t "$url" -j -m 2 -c rules.tsv \
      -r "$name.html" -J "$name.json" -w "$name.md" || code=$?
  echo "::endgroup::"
  case "$code" in
    0) echo "$name: no alerts" ;;
    1) echo "::error::ZAP found failing alerts on the $name ($url); see the zap-reports artifact"; status=1 ;;
    2) echo "::error::ZAP found alerts on the $name ($url) that rules.tsv does not ignore; see the zap-reports artifact"; status=1 ;;
    *) echo "::error::ZAP could not complete the scan of the $name (exit $code)"; status=1 ;;
  esac
}

scan customer-app http://localhost:8080
scan partner-console http://localhost:8082

exit "$status"
