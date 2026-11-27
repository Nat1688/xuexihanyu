#!/usr/bin/env bash
# Ship the COMMITTED, PUSHED HEAD to the homelab as a new release directory.
# Usage: deploy/homelab/ship.sh <release-name>
#   env XUEXI_SSH_TARGET (required: nam@<homelab Tailscale address>), XUEXI_SSH_KEY (default ~/.ssh/id_ed25519_xuexihanyu)
# Ships `git archive` output only: ignored files, worktrees, node_modules, dist and .env never leave the workstation.
set -euo pipefail
die() { echo "STOP: $*" >&2; exit 1; }
NAME=${1:-}; [[ $NAME =~ ^[a-z0-9][a-z0-9.-]{3,80}$ ]] || die "release name must match [a-z0-9][a-z0-9.-]{3,80}"
TARGET=${XUEXI_SSH_TARGET:?set XUEXI_SSH_TARGET=nam@<homelab Tailscale address>}
KEY=${XUEXI_SSH_KEY:-$HOME/.ssh/id_ed25519_xuexihanyu}
cd "$(git rev-parse --show-toplevel)"
git diff --quiet && git diff --cached --quiet || die "working tree has uncommitted changes"
SHA=$(git rev-parse HEAD); BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch --quiet origin "$BRANCH"
[ "$(git rev-parse "origin/$BRANCH")" = "$SHA" ] || die "HEAD $SHA is not exactly origin/$BRANCH; push first"
DIR=/home/nam/apps/xuexihanyu-releases/$NAME
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes "$TARGET")
# LF everywhere: identical bytes no matter which OS ships it.
# The release dir stays 0700 (umask 077); sources inside keep normal git modes (umask 022) so files that
# reach images unchanged (e.g. apps/web/public/*) stay readable by non-root runtime users.
git -c core.autocrlf=false -c core.eol=lf archive --format=tar --prefix=src/ "$SHA" \
  |"${SSH[@]}" "set -e; umask 077; test ! -e '$DIR'; mkdir '$DIR'; umask 022; tar -x -C '$DIR'"
printf '{"commit":"%s","branch":"%s","shippedAt":"%s"}\n' "$SHA" "$BRANCH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  | "${SSH[@]}" "cat > '$DIR/src/RELEASE-SOURCE.json'"
echo "SHIPPED $SHA -> $TARGET:$DIR"
echo "Next: ${SSH[*]} python3 $DIR/src/deploy/homelab/release.py preflight $DIR --expect-web <id> --expect-api <id>"
