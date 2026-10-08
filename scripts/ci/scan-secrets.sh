#!/usr/bin/env bash
set -euo pipefail

# Official standalone CLI: no paid action license, service upload, or API token.
# Upgrade the version and independently verified release-asset digest together.
version=8.30.1
sha256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'This CI installer supports Linux x86_64; install the official Gitleaks CLI for other platforms.' >&2
  exit 1
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl --fail --silent --show-error --location --retry 3 --max-time 120 \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz" \
  --output "$work/gitleaks.tar.gz"
printf '%s  %s\n' "$sha256" "$work/gitleaks.tar.gz" | sha256sum --check --status
tar -xzf "$work/gitleaks.tar.gz" -C "$work" gitleaks
"$work/gitleaks" version
# All fetched refs and complete history; redact potential secrets in logs.
"$work/gitleaks" git --no-banner --redact --log-opts=--all .
