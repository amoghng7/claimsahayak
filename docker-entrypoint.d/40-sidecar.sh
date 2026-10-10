#!/bin/sh
# Start the ClaimSahayak sidecar (Vertex AI proxy, see server/) alongside nginx.
# Runs inside the official nginx entrypoint before nginx starts; the sidecar
# binds 127.0.0.1 only — unreachable except through the nginx proxy.
# If it crashes, /api/* answers 502 JSON while the SPA keeps serving.
set -e
node /app/server/index.js &
