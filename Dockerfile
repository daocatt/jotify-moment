
# ⚠️ 基础镜像钉到**补丁号**，不用 node:22-alpine 这种浮动 tag：
#    - 浮动 tag 每次 build 拉到的补丁版本不同，"同一份代码两次构建"不可复现；
#    - 安全补丁要到**下次重建镜像**才生效，钉住之后至少一眼能看出当前跑的是哪个补丁。
#    升级时对照 https://nodejs.org/en/blog/vulnerability 的公告，
#    并同步改 .github/workflows/deploy.yml 的 node-version 与下方 esbuild --target。
#    当前：24.22.1（2026-10-21 安全版本，24.x 线修 4 个 high + 4 个 medium）
FROM node:24.22.1-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx -y esbuild src/db/migrate.ts --bundle --platform=node --target=node24 --outfile=src/db/migrate.js
RUN npx -y esbuild src/db/cleanup.ts --bundle --platform=node --target=node24 --outfile=src/db/cleanup.js
RUN npx -y esbuild src/db/backfill-tags.ts --bundle --platform=node --target=node24 --outfile=src/db/backfill-tags.js
ENV NEXT_TELEMETRY_DISABLED=1
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ARG BETTER_AUTH_SECRET="build-placeholder-do-not-use-in-production"
ARG BETTER_AUTH_URL="http://localhost:3000"
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ARG NEXT_PUBLIC_GA_ID=""
ENV DATABASE_URL=$DATABASE_URL
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID
RUN npm run build

FROM node:24.22.1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Asia/Shanghai

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/db/migrations ./src/db/migrations
COPY --from=builder /app/src/db/migrate.js ./src/db/migrate.js
COPY --from=builder /app/src/db/cleanup.js ./src/db/cleanup.js
COPY --from=builder /app/src/db/backfill-tags.js ./src/db/backfill-tags.js

RUN mkdir -p public/uploads && chmod 750 public/uploads

EXPOSE 3000

CMD ["sh", "-c", "node src/db/migrate.js && node src/db/cleanup.js && node src/db/backfill-tags.js && node server.js"]
