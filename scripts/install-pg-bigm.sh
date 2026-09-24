#!/usr/bin/env bash
#
# Build and install the pg_bigm extension into the local PostgreSQL 17.
#
# Production gets pg_bigm from Dockerfile.db. This script is the macOS /
# Homebrew equivalent for local development: run it once per machine, before
# running database migrations. The migration itself creates the extension and
# the index; this only puts the extension files where PostgreSQL can find them.
set -euo pipefail

PG_BIGM_VERSION="v1.2-20250903"
PG_BIGM_SHA256="4d4fb48161e3f9e99207851299379c83b3e5d1d3c1a07c35f6a3153d577b3142"

log() { printf '[pg-bigm] %s\n' "$*"; }
die() { printf '[pg-bigm] error: %s\n' "$*" >&2; exit 1; }

# Locate pg_config for PostgreSQL 17. Prefer the Homebrew keg, since a bare
# pg_config on PATH may belong to a different major version.
if [ -n "${PG_CONFIG:-}" ]; then
  :
elif command -v brew >/dev/null 2>&1 && brew --prefix postgresql@17 >/dev/null 2>&1; then
  PG_CONFIG="$(brew --prefix postgresql@17)/bin/pg_config"
elif command -v pg_config >/dev/null 2>&1; then
  PG_CONFIG="$(command -v pg_config)"
else
  die "pg_config not found. Install PostgreSQL 17 first: brew install postgresql@17"
fi
[ -x "$PG_CONFIG" ] || die "pg_config is not executable: $PG_CONFIG"

case "$("$PG_CONFIG" --version)" in
  *" 17."*) ;;
  *) die "pg_bigm here is pinned to PostgreSQL 17, but $PG_CONFIG reports: $("$PG_CONFIG" --version)" ;;
esac
log "using $PG_CONFIG ($("$PG_CONFIG" --version))"

SHAREDIR="$("$PG_CONFIG" --sharedir)"
PKGLIBDIR="$("$PG_CONFIG" --pkglibdir)"

if [ -f "$SHAREDIR/extension/pg_bigm.control" ] && { [ -f "$PKGLIBDIR/pg_bigm.so" ] || [ -f "$PKGLIBDIR/pg_bigm.dylib" ]; }; then
  log "pg_bigm is already installed (found $SHAREDIR/extension/pg_bigm.control)"
  exit 0
fi

command -v make >/dev/null 2>&1 || die "make not found. Install the Xcode command line tools: xcode-select --install"
command -v curl >/dev/null 2>&1 || die "curl not found"

if command -v sha256sum >/dev/null 2>&1; then
  SHA256_CHECK=(sha256sum -c -)
elif command -v shasum >/dev/null 2>&1; then
  SHA256_CHECK=(shasum -a 256 -c -)
else
  die "neither sha256sum nor shasum is available, cannot verify the download"
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

TARBALL="$WORKDIR/pg_bigm.tar.gz"
log "downloading pg_bigm $PG_BIGM_VERSION"
curl -fsSL "https://github.com/pgbigm/pg_bigm/archive/refs/tags/${PG_BIGM_VERSION}.tar.gz" -o "$TARBALL"

log "verifying checksum"
printf '%s  %s\n' "$PG_BIGM_SHA256" "$TARBALL" | "${SHA256_CHECK[@]}" >/dev/null \
  || die "checksum mismatch — refusing to build"

tar xzf "$TARBALL" -C "$WORKDIR"
SRCDIR="$(find "$WORKDIR" -maxdepth 1 -type d -name 'pg_bigm-*' | head -n 1)"
[ -n "$SRCDIR" ] || die "unexpected tarball layout: no pg_bigm-* directory"

log "building"
make -C "$SRCDIR" USE_PGXS=1 PG_CONFIG="$PG_CONFIG"

log "installing into $SHAREDIR and $PKGLIBDIR"
make -C "$SRCDIR" USE_PGXS=1 PG_CONFIG="$PG_CONFIG" install

log "done. Next: npm run db:migrate"
