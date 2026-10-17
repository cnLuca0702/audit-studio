# Audit Studio 独立仓库镜像。
# 构建上下文为本仓库根目录：docker compose build
# Pi SDK 改用 npm 发布版（@earendil-works/* 0.76.0），不再依赖同级 pi-mono 源码。

FROM --platform=linux/amd64 node:22-alpine AS base

FROM base AS builder
WORKDIR /app

# 先只拷贝依赖清单并 npm ci，充分利用层缓存
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NEXT_FONT_GOOGLE_MOCKED=1
# playwright 仅是遗留依赖（代码未使用），跳过其 postinstall 浏览器下载
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

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

# pi SDK 配置为 serverExternalPackages，运行时动态 require，
# standalone 产物追踪可能遗漏，因此整份 node_modules 一并带入。
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /out ./

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER root

EXPOSE 8286

ENTRYPOINT ["/docker-entrypoint.sh"]
