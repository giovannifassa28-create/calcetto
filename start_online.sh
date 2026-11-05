#!/usr/bin/env bash
# ==============================================================================
# CALCETTO FUT MANAGER - SCRIPT DI AVVIO ONLINE (CLOUDFLARE TUNNEL)
# ==============================================================================

cd "$(dirname "$0")"

PYTHON_BIN="/Users/gio/.anaconda-desktop/micromamba/envs/assistant/bin/python"
if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

echo "⚽ Avvio del server Calcetto FUT..."
$PYTHON_BIN server.py &
sleep 2

echo "🌐 Avvio del tunnel Cloudflare ufficiale..."
./bin/cloudflared tunnel --url http://localhost:8000
