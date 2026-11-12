#!/bin/sh
# Append the build-time analytics origin to script-src and connect-src.
# Empty NEXT_PUBLIC_ANALYTICS_SRC leaves Cloudflare Web Analytics and same-origin.
set -eu
CONF=/etc/nginx/snippets/security-headers.conf
SRC=${NEXT_PUBLIC_ANALYTICS_SRC:-}
if [ -z "$SRC" ] || [ ! -f "$CONF" ]; then
  exit 0
fi
ORIGIN=$(printf '%s' "$SRC" | sed -nE 's#^(https?://[A-Za-z0-9._:-]+)([/?#].*)?$#\1#p')
if [ -z "$ORIGIN" ]; then
  echo "analytics CSP: NEXT_PUBLIC_ANALYTICS_SRC is not an http(s) URL; CSP unchanged" >&2
  exit 0
fi
if grep -qF "$ORIGIN" "$CONF"; then
  exit 0
fi
sed -i "s#script-src 'self' 'unsafe-inline'#script-src 'self' 'unsafe-inline' ${ORIGIN}#" "$CONF"
sed -i "s#connect-src 'self'#connect-src 'self' ${ORIGIN}#" "$CONF"
