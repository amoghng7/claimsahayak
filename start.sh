#!/bin/sh
# ClaimSahayak container startup: sidecar first (Vertex AI proxy, 127.0.0.1:8081),
# then the official nginx entrypoint (envsubst templates) with nginx as PID 1.
# The health wait makes a missing/crashed sidecar visible in Cloud Run logs at
# startup instead of as later 502s.
set -e

node /app/server/index.js &

healthy=0
for i in 1 2 3 4 5; do
  if wget -q -O /dev/null http://127.0.0.1:8081/healthz 2>/dev/null; then
    echo "start.sh: sidecar healthy on 127.0.0.1:8081"
    healthy=1
    break
  fi
  echo "start.sh: waiting for sidecar ($i)"
  sleep 1
done
if [ "$healthy" = "0" ]; then
  echo "start.sh: WARNING sidecar not healthy after 5s — /api/* will 502"
fi

exec /docker-entrypoint.sh nginx -g 'daemon off;'
