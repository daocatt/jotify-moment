FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx -y esbuild src/db/migrate.ts --bundle --platform=node --target=node22 --outfile=src/db/migrate.js
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

FROM node:22-alpine AS runner
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

RUN mkdir -p public/uploads && chmod 755 public/uploads

EXPOSE 3000

CMD ["sh", "-c", "node src/db/migrate.js && node server.js"]
