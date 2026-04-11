#!/bin/bash
# SplitGasto 2026 - Deploy directo a Cloudflare Pages
# Ejecuta este script con tu API Token de Cloudflare
# Uso: CF_API_TOKEN="tu_token" bash DEPLOY.sh

set -e

CF_ACCOUNT_ID="34b0bbd5db590a69edbb901b768ebccc"
PROJECT_NAME="splitgasto"

if [ -z "$CF_API_TOKEN" ]; then
  echo "❌ ERROR: Define CF_API_TOKEN primero"
  echo "   export CF_API_TOKEN='tu_cloudflare_api_token'"
  echo "   Crea uno en: https://dash.cloudflare.com/profile/api-tokens"
  echo "   Plantilla: Edit Cloudflare Workers"
  exit 1
fi

echo "=== Preparando archivos del sitio ==="
mkdir -p /tmp/sg-deploy
cp -r _headers _redirects *.html *.svg *.png *.json engine icons sw.js /tmp/sg-deploy/ 2>/dev/null || true
echo "✅ Archivos: $(find /tmp/sg-deploy -type f | wc -l) ($(du -sh /tmp/sg-deploy | cut -f1))"

echo "=== Desplegando a Cloudflare Pages ==="
CLOUDFLARE_API_TOKEN="$CF_API_TOKEN" \
CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID" \
npx wrangler pages deploy /tmp/sg-deploy \
  --project-name="$PROJECT_NAME" \
  --commit-dirty=true

echo "✅ Deploy completado — https://splitgasto.pages.dev"
