# Build from AIAgent repo root:
#   docker build -f projects/AuditStudio/Dockerfile .

FROM --platform=linux/amd64 node:22-alpine AS base

FROM base AS builder
WORKDIR /app

COPY pi-mono ./pi-mono
WORKDIR /app/pi-mono
RUN npm install --ignore-scripts --production

WORKDIR /app
COPY projects/AuditStudio/ .
RUN rm -f package-lock.json \
  && sed -i 's|file:../../pi-mono/|file:./pi-mono/|g' package.json \
  && npm install --ignore-scripts

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NEXT_FONT_GOOGLE_MOCKED=1

RUN npx next build \
  && mkdir -p /out \
  && SERVER_JS="$(find .next/standalone -name server.js ! -path '*/node_modules/*' -exec wc -c {} + | sort -n | tail -1 | awk '{print $2}')" \
  && test -n "$SERVER_JS" \
  && SERVER_DIR="$(dirname "$SERVER_JS")" \
  && cp -a "$SERVER_DIR"/. /out/ \
  && cp -a public /out/public \
  && mkdir -p /out/.next \
  && cp -a .next/static /out/.next/static

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8286
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /home/nextjs/.pi /home/nextjs/sessions \
  && chown -R nextjs:nodejs /home/nextjs

COPY --from=builder --chown=nextjs:nodejs /app/pi-mono ./pi-mono
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /out ./

COPY projects/AuditStudio/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER root

EXPOSE 8286

ENTRYPOINT ["/docker-entrypoint.sh"]
