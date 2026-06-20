#!/bin/sh
set -e

for dir in /home/nextjs/.pi /home/nextjs/sessions; do
  if [ -e "$dir" ]; then
    chown -R nextjs:nodejs "$dir"
    chmod -R u+rwX,g+rwX "$dir"
  else
    mkdir -p "$dir"
    chown -R nextjs:nodejs "$dir"
    chmod -R u+rwX,g+rwX "$dir"
  fi
done

exec su nextjs -s /bin/sh -c "cd /app && exec node server.js"
