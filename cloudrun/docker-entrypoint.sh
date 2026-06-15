#!/bin/sh
# Render nginx.conf from the template, substituting ONLY ${PROXY_TOKEN} (the shared secret set in
# the 微信云托管 console) — all other $vars are left intact for nginx to evaluate at runtime. Then
# validate and start nginx. Fails fast with a clear message if PROXY_TOKEN isn't set, so a
# mis-deploy can't silently ship an empty token (which Azure would 403).
set -e

: "${PROXY_TOKEN:?PROXY_TOKEN env var is required — set it in the 微信云托管 console (服务配置 → 环境变量)}"

envsubst '${PROXY_TOKEN}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
nginx -t
exec nginx -g 'daemon off;'
